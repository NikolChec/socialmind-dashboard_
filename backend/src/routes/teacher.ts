import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/schema.js';
import { requireAuth, requireRole, userCanAccessChild } from '../middleware/auth.js';
import { auditFor, getUserName } from '../services/audit.js';

export const teacherRouter = Router();
teacherRouter.use(requireAuth, requireRole('teacher'));

// A teacher's own permission requests (across all linked children).
teacherRouter.get('/permission-requests', (req, res) => {
  const { id: teacherId } = req.auth!;
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  let sql = `SELECT pr.*, c.display_name AS child_name, t.name AS teacher_name, r.name AS resolved_by_name
             FROM permission_requests pr
             JOIN children c ON c.id = pr.child_id
             JOIN users t ON t.id = pr.teacher_id
             LEFT JOIN users r ON r.id = pr.resolved_by
             WHERE pr.teacher_id = ?`;
  const params: unknown[] = [teacherId];
  if (status) { sql += ` AND pr.status = ?`; params.push(status); }
  sql += ` ORDER BY pr.requested_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

const createSchema = z.object({
  child_id: z.string(),
  scope: z.enum(['helper_chats', 'alerts', 'sessions', 'missions', 'full']),
  reason: z.string().max(2000).optional(),
});

teacherRouter.post('/permission-requests', (req, res) => {
  const { id: teacherId, role } = req.auth!;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  // Teacher must be linked to the child to even ask.
  if (!userCanAccessChild(teacherId, parsed.data.child_id, role)) {
    return res.status(403).json({ error: 'not_linked_to_child' });
  }
  // Don't double-stack identical pending requests.
  const dup = db
    .prepare(
      `SELECT id FROM permission_requests
       WHERE teacher_id = ? AND child_id = ? AND scope = ? AND status = 'pending'`
    )
    .get(teacherId, parsed.data.child_id, parsed.data.scope) as { id: string } | undefined;
  if (dup) return res.status(409).json({ error: 'already_pending', id: dup.id });

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO permission_requests (id, teacher_id, child_id, scope, reason, status, requested_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, teacherId, parsed.data.child_id, parsed.data.scope, parsed.data.reason ?? '', new Date().toISOString());

  auditFor(req)({
    user_id: teacherId, user_name: getUserName(teacherId),
    action: 'requested_permission', resource_type: 'permission_request', resource_id: id, child_id: parsed.data.child_id,
    metadata: { scope: parsed.data.scope, reason: parsed.data.reason ?? '' },
  });
  res.status(201).json({ id });
});

teacherRouter.delete('/permission-requests/:id', (req, res) => {
  const { id: teacherId } = req.auth!;
  const row = db.prepare(`SELECT teacher_id, status FROM permission_requests WHERE id = ?`).get(req.params.id) as { teacher_id: string; status: string } | undefined;
  if (!row || row.teacher_id !== teacherId) return res.status(404).json({ error: 'not_found' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'already_resolved' });
  db.prepare(`DELETE FROM permission_requests WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});
