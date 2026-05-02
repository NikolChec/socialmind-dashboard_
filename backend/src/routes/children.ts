import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/schema.js';
import { requireAuth, psychologistCanAccessChild, canSeePrivateFromParents, teacherHasPermission } from '../middleware/auth.js';
import { computeChildrenForScope } from '../services/analytics.js';
import { auditFor, getUserName } from '../services/audit.js';
import type { Child, ChildAppEvent, ChildMissionWithMeta, CompanionActivitySummary, MissionRequest, ProgressPoint, RiskSnapshotPoint, ScenarioBreakdown, Session, TranscriptMatch } from '@socialmind/shared';
import crypto from 'node:crypto';
import { extractTriggerPhrases, literalFragmentsFromMessage, saveLearnedPatterns, stemTriggersFromMessage } from '../services/safety_learn.js';
import type { SafetyCategory, SafetySeverity } from '../services/safety.js';

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

  const hidePrivate = !canSeePrivateFromParents(role);
  const privateClause = hidePrivate ? 'AND private_from_parents = 0' : '';

  const recentMissions = db
    .prepare(
      `SELECT id, title, completed_at, child_reflection, xp FROM child_missions
       WHERE child_id = ? AND completed_at IS NOT NULL ${privateClause}
       ORDER BY completed_at DESC LIMIT 8`
    )
    .all(childId) as Array<{ id: string; title: string; completed_at: string; child_reflection: string | null; xp: number }>;

  // Teachers must have an approved 'helper_chats' permission to see message previews;
  // parents see only non-private messages; psychologists/admins see everything.
  const teacherBlocked = role === 'teacher' && !teacherHasPermission(userId, childId, 'helper_chats');
  const recentHelper = teacherBlocked
    ? []
    : (db
        .prepare(
          `SELECT id, role, content, created_at FROM child_helper_messages
           WHERE child_id = ? ${privateClause} ORDER BY created_at DESC LIMIT 12`
        )
        .all(childId) as Array<{ id: string; role: 'child' | 'helper'; content: string; created_at: string }>);

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
  if (role === 'teacher' && !teacherHasPermission(userId, childId, 'sessions')) {
    return res.status(403).json({ error: 'permission_required', scope: 'sessions' });
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

// Helper chats grouped into sessions (gap > 30 min = new session).
// Returns: { child_name, sessions: [{ started_at, ended_at, flags: [...], messages: [...] }] }
childrenRouter.get('/:id/helper-chats', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (role === 'teacher' && !teacherHasPermission(userId, childId, 'helper_chats')) {
    return res.status(403).json({ error: 'permission_required', scope: 'helper_chats' });
  }

  const child = db.prepare(`SELECT display_name FROM children WHERE id = ?`).get(childId) as { display_name: string } | undefined;
  if (!child) return res.status(404).json({ error: 'not_found' });

  const hidePrivate = !canSeePrivateFromParents(role);
  const privateClause = hidePrivate ? 'AND private_from_parents = 0' : '';
  const rows = db
    .prepare(
      `SELECT id, role, content, flags, created_at FROM child_helper_messages
       WHERE child_id = ? ${privateClause} ORDER BY created_at ASC`
    )
    .all(childId) as Array<{ id: string; role: 'child' | 'helper'; content: string; flags: string | null; created_at: string }>;

  type Msg = { id: string; role: 'child' | 'helper'; content: string; flags: { severity: string; categories: string[]; phrases: string[] } | null; created_at: string };
  type Session = { started_at: string; ended_at: string; flags: { severity: string; categories: string[] }; messages: Msg[] };

  const sessions: Session[] = [];
  const GAP_MS = 30 * 60 * 1000;
  let current: Session | null = null;

  const SEV_RANK: Record<string, number> = { safe: 0, low: 1, medium: 2, high: 3, critical: 4 };

  for (const r of rows) {
    const msgFlags = r.flags ? JSON.parse(r.flags) : null;
    const msg: Msg = { id: r.id, role: r.role, content: r.content, flags: msgFlags, created_at: r.created_at };
    const tsMs = Date.parse(r.created_at);
    if (!current || tsMs - Date.parse(current.ended_at) > GAP_MS) {
      current = {
        started_at: r.created_at,
        ended_at: r.created_at,
        flags: { severity: 'safe', categories: [] },
        messages: [],
      };
      sessions.push(current);
    }
    current.ended_at = r.created_at;
    current.messages.push(msg);
    if (msgFlags) {
      if ((SEV_RANK[msgFlags.severity] ?? 0) > (SEV_RANK[current.flags.severity] ?? 0)) {
        current.flags.severity = msgFlags.severity;
      }
      for (const c of msgFlags.categories ?? []) {
        if (!current.flags.categories.includes(c)) current.flags.categories.push(c);
      }
    }
  }

  // Newest session first
  sessions.reverse();

  res.json({
    child_name: child.display_name,
    sessions,
  });
});

childrenRouter.get('/:id/sessions', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (role === 'teacher' && !teacherHasPermission(userId, childId, 'sessions')) {
    return res.status(403).json({ error: 'permission_required', scope: 'sessions' });
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

  const hideNotes = role === 'parent' || role === 'teacher';
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
  if (role === 'parent' || role === 'teacher') return res.status(403).json({ error: 'read_only' });
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
  if (role === 'teacher' && !teacherHasPermission(userId, childId, 'alerts')) {
    return res.status(403).json({ error: 'permission_required', scope: 'alerts' });
  }
  const rows = db
    .prepare(`SELECT * FROM alerts WHERE child_id = ? ORDER BY created_at DESC`)
    .all(childId);
  res.json(rows);
});

// ---------- Missions management (psychologist/admin) ----------

interface MissionRowFull {
  id: string;
  child_id: string;
  title: string;
  description: string;
  source_scenario: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  xp: number;
  assigned_at: string;
  due_date: string | null;
  completed_at: string | null;
  child_reflection: string | null;
  private_from_parents: number;
  assigned_by: string | null;
  source: 'auto' | 'psychologist' | 'parent_request';
  assigned_by_name: string | null;
}

childrenRouter.get('/:id/missions', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (role === 'teacher' && !teacherHasPermission(userId, childId, 'missions')) {
    return res.status(403).json({ error: 'permission_required', scope: 'missions' });
  }
  const hidePrivate = !canSeePrivateFromParents(role);
  const privateClause = hidePrivate ? 'AND m.private_from_parents = 0' : '';

  const rows = db
    .prepare(
      `SELECT m.*, u.name AS assigned_by_name
       FROM child_missions m
       LEFT JOIN users u ON u.id = m.assigned_by
       WHERE m.child_id = ? ${privateClause}
       ORDER BY (m.completed_at IS NOT NULL) ASC, m.assigned_at DESC
       LIMIT 100`
    )
    .all(childId) as MissionRowFull[];

  const out: ChildMissionWithMeta[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    source_scenario: (r.source_scenario as ChildMissionWithMeta['source_scenario']) ?? null,
    difficulty: r.difficulty,
    xp: r.xp,
    assigned_at: r.assigned_at,
    due_date: r.due_date,
    completed_at: r.completed_at,
    child_reflection: r.child_reflection,
    assigned_by: r.assigned_by,
    assigned_by_name: r.assigned_by_name,
    source: r.source,
    private_from_parents: !!r.private_from_parents,
  }));
  res.json(out);
});

const newMissionSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(2).max(1000),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  xp: z.number().int().min(0).max(200),
  due_date: z.string().nullable().optional(),
});

childrenRouter.post('/:id/missions', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (role !== 'psychologist' && role !== 'school_admin') {
    return res.status(403).json({ error: 'psych_or_admin_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = newMissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO child_missions (id, child_id, title, description, source_scenario, difficulty, xp, assigned_at, due_date, completed_at, assigned_by, source)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, 'psychologist')`
  ).run(
    id, childId,
    parsed.data.title, parsed.data.description,
    parsed.data.difficulty, parsed.data.xp,
    new Date().toISOString(),
    parsed.data.due_date ?? null,
    userId,
  );
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'mission_assigned', resource_type: 'mission', resource_id: id, child_id: childId,
    metadata: { title: parsed.data.title, difficulty: parsed.data.difficulty },
  });
  res.json({ id });
});

childrenRouter.delete('/:id/missions/:missionId', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  const missionId = req.params.missionId;
  if (role !== 'psychologist' && role !== 'school_admin') {
    return res.status(403).json({ error: 'psych_or_admin_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const result = db
    .prepare(`DELETE FROM child_missions WHERE id = ? AND child_id = ?`)
    .run(missionId, childId);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'mission_deleted', resource_type: 'mission', resource_id: missionId, child_id: childId,
  });
  res.json({ ok: true });
});

// ---------- Mission requests (parent suggests, psychologist approves/rejects) ----------

interface MissionRequestRow {
  id: string;
  child_id: string;
  parent_id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  xp: number;
  status: 'pending' | 'approved' | 'rejected';
  psych_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  resulting_mission_id: string | null;
  created_at: string;
  child_name: string;
  parent_name: string;
  decided_by_name: string | null;
  requester_role: 'parent' | 'teacher';
}

function shapeMissionRequest(r: MissionRequestRow): MissionRequest {
  return {
    id: r.id,
    child_id: r.child_id,
    child_name: r.child_name,
    parent_id: r.parent_id,
    parent_name: r.parent_name,
    title: r.title,
    description: r.description,
    difficulty: r.difficulty,
    xp: r.xp,
    status: r.status,
    psych_note: r.psych_note,
    decided_by: r.decided_by,
    decided_by_name: r.decided_by_name,
    decided_at: r.decided_at,
    resulting_mission_id: r.resulting_mission_id,
    created_at: r.created_at,
    requester_role: r.requester_role,
  };
}

childrenRouter.get('/:id/mission-requests', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  // Parents and teachers see only their own requests; psychologists/admins see all for the child.
  const ownOnly = role === 'parent' || role === 'teacher';
  const ownClause = ownOnly ? 'AND r.parent_id = ?' : '';
  const params: unknown[] = ownOnly ? [childId, userId] : [childId];
  const rows = db
    .prepare(
      `SELECT r.*, c.display_name AS child_name, p.name AS parent_name, d.name AS decided_by_name,
              COALESCE(r.requester_role, 'parent') AS requester_role
       FROM mission_requests r
       JOIN children c ON c.id = r.child_id
       JOIN users p ON p.id = r.parent_id
       LEFT JOIN users d ON d.id = r.decided_by
       WHERE r.child_id = ? ${ownClause}
       ORDER BY r.created_at DESC LIMIT 100`
    )
    .all(...params) as MissionRequestRow[];
  res.json(rows.map(shapeMissionRequest));
});

const newRequestSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(2).max(1000),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  xp: z.number().int().min(0).max(200).default(15),
});

childrenRouter.post('/:id/mission-requests', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  // Both parents and teachers can request missions; psychologist + admin approve.
  if (role !== 'parent' && role !== 'teacher') {
    return res.status(403).json({ error: 'parent_or_teacher_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = newRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO mission_requests (id, child_id, parent_id, requester_role, title, description, difficulty, xp, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, childId, userId, role, parsed.data.title, parsed.data.description, parsed.data.difficulty, parsed.data.xp, new Date().toISOString());

  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'mission_request_submitted', resource_type: 'mission_request', resource_id: id, child_id: childId,
    metadata: { title: parsed.data.title, requester_role: role },
  });
  res.json({ id });
});

const decideSchema = z.object({ note: z.string().max(500).optional() });

childrenRouter.post('/:id/mission-requests/:reqId/approve', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  const reqId = req.params.reqId;
  if (role !== 'psychologist' && role !== 'school_admin') {
    return res.status(403).json({ error: 'psych_or_admin_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = decideSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const reqRow = db
    .prepare(`SELECT * FROM mission_requests WHERE id = ? AND child_id = ? AND status = 'pending'`)
    .get(reqId, childId) as MissionRequestRow | undefined;
  if (!reqRow) return res.status(404).json({ error: 'not_found_or_decided' });

  const missionId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO child_missions (id, child_id, title, description, source_scenario, difficulty, xp, assigned_at, due_date, completed_at, assigned_by, source)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, 'parent_request')`
    ).run(missionId, childId, reqRow.title, reqRow.description, reqRow.difficulty, reqRow.xp, now, userId);
    db.prepare(
      `UPDATE mission_requests SET status = 'approved', decided_by = ?, decided_at = ?, psych_note = ?, resulting_mission_id = ? WHERE id = ?`
    ).run(userId, now, parsed.data.note ?? null, missionId, reqId);
  })();

  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'mission_request_approved', resource_type: 'mission_request', resource_id: reqId, child_id: childId,
    metadata: { mission_id: missionId, title: reqRow.title },
  });
  res.json({ ok: true, mission_id: missionId });
});

childrenRouter.post('/:id/mission-requests/:reqId/reject', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  const reqId = req.params.reqId;
  if (role !== 'psychologist' && role !== 'school_admin') {
    return res.status(403).json({ error: 'psych_or_admin_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = decideSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const result = db
    .prepare(
      `UPDATE mission_requests SET status = 'rejected', decided_by = ?, decided_at = ?, psych_note = ?
       WHERE id = ? AND child_id = ? AND status = 'pending'`
    )
    .run(userId, new Date().toISOString(), parsed.data.note ?? null, reqId, childId);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found_or_decided' });

  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'mission_request_rejected', resource_type: 'mission_request', resource_id: reqId, child_id: childId,
  });
  res.json({ ok: true });
});

// ---------- Adaptive safety labeling (psychologist-in-the-loop) ----------
// Flow: psychologist hits the "Label" button on a helper message and picks
// severity + category. We persist the override on the message, log a
// safety_labels row, and asynchronously ask the LLM to extract trigger
// phrases. Those phrases get stored per-school so future similar messages
// get auto-flagged at the same severity.

const SAFETY_CATEGORIES = [
  'self_harm', 'abuse', 'violence', 'sexual', 'medical_advice', 'pii_leak',
  'language_drift', 'eating_disorder', 'substance_use', 'bullying', 'hopelessness', 'distress',
] as const;

const labelSchema = z.object({
  severity: z.enum(['safe', 'low', 'medium', 'high', 'critical']),
  category: z.enum(SAFETY_CATEGORIES),
  reason: z.string().max(500).optional(),
});

childrenRouter.post('/:id/helper-messages/:msgId/label', async (req, res) => {
  const { id: userId, role, school_id } = req.auth!;
  const childId = req.params.id;
  const msgId = req.params.msgId;
  if (role !== 'psychologist' && role !== 'school_admin') {
    return res.status(403).json({ error: 'psych_or_admin_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = labelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const msg = db
    .prepare(`SELECT id, content FROM child_helper_messages WHERE id = ? AND child_id = ?`)
    .get(msgId, childId) as { id: string; content: string } | undefined;
  if (!msg) return res.status(404).json({ error: 'message_not_found' });

  const severity = parsed.data.severity as SafetySeverity;
  const category = parsed.data.category as SafetyCategory;
  const labelId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Update the message's flags so the dashboard reflects the override immediately.
  const flagsJson = severity === 'safe'
    ? null
    : JSON.stringify({ severity, categories: [category], phrases: [], manual: true });
  db.prepare(`UPDATE child_helper_messages SET flags = ? WHERE id = ?`).run(flagsJson, msgId);

  db.prepare(
    `INSERT INTO safety_labels (id, message_id, child_id, labeled_by, severity, category, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(labelId, msgId, childId, userId, severity, category, parsed.data.reason ?? null, now);

  // Mirror the override into the alerts table so the priority graph updates.
  if (severity === 'high' || severity === 'critical') {
    try {
      db.prepare(
        `INSERT INTO alerts (id, child_id, session_id, priority, type, excerpt, context, created_at)
         VALUES (?, ?, NULL, 'high', ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(), childId,
        `helper_${category}`,
        msg.content.slice(0, 240),
        JSON.stringify({ source: 'manual_label', severity, categories: [category], labeled_by: userId }),
        now,
      );
    } catch { /* alerts table may not exist; ignore */ }
  } else if (severity === 'medium' || severity === 'low') {
    try {
      db.prepare(
        `INSERT INTO alerts (id, child_id, session_id, priority, type, excerpt, context, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(), childId, severity,
        `helper_${category}`,
        msg.content.slice(0, 240),
        JSON.stringify({ source: 'manual_label', severity, categories: [category], labeled_by: userId }),
        now,
      );
    } catch { /* ignore */ }
  }

  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'safety_label_applied', resource_type: 'helper_message', resource_id: msgId, child_id: childId,
    metadata: { severity, category, label_id: labelId },
  });

  // Save literal fragments + stems from the message synchronously. Literal fragments catch
  // verbatim repeats; stems catch verb forms and short typos (e.g. stem "bull" matches
  // bullied/bully/bulliex). Both run before the response so the next message instantly auto-flags.
  if (severity !== 'safe') {
    const literal = literalFragmentsFromMessage(msg.content);
    if (literal.length > 0) {
      saveLearnedPatterns({
        schoolId: school_id, labelId, category, severity,
        phrases: literal, language: null, matchKind: 'phrase',
      });
    }
    const stems = stemTriggersFromMessage(msg.content);
    if (stems.length > 0) {
      saveLearnedPatterns({
        schoolId: school_id, labelId, category, severity,
        phrases: stems, language: null, matchKind: 'stem',
      });
    }
  }

  // Respond immediately so the UI doesn't wait on the LLM. Paraphrase extraction runs in background.
  res.json({ ok: true, label_id: labelId, severity, category });

  // Fire-and-forget LLM paraphrase generation on top of the literal anchors.
  if (severity !== 'safe') {
    extractTriggerPhrases(msg.content, category, severity)
      .then((phrases) => {
        if (phrases.length === 0) return 0;
        return saveLearnedPatterns({
          schoolId: school_id,
          labelId,
          category,
          severity,
          phrases,
          language: null,
        });
      })
      .catch(() => { /* swallow; the label is still saved */ });
  }
});

childrenRouter.get('/:id/safety-labels', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (role !== 'psychologist' && role !== 'school_admin') {
    return res.status(403).json({ error: 'psych_or_admin_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const rows = db
    .prepare(
      `SELECT l.id, l.message_id, l.severity, l.category, l.reason, l.created_at, u.name AS labeled_by_name,
              m.content AS message_content
       FROM safety_labels l
       JOIN users u ON u.id = l.labeled_by
       JOIN child_helper_messages m ON m.id = l.message_id
       WHERE l.child_id = ? ORDER BY l.created_at DESC LIMIT 50`
    )
    .all(childId);
  res.json(rows);
});

childrenRouter.get('/safety-patterns/learned', (req, res) => {
  const { role, school_id } = req.auth!;
  if (role !== 'psychologist' && role !== 'school_admin') {
    return res.status(403).json({ error: 'psych_or_admin_only' });
  }
  const rows = db
    .prepare(
      `SELECT id, pattern, category, severity, hit_count, last_hit_at, created_at
       FROM safety_learned_patterns WHERE school_id = ?
       ORDER BY hit_count DESC, created_at DESC LIMIT 200`
    )
    .all(school_id);
  res.json(rows);
});

// Linked guardians for a child: parents, psychologists, teachers — with name/email/phone
// so the contacts panel can show "how to reach them" without the user opening admin.
childrenRouter.get('/:id/guardians', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const sql = `
    SELECT u.id, u.name, u.email, u.phone, 'parent' AS rel
    FROM child_parents cp JOIN users u ON u.id = cp.parent_id WHERE cp.child_id = ?
    UNION
    SELECT u.id, u.name, u.email, u.phone, 'psychologist' AS rel
    FROM child_psychologists cpz JOIN users u ON u.id = cpz.psychologist_id WHERE cpz.child_id = ?
    UNION
    SELECT u.id, u.name, u.email, u.phone, 'teacher' AS rel
    FROM child_teachers ct JOIN users u ON u.id = ct.teacher_id WHERE ct.child_id = ?
    ORDER BY rel, name
  `;
  const rows = db.prepare(sql).all(childId, childId, childId) as Array<{ id: string; name: string; email: string; phone: string | null; rel: 'parent' | 'psychologist' | 'teacher' }>;
  res.json(rows);
});

// ---------- Scenario queue requests (teacher/parent suggests, psych/admin approves) ----------

const SCENARIO_TYPES = [
  'asking_teacher_for_help', 'joining_group_conversation', 'handling_disagreement',
  'ordering_in_public', 'introducing_yourself', 'presenting_in_class',
  'refusing_peer_pressure', 'asking_for_a_date',
] as const;

const newScenarioRequestSchema = z.object({
  scenario: z.enum(SCENARIO_TYPES),
  notes: z.string().max(500).optional(),
});

interface ScenarioRequestRow {
  id: string;
  child_id: string;
  requester_id: string;
  requester_role: 'parent' | 'teacher';
  scenario: string;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  resulting_queue_id: string | null;
  created_at: string;
  child_name: string;
  requester_name: string;
  decided_by_name: string | null;
}

childrenRouter.get('/:id/scenario-requests', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const ownOnly = role === 'parent' || role === 'teacher';
  const ownClause = ownOnly ? 'AND r.requester_id = ?' : '';
  const params: unknown[] = ownOnly ? [childId, userId] : [childId];
  const rows = db
    .prepare(
      `SELECT r.*, c.display_name AS child_name, u.name AS requester_name, d.name AS decided_by_name
       FROM scenario_queue_requests r
       JOIN children c ON c.id = r.child_id
       JOIN users u ON u.id = r.requester_id
       LEFT JOIN users d ON d.id = r.decided_by
       WHERE r.child_id = ? ${ownClause}
       ORDER BY r.created_at DESC LIMIT 100`
    )
    .all(...params) as ScenarioRequestRow[];
  res.json(rows);
});

childrenRouter.post('/:id/scenario-requests', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  // Teachers and parents can request; psychologist + admin approve.
  if (role !== 'teacher' && role !== 'parent') {
    return res.status(403).json({ error: 'teacher_or_parent_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = newScenarioRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO scenario_queue_requests (id, child_id, requester_id, requester_role, scenario, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, childId, userId, role, parsed.data.scenario, parsed.data.notes ?? '', new Date().toISOString());
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'scenario_request_submitted', resource_type: 'scenario_request', resource_id: id, child_id: childId,
    metadata: { scenario: parsed.data.scenario, requester_role: role },
  });
  res.json({ id });
});

childrenRouter.post('/:id/scenario-requests/:reqId/approve', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  const reqId = req.params.reqId;
  if (role !== 'psychologist' && role !== 'school_admin') {
    return res.status(403).json({ error: 'psych_or_admin_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = decideSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const reqRow = db
    .prepare(`SELECT * FROM scenario_queue_requests WHERE id = ? AND child_id = ? AND status = 'pending'`)
    .get(reqId, childId) as ScenarioRequestRow | undefined;
  if (!reqRow) return res.status(404).json({ error: 'not_found_or_decided' });

  const queueId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO scenario_queue (id, child_id, scenario, assigned_by, assigned_at, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(queueId, childId, reqRow.scenario, userId, now, reqRow.notes);
    db.prepare(
      `UPDATE scenario_queue_requests
       SET status = 'approved', decided_by = ?, decided_at = ?, decision_note = ?, resulting_queue_id = ?
       WHERE id = ?`
    ).run(userId, now, parsed.data.note ?? null, queueId, reqId);
  })();

  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'scenario_request_approved', resource_type: 'scenario_request', resource_id: reqId, child_id: childId,
    metadata: { scenario: reqRow.scenario, queue_id: queueId },
  });
  res.json({ ok: true, queue_id: queueId });
});

childrenRouter.post('/:id/scenario-requests/:reqId/reject', (req, res) => {
  const { id: userId, role } = req.auth!;
  const childId = req.params.id;
  const reqId = req.params.reqId;
  if (role !== 'psychologist' && role !== 'school_admin') {
    return res.status(403).json({ error: 'psych_or_admin_only' });
  }
  if (!psychologistCanAccessChild(userId, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const parsed = decideSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const result = db
    .prepare(
      `UPDATE scenario_queue_requests
       SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ?
       WHERE id = ? AND child_id = ? AND status = 'pending'`
    )
    .run(userId, new Date().toISOString(), parsed.data.note ?? null, reqId, childId);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found_or_decided' });
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'scenario_request_rejected', resource_type: 'scenario_request', resource_id: reqId, child_id: childId,
  });
  res.json({ ok: true });
});
