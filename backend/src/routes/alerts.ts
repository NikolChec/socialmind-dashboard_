import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { auditFor, getUserName } from '../services/audit.js';

export const alertsRouter = Router();

alertsRouter.use(requireAuth);

const ackSchema = z.object({
  action_taken: z
    .enum([
      'contacted_parent',
      'contacted_school',
      'contacted_emergency',
      'addressed_in_session',
      'scheduled_followup',
      'no_action_needed',
    ])
    .optional(),
  action_note: z.string().max(2000).optional(),
});

alertsRouter.get('/', (req, res) => {
  const { id, role, school_id } = req.auth!;
  const onlyUnack = req.query.unacknowledged === 'true';

  const base = `
    SELECT a.*, c.display_name AS child_name, c.id AS child_id
    FROM alerts a JOIN children c ON c.id = a.child_id
  `;
  let scope: string;
  const params: unknown[] = [];
  if (role === 'school_admin') {
    scope = `WHERE c.school_id = ?`;
    params.push(school_id);
  } else if (role === 'psychologist') {
    scope = `WHERE (c.psychologist_id = ? OR c.id IN (SELECT child_id FROM child_psychologists WHERE psychologist_id = ?))`;
    params.push(id, id);
  } else if (role === 'teacher') {
    // Teachers only see alerts for children where they have an approved 'alerts' or 'full' permission.
    scope = `WHERE c.id IN (SELECT child_id FROM child_teachers WHERE teacher_id = ?)
             AND c.id IN (SELECT child_id FROM permission_requests
                          WHERE teacher_id = ? AND status = 'approved' AND scope IN ('alerts','full'))`;
    params.push(id, id);
  } else {
    scope = `WHERE c.id IN (SELECT child_id FROM child_parents WHERE parent_id = ?)`;
    params.push(id);
  }

  const ackFilter = onlyUnack ? ` AND a.acknowledged_at IS NULL` : '';
  const order = `
    ORDER BY a.acknowledged_at IS NULL DESC,
             CASE a.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
             a.created_at DESC
  `;
  const rows = db.prepare(`${base} ${scope} ${ackFilter} ${order}`).all(...params);
  res.json(rows);
});

alertsRouter.post('/:id/acknowledge', (req, res) => {
  const { id: userId, role, school_id } = req.auth!;
  if (role === 'parent' || role === 'teacher') return res.status(403).json({ error: 'read_only' });
  const alertId = req.params.id;

  const parsed = ackSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const row = db
    .prepare(
      `SELECT a.id, a.priority, c.psychologist_id, c.school_id
       FROM alerts a JOIN children c ON c.id = a.child_id WHERE a.id = ?`
    )
    .get(alertId) as
    | { id: string; priority: string; psychologist_id: string; school_id: string }
    | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  let allowed = false;
  if (role === 'school_admin') {
    allowed = row.school_id === school_id;
  } else if (role === 'psychologist') {
    if (row.psychologist_id === userId) allowed = true;
    else {
      const linked = db.prepare(
        `SELECT 1 FROM child_psychologists cp JOIN alerts a ON a.child_id = cp.child_id
         WHERE a.id = ? AND cp.psychologist_id = ?`
      ).get(alertId, userId);
      allowed = !!linked;
    }
  }
  if (!allowed) return res.status(403).json({ error: 'forbidden' });

  if (row.priority === 'high' && !parsed.data.action_taken) {
    return res.status(400).json({ error: 'action_required', detail: 'High-priority alerts require action_taken.' });
  }

  const child = db.prepare(`SELECT child_id FROM alerts WHERE id = ?`).get(alertId) as { child_id: string } | undefined;
  db.prepare(
    `UPDATE alerts SET acknowledged_at = ?, acknowledged_by = ?, action_taken = ?, action_note = ? WHERE id = ?`
  ).run(
    new Date().toISOString(),
    userId,
    parsed.data.action_taken ?? null,
    parsed.data.action_note ?? null,
    alertId
  );
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'acknowledged_alert', resource_type: 'alert', resource_id: alertId, child_id: child?.child_id ?? null,
    metadata: { action_taken: parsed.data.action_taken ?? null, priority: row.priority },
  });
  res.json({ ok: true });
});
