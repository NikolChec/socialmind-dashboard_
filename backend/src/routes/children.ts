import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/schema.js';
import { requireAuth, psychologistCanAccessChild } from '../middleware/auth.js';
import { computeChildrenForScope } from '../services/analytics.js';
import { auditFor, getUserName } from '../services/audit.js';
import type { Child, ChildAppEvent, CompanionActivitySummary, ProgressPoint, RiskSnapshotPoint, ScenarioBreakdown, Session, TranscriptMatch } from '@socialmind/shared';

export const childrenRouter = Router();

childrenRouter.use(requireAuth);

childrenRouter.get('/', (req, res) => {
  const { id, role, school_id } = req.auth!;
  const rows = computeChildrenForScope({ role, userId: id, schoolId: school_id });
  rows.sort((a, b) => b.risk_score - a.risk_score || a.display_name.localeCompare(b.display_name));
  res.json(rows);
});

childrenRouter.get('/:id', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const child = db
    .prepare(
      `SELECT c.*, u.name AS psychologist_name
       FROM children c JOIN users u ON u.id = c.psychologist_id WHERE c.id = ?`
    )
    .get(childId) as Child | undefined;
  if (!child) return res.status(404).json({ error: 'not_found' });
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'viewed_child', resource_type: 'child', resource_id: childId, child_id: childId,
  });
  res.json({ ...child, is_sensitive: !!(child as unknown as { is_sensitive: number }).is_sensitive });
});

const sensitiveSchema = z.object({ is_sensitive: z.boolean() });
childrenRouter.patch('/:id/sensitivity', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (role !== 'school_admin') return res.status(403).json({ error: 'admin_only' });
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = sensitiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  db.prepare(`UPDATE children SET is_sensitive = ? WHERE id = ?`).run(parsed.data.is_sensitive ? 1 : 0, childId);
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: parsed.data.is_sensitive ? 'marked_sensitive' : 'unmarked_sensitive',
    resource_type: 'child', resource_id: childId, child_id: childId,
  });
  res.json({ ok: true });
});

childrenRouter.get('/:id/companion-activity', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const lastLogin = db
    .prepare(
      `SELECT created_at FROM child_app_events WHERE child_id = ? AND type = 'login' ORDER BY created_at DESC LIMIT 1`
    )
    .get(childId) as { created_at: string } | undefined;

  const totalLogins = (db
    .prepare(`SELECT COUNT(*) AS n FROM child_app_events WHERE child_id = ? AND type = 'login'`)
    .get(childId) as { n: number }).n;

  const missionsCompleted = (db
    .prepare(`SELECT COUNT(*) AS n FROM child_missions WHERE child_id = ? AND completed_at IS NOT NULL`)
    .get(childId) as { n: number }).n;

  const missionsOpen = (db
    .prepare(`SELECT COUNT(*) AS n FROM child_missions WHERE child_id = ? AND completed_at IS NULL`)
    .get(childId) as { n: number }).n;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const helper30 = (db
    .prepare(`SELECT COUNT(*) AS n FROM child_helper_messages WHERE child_id = ? AND created_at >= ?`)
    .get(childId, since) as { n: number }).n;

  const recentMissions = db
    .prepare(
      `SELECT id, title, completed_at, child_reflection, xp FROM child_missions
       WHERE child_id = ? AND completed_at IS NOT NULL
       ORDER BY completed_at DESC LIMIT 8`
    )
    .all(childId) as Array<{ id: string; title: string; completed_at: string; child_reflection: string | null; xp: number }>;

  const recentHelper = db
    .prepare(
      `SELECT id, role, content, created_at FROM child_helper_messages
       WHERE child_id = ? ORDER BY created_at DESC LIMIT 12`
    )
    .all(childId) as Array<{ id: string; role: 'child' | 'helper'; content: string; created_at: string }>;

  const recentEvents = (db
    .prepare(
      `SELECT id, child_id, type, payload_json, created_at FROM child_app_events
       WHERE child_id = ? ORDER BY created_at DESC LIMIT 25`
    )
    .all(childId) as Array<{ id: string; child_id: string; type: string; payload_json: string | null; created_at: string }>)
    .map<ChildAppEvent>((r) => ({
      id: r.id,
      child_id: r.child_id,
      type: r.type as ChildAppEvent['type'],
      payload: r.payload_json ? (JSON.parse(r.payload_json) as Record<string, unknown>) : null,
      created_at: r.created_at,
    }));

  const out: CompanionActivitySummary = {
    last_login_at: lastLogin?.created_at ?? null,
    total_logins: totalLogins,
    missions_completed: missionsCompleted,
    missions_open: missionsOpen,
    helper_messages_30d: helper30,
    recent_completed_missions: recentMissions,
    recent_helper_messages: recentHelper.reverse(),
    recent_events: recentEvents,
  };
  res.json(out);
});

childrenRouter.get('/:id/risk-history', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const rows = db
    .prepare(
      `SELECT snapshot_date AS date, risk_score, unread_high, unread_medium, unread_low, sentiment_avg
       FROM risk_snapshots WHERE child_id = ? ORDER BY snapshot_date ASC`
    )
    .all(childId) as RiskSnapshotPoint[];
  res.json(rows);
});

childrenRouter.get('/:id/transcript-search', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return res.json([]);

  const rows = db
    .prepare(
      `SELECT id, scenario, started_at, transcript_json FROM sessions
       WHERE child_id = ? AND lower(transcript_json) LIKE lower(?) ORDER BY started_at DESC`
    )
    .all(childId, `%${q}%`) as Array<{ id: string; scenario: string; started_at: string; transcript_json: string }>;

  const needle = q.toLowerCase();
  const matches: TranscriptMatch[] = rows.map((r) => {
    const transcript = JSON.parse(r.transcript_json) as Array<{ speaker: 'ai' | 'child'; text: string; ts: string }>;
    const snippets = transcript.filter((t) => t.text.toLowerCase().includes(needle)).slice(0, 5);
    return {
      session_id: r.id,
      scenario: r.scenario as TranscriptMatch['scenario'],
      started_at: r.started_at,
      snippets,
    };
  }).filter((m) => m.snippets.length > 0);

  res.json(matches);
});

childrenRouter.get('/:id/sessions', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const rows = db
    .prepare(
      `SELECT id, child_id, scenario, started_at, ended_at, duration_sec,
              scenario_success, completed, metrics_json, transcript_json, ai_character_name, notes
       FROM sessions WHERE child_id = ? ORDER BY started_at DESC`
    )
    .all(childId) as Array<{
    id: string;
    child_id: string;
    scenario: string;
    started_at: string;
    ended_at: string;
    duration_sec: number;
    scenario_success: number;
    completed: number;
    metrics_json: string;
    transcript_json: string;
    ai_character_name: string;
    notes: string | null;
  }>;

  const hideNotes = role === 'parent';
  const sessions: Session[] = rows.map((r) => ({
    id: r.id,
    child_id: r.child_id,
    scenario: r.scenario as Session['scenario'],
    started_at: r.started_at,
    ended_at: r.ended_at,
    duration_sec: r.duration_sec,
    scenario_success: !!r.scenario_success,
    completed: !!r.completed,
    metrics: JSON.parse(r.metrics_json),
    transcript: JSON.parse(r.transcript_json),
    ai_character_name: r.ai_character_name,
    notes: hideNotes ? '' : (r.notes ?? ''),
  }));
  res.json(sessions);
});

childrenRouter.get('/:id/scenario-breakdown', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const rows = db
    .prepare(
      `SELECT scenario, COUNT(*) AS attempts, SUM(scenario_success) AS successes
       FROM sessions WHERE child_id = ? GROUP BY scenario`
    )
    .all(childId) as Array<{ scenario: string; attempts: number; successes: number }>;
  const breakdown: ScenarioBreakdown[] = rows
    .map((r) => ({
      scenario: r.scenario as ScenarioBreakdown['scenario'],
      attempts: r.attempts,
      successes: r.successes,
      success_rate: r.attempts > 0 ? +(r.successes / r.attempts).toFixed(3) : 0,
    }))
    .sort((a, b) => a.success_rate - b.success_rate);
  res.json(breakdown);
});

const notesSchema = z.object({ notes: z.string().max(5000) });
childrenRouter.patch('/:childId/sessions/:sessionId/notes', (req, res) => {
  const { id: userId, role } = req.auth!;
  if (role === 'parent') return res.status(403).json({ error: 'read_only' });
  const { childId, sessionId } = req.params;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = notesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const exists = db
    .prepare(`SELECT 1 FROM sessions WHERE id = ? AND child_id = ?`)
    .get(sessionId, childId);
  if (!exists) return res.status(404).json({ error: 'not_found' });
  db.prepare(`UPDATE sessions SET notes = ? WHERE id = ?`).run(parsed.data.notes, sessionId);
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'added_notes', resource_type: 'session', resource_id: sessionId, child_id: childId,
  });
  res.json({ ok: true });
});

childrenRouter.get('/:id/progress', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const rows = db
    .prepare(
      `SELECT started_at, scenario_success, metrics_json FROM sessions
       WHERE child_id = ? ORDER BY started_at ASC`
    )
    .all(childId) as Array<{ started_at: string; scenario_success: number; metrics_json: string }>;

  const byDay = new Map<
    string,
    { latency: number[]; talk: number[]; success: number[]; sentiment: number[] }
  >();

  for (const r of rows) {
    const day = r.started_at.slice(0, 10);
    const m = JSON.parse(r.metrics_json);
    const bucket =
      byDay.get(day) ?? { latency: [], talk: [], success: [], sentiment: [] };
    bucket.latency.push(m.response_latency_avg_ms);
    bucket.talk.push(m.talk_time_ratio);
    bucket.success.push(r.scenario_success ? 1 : 0);
    bucket.sentiment.push(m.sentiment_score);
    byDay.set(day, bucket);
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const progress: ProgressPoint[] = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      response_latency_avg_ms: Math.round(avg(b.latency)),
      talk_time_ratio: +avg(b.talk).toFixed(3),
      scenario_success_rate: +avg(b.success).toFixed(3),
      sentiment_score: +avg(b.sentiment).toFixed(3),
    }));

  res.json(progress);
});

childrenRouter.get('/:id/alerts', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const rows = db
    .prepare(`SELECT * FROM alerts WHERE child_id = ? ORDER BY created_at DESC`)
    .all(childId);
  res.json(rows);
});
