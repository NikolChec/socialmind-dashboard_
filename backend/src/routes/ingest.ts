import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../db/schema.js';
import type { ServerIngestPayload } from '@socialmind/shared';
import { notifyPsychologist } from '../services/notifications.js';
import { broadcastToUser } from '../services/events.js';
import { writeSnapshotForChild } from '../services/risk_snapshot.js';

export const ingestRouter = Router();

const INGEST_KEY = process.env.INGEST_KEY || 'dev-ingest-key';

const payloadSchema = z.object({
  child_id: z.string(),
  session_id: z.string(),
  scenario: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
  scenario_success: z.boolean(),
  metrics: z.object({
    response_latency_avg_ms: z.number(),
    talk_time_ratio: z.number(),
    word_count: z.number(),
    unique_words: z.number(),
    sentiment_score: z.number(),
  }),
  transcript: z.array(
    z.object({
      speaker: z.enum(['ai', 'child']),
      text: z.string(),
      ts: z.string(),
    })
  ),
  alerts: z.array(
    z.object({
      priority: z.enum(['high', 'medium', 'low']),
      type: z.string(),
      excerpt: z.string(),
      context: z.string(),
    })
  ),
  ai_character_name: z.string(),
});

ingestRouter.post('/session', (req, res) => {
  if (req.headers['x-ingest-key'] !== INGEST_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', detail: parsed.error.flatten() });
  }
  const p = parsed.data as ServerIngestPayload;

  const duration = Math.max(
    0,
    Math.round((new Date(p.ended_at).getTime() - new Date(p.started_at).getTime()) / 1000)
  );

  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions
      (id, child_id, scenario, started_at, ended_at, duration_sec,
       scenario_success, completed, metrics_json, transcript_json, ai_character_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAlert = db.prepare(`
    INSERT INTO alerts
      (id, child_id, session_id, priority, type, excerpt, context, created_at, acknowledged_at, acknowledged_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
  `);

  const insertedAlertIds: Array<{ id: string; priority: string; excerpt: string }> = [];
  const tx = db.transaction(() => {
    insertSession.run(
      p.session_id,
      p.child_id,
      p.scenario,
      p.started_at,
      p.ended_at,
      duration,
      p.scenario_success ? 1 : 0,
      1,
      JSON.stringify(p.metrics),
      JSON.stringify(p.transcript),
      p.ai_character_name
    );
    for (const a of p.alerts) {
      const id = crypto.randomUUID();
      insertAlert.run(id, p.child_id, p.session_id, a.priority, a.type, a.excerpt, a.context, p.ended_at);
      insertedAlertIds.push({ id, priority: a.priority, excerpt: a.excerpt });
    }
  });
  tx();

  const child = db
    .prepare(
      `SELECT c.display_name, c.psychologist_id FROM children c WHERE c.id = ?`
    )
    .get(p.child_id) as { display_name: string; psychologist_id: string } | undefined;

  if (child) {
    for (const a of insertedAlertIds) {
      broadcastToUser(child.psychologist_id, {
        type: 'new_alert',
        priority: a.priority as 'high' | 'medium' | 'low',
        child_id: p.child_id,
        child_name: child.display_name,
        excerpt: a.excerpt,
        alert_id: a.id,
        created_at: p.ended_at,
      });
      if (a.priority === 'high' || a.priority === 'medium') {
        void notifyPsychologist({
          psychologist_id: child.psychologist_id,
          child_id: p.child_id,
          child_name: child.display_name,
          severity: a.priority,
          excerpt: a.excerpt,
          alert_id: a.id,
        });
      }
    }
  }

  try { writeSnapshotForChild(p.child_id, new Date(p.ended_at)); } catch { /* noop */ }

  res.json({ ok: true });
});
