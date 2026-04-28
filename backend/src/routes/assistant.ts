import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/schema.js';
import { requireAuth, psychologistCanAccessChild } from '../middleware/auth.js';
import { chatWithOllama } from '../services/ollama.js';
import type { ChatMessage } from '@socialmind/shared';

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

const bodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  child_id: z.string().optional(),
});

function buildChildContext(childId: string): string {
  const child = db
    .prepare(`SELECT display_name, grade, notes FROM children WHERE id = ?`)
    .get(childId) as { display_name: string; grade: number; notes: string } | undefined;
  if (!child) return '';

  const sessions = db
    .prepare(
      `SELECT started_at, scenario, scenario_success, duration_sec, metrics_json
       FROM sessions WHERE child_id = ? ORDER BY started_at DESC LIMIT 10`
    )
    .all(childId) as Array<{
    started_at: string;
    scenario: string;
    scenario_success: number;
    duration_sec: number;
    metrics_json: string;
  }>;

  const alerts = db
    .prepare(
      `SELECT priority, type, excerpt, created_at, acknowledged_at
       FROM alerts WHERE child_id = ? ORDER BY created_at DESC LIMIT 10`
    )
    .all(childId) as Array<{
    priority: string;
    type: string;
    excerpt: string;
    created_at: string;
    acknowledged_at: string | null;
  }>;

  const sessionLines = sessions.map((s) => {
    const m = JSON.parse(s.metrics_json);
    return `- ${s.started_at.slice(0, 10)} | ${s.scenario} | success=${s.scenario_success ? 'yes' : 'no'} | latency=${m.response_latency_avg_ms}ms | talk=${(m.talk_time_ratio * 100).toFixed(0)}% | sentiment=${m.sentiment_score.toFixed(2)}`;
  });

  const alertLines = alerts.map(
    (a) => `- [${a.priority}] ${a.type} (${a.acknowledged_at ? 'ack' : 'open'}): "${a.excerpt}"`
  );

  return [
    `You are assisting a psychologist reviewing a child in the SocialMind program.`,
    `Child: ${child.display_name}, grade ${child.grade}.`,
    `Notes: ${child.notes || 'none'}.`,
    ``,
    `Recent sessions (most recent first):`,
    sessionLines.join('\n') || '- none',
    ``,
    `Recent alerts:`,
    alertLines.join('\n') || '- none',
    ``,
    `Be concise, clinical, and factual. If data is thin, say so. Do not invent details.`,
  ].join('\n');
}

function buildCaseloadContext(userId: string, role: string, schoolId: string): string {
  const children =
    role === 'school_admin'
      ? (db
          .prepare(`SELECT id, display_name, grade FROM children WHERE school_id = ?`)
          .all(schoolId) as Array<{ id: string; display_name: string; grade: number }>)
      : (db
          .prepare(
            `SELECT id, display_name, grade FROM children WHERE psychologist_id = ?`
          )
          .all(userId) as Array<{ id: string; display_name: string; grade: number }>);

  const counts = children.map((c) => {
    const openAlerts = db
      .prepare(
        `SELECT COUNT(*) AS n FROM alerts WHERE child_id = ? AND acknowledged_at IS NULL`
      )
      .get(c.id) as { n: number };
    const lastSession = db
      .prepare(
        `SELECT started_at FROM sessions WHERE child_id = ? ORDER BY started_at DESC LIMIT 1`
      )
      .get(c.id) as { started_at: string } | undefined;
    return `- ${c.display_name} (grade ${c.grade}) | open alerts: ${openAlerts.n} | last session: ${lastSession?.started_at.slice(0, 10) ?? 'never'}`;
  });

  return [
    `You are assisting a ${role === 'school_admin' ? 'school administrator' : 'psychologist'} in the SocialMind program.`,
    `Caseload overview:`,
    counts.join('\n') || '- no children assigned',
    ``,
    `Answer based only on the data above unless explicitly told otherwise.`,
  ].join('\n');
}

assistantRouter.post('/chat', async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const { messages, child_id } = parsed.data;
  const { id: userId, role, school_id } = req.auth!;

  let systemPrompt: string;
  if (child_id) {
    if (!psychologistCanAccessChild(userId, child_id, role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    systemPrompt = buildChildContext(child_id);
  } else {
    systemPrompt = buildCaseloadContext(userId, role, school_id);
  }

  const full: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];

  try {
    const reply = await chatWithOllama(full);
    res.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    res.status(502).json({
      error: 'assistant_unavailable',
      detail: msg,
      hint: 'Is Ollama running? Start with: ollama serve  (and make sure OLLAMA_MODEL is installed)',
    });
  }
});
