// Custom LLM endpoint for ConvAI. Speaks the OpenAI Chat Completions streaming API,
// so you can paste this URL into ConvAI's character "Custom LLM Endpoint" field.
//
// Pipeline per request:
//   1. Auth via X-Convai-Key (must match CONVAI_API_KEY in .env)
//   2. Safety check on the kid's last message → if critical/high → log alert, return safe placeholder
//   3. PII redaction → opaque ids
//   4. Stream from Ollama (Mac Studio) with stream:true
//   5. Buffer tokens until sentence boundary; safety-check each sentence
//   6. Restore opaque ids → real names BEFORE sending to ConvAI for TTS
//   7. Persist anonymized turns to vr_turns
//
// The safety-and-redact pass is what differentiates this from a naive proxy.

import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/schema.js';
import { checkSafety, safetyAction } from '../services/safety.js';
import { newRedactionMap, redactInput, restoreOutput, type SessionRedactionMap } from '../services/redaction.js';

export const convaiRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_VR_MODEL || process.env.OLLAMA_MODEL || 'aya-expanse:8b';
const CONVAI_API_KEY = process.env.CONVAI_API_KEY || '';

// In-process redaction maps per VR session. Lost on restart, which is fine —
// PII never persists; only opaque ids do.
const sessionMaps = new Map<string, SessionRedactionMap>();
function getMap(sessionId: string): SessionRedactionMap {
  let m = sessionMaps.get(sessionId);
  if (!m) {
    m = newRedactionMap();
    sessionMaps.set(sessionId, m);
  }
  return m;
}

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

const bodySchema = z.object({
  model: z.string().optional(),
  messages: z.array(messageSchema).min(1),
  stream: z.boolean().optional(),
  // Custom: ConvAI passes session id through extra params; we also accept it in headers.
  session_id: z.string().optional(),
  child_id: z.string().optional(),
});

// Auth middleware — required for every endpoint here.
convaiRouter.use((req, res, next) => {
  if (!CONVAI_API_KEY) return res.status(503).json({ error: 'convai_not_configured' });
  const presented = req.header('x-convai-key') || (req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  if (presented !== CONVAI_API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
});

convaiRouter.post('/llm', async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', detail: parsed.error.message });

  const { messages, child_id } = parsed.data;
  const sessionId = parsed.data.session_id || (req.header('x-session-id') ?? 'anon');
  const map = getMap(sessionId);

  // ── Step 1: safety on the kid's most recent USER message ──────────────────
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (lastUser) {
    const inSafety = checkSafety(lastUser.content);
    const action = safetyAction(inSafety);

    // Always log severity > safe
    if (inSafety.severity !== 'safe') {
      try {
        db.prepare(
          `INSERT INTO vr_alerts (id, session_id, child_id, severity, categories, phrase, raw, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          sessionId,
          child_id ?? null,
          inSafety.severity,
          inSafety.categories.join(','),
          inSafety.matchedPhrases.join(' | '),
          lastUser.content.slice(0, 500),
          Date.now()
        );
      } catch {
        /* table may not exist if schema migration hasn't run yet */
      }
    }

    if (action === 'block') {
      return streamPlainResponse(res, "I hear you. Let's pause and tell a grown-up you trust about this. I'm here.");
    }
  }

  // ── Step 2: redact PII in the messages we forward to the LLM ──────────────
  const redactedMessages = messages.map((m) => ({
    role: m.role,
    content: m.role === 'user' ? redactInput(m.content, map) : m.content,
  }));

  // ── Step 3: persist anonymized incoming turn ──────────────────────────────
  if (lastUser) {
    try {
      db.prepare(
        `INSERT INTO vr_turns (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), sessionId, 'user', redactInput(lastUser.content, map), Date.now());
    } catch { /* schema not migrated yet */ }
  }

  // ── Step 4: stream from Ollama with sentence-level safety + restore ───────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const completionId = `chatcmpl-${crypto.randomBytes(8).toString('hex')}`;
  const created = Math.floor(Date.now() / 1000);
  const sendChunk = (delta: string, finish: 'stop' | null = null) => {
    const payload = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model: OLLAMA_MODEL,
      choices: [{ index: 0, delta: delta ? { content: delta } : {}, finish_reason: finish }],
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages: redactedMessages, stream: true }),
    });
    if (!upstream.ok || !upstream.body) {
      sendChunk(`(AI brain unreachable — please try again)`);
      sendChunk('', 'stop');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    let sentenceBuffer = '';
    let assembled = ''; // for storing the full assistant turn at the end
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let leftover = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      leftover += decoder.decode(value, { stream: true });
      const lines = leftover.split('\n');
      leftover = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let chunk: { message?: { content?: string }; done?: boolean };
        try { chunk = JSON.parse(line); } catch { continue; }
        const piece = chunk.message?.content ?? '';
        if (!piece) continue;
        sentenceBuffer += piece;
        assembled += piece;

        // Release on sentence boundary so safety can check + restore names per sentence.
        const m = sentenceBuffer.match(/^([\s\S]*?[.!?…־。])(\s+|$)/);
        if (m) {
          const sentence = m[1];
          sentenceBuffer = sentenceBuffer.slice(m[0].length);
          const safe = checkSafety(sentence);
          if (safetyAction(safe) === 'block') {
            sendChunk(' [filtered] ');
          } else {
            sendChunk(restoreOutput(sentence + (m[2] || ''), map));
          }
        }
      }
    }

    // Flush whatever is left.
    if (sentenceBuffer) {
      const safe = checkSafety(sentenceBuffer);
      if (safetyAction(safe) !== 'block') {
        sendChunk(restoreOutput(sentenceBuffer, map));
      }
    }

    // Persist anonymized assistant turn
    try {
      db.prepare(
        `INSERT INTO vr_turns (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), sessionId, 'assistant', assembled, Date.now());
    } catch { /* schema not migrated yet */ }

    sendChunk('', 'stop');
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    sendChunk(`(error: ${err instanceof Error ? err.message : 'unknown'})`);
    sendChunk('', 'stop');
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Helper: respond non-streaming with a single safe message (used when the input is blocked).
function streamPlainResponse(res: Response, text: string) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders?.();
  const id = `chatcmpl-${crypto.randomBytes(8).toString('hex')}`;
  const created = Math.floor(Date.now() / 1000);
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: OLLAMA_MODEL, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: OLLAMA_MODEL, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

// Convenience non-streaming endpoint for context fetch — ConvAI can call this BEFORE a conversation
// to grab the kid's profile + recent helper context.
convaiRouter.get('/context', (req, res) => {
  const childId = String(req.query.child_id ?? '');
  if (!childId) return res.status(400).json({ error: 'child_id required' });

  const child = db.prepare(
    `SELECT id, display_name, grade, COALESCE(preferred_lang,'en') as preferred_lang FROM children WHERE id = ?`
  ).get(childId) as { id: string; display_name: string; grade: number; preferred_lang: string } | undefined;
  if (!child) return res.status(404).json({ error: 'child_not_found' });

  let recent: Array<{ role: string; content: string }> = [];
  try {
    recent = db.prepare(
      `SELECT role, content FROM child_helper_messages WHERE child_id = ? ORDER BY created_at DESC LIMIT 8`
    ).all(childId) as Array<{ role: string; content: string }>;
  } catch { /* table may not exist */ }

  res.json({
    child_name: child.display_name,
    grade: child.grade,
    preferred_lang: child.preferred_lang,
    recent_helper_context: recent.reverse(),
    do_not_say: [
      'medical or psychiatric diagnoses',
      'personal contact info',
      'anything that frightens the child',
    ],
  });
});
