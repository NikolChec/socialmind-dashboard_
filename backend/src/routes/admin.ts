import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { auditFor, getUserName } from '../services/audit.js';
import type { AdminUserRow, Role } from '@socialmind/shared';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('school_admin'));

function withLinkedChildren(userId: string): { ids: string[]; names: string[] } {
  const rows = db
    .prepare(
      `SELECT c.id, c.display_name FROM child_parents cp
       JOIN children c ON c.id = cp.child_id WHERE cp.parent_id = ?
       ORDER BY c.display_name`
    )
    .all(userId) as Array<{ id: string; display_name: string }>;
  return { ids: rows.map((r) => r.id), names: rows.map((r) => r.display_name) };
}

adminRouter.get('/users', (req, res) => {
  const { school_id } = req.auth!;
  const roleFilter = typeof req.query.role === 'string' ? req.query.role : null;
  let sql = `SELECT id, school_id, email, name, role, phone, created_at FROM users WHERE school_id = ?`;
  const params: Array<string> = [school_id];
  if (roleFilter) {
    sql += ` AND role = ?`;
    params.push(roleFilter);
  }
  sql += ` ORDER BY role, name`;
  const rows = db.prepare(sql).all(...params) as Array<{
    id: string; school_id: string; email: string; name: string; role: Role; phone: string | null; created_at: string;
  }>;
  const out: AdminUserRow[] = rows.map((u) => {
    const linked = u.role === 'parent' ? withLinkedChildren(u.id) : { ids: [], names: [] };
    return { ...u, linked_child_ids: linked.ids, linked_child_names: linked.names };
  });
  res.json(out);
});

// Admins can create psychologists and parents only — not other admins.
const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(200),
  role: z.enum(['psychologist', 'parent']),
  password: z.string().min(8).max(200),
  phone: z.string().max(40).optional(),
  child_ids: z.array(z.string()).optional(),
});

adminRouter.post('/users', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', detail: parsed.error.flatten() });
  const { email, name, role, password, phone, child_ids } = parsed.data;

  const exists = db.prepare(`SELECT 1 FROM users WHERE lower(email) = lower(?)`).get(email);
  if (exists) return res.status(409).json({ error: 'email_in_use' });

  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, school_id, email, name, role, password_hash, phone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, school_id, email, name, role, hash, phone ?? null, new Date().toISOString());

  if (role === 'parent' && child_ids && child_ids.length > 0) {
    const link = db.prepare(
      `INSERT OR IGNORE INTO child_parents (child_id, parent_id, created_at) VALUES (?, ?, ?)`
    );
    const now = new Date().toISOString();
    for (const cid of child_ids) {
      // ensure the child is in this school
      const row = db.prepare(`SELECT 1 FROM children WHERE id = ? AND school_id = ?`).get(cid, school_id);
      if (row) link.run(cid, id, now);
    }
  }

  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'created_user', resource_type: 'user', resource_id: id,
    metadata: { role, email, child_ids: child_ids ?? [] },
  });
  res.json({ id });
});

const updateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  phone: z.string().max(40).optional().nullable(),
  password: z.string().min(8).max(200).optional(),
});

adminRouter.patch('/users/:id', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const targetId = req.params.id;
  const target = db.prepare(`SELECT id, school_id, role FROM users WHERE id = ?`).get(targetId) as
    | { id: string; school_id: string; role: Role }
    | undefined;
  if (!target || target.school_id !== school_id) return res.status(404).json({ error: 'not_found' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const sets: string[] = [];
  const params: Array<string | null> = [];
  if (parsed.data.name !== undefined) { sets.push('name = ?'); params.push(parsed.data.name); }
  if (parsed.data.phone !== undefined) { sets.push('phone = ?'); params.push(parsed.data.phone); }
  if (parsed.data.password !== undefined) { sets.push('password_hash = ?'); params.push(bcrypt.hashSync(parsed.data.password, 10)); }
  if (sets.length === 0) return res.json({ ok: true });

  params.push(targetId);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: parsed.data.password ? 'reset_password' : 'updated_user',
    resource_type: 'user', resource_id: targetId,
  });
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const targetId = req.params.id;
  if (targetId === adminId) return res.status(400).json({ error: 'cannot_delete_self' });
  const target = db.prepare(`SELECT school_id, role FROM users WHERE id = ?`).get(targetId) as
    | { school_id: string; role: Role }
    | undefined;
  if (!target || target.school_id !== school_id) return res.status(404).json({ error: 'not_found' });
  if (target.role === 'psychologist') {
    const hasChildren = db.prepare(`SELECT COUNT(*) AS n FROM children WHERE psychologist_id = ?`).get(targetId) as { n: number };
    if (hasChildren.n > 0) return res.status(409).json({ error: 'has_children', detail: 'Reassign their children first.' });
  }
  db.prepare(`DELETE FROM child_parents WHERE parent_id = ?`).run(targetId);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(targetId);

  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'deleted_user', resource_type: 'user', resource_id: targetId,
  });
  res.json({ ok: true });
});

// Reassign a child's psychologist
const reassignSchema = z.object({ psychologist_id: z.string() });
adminRouter.patch('/children/:id/psychologist', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const childId = req.params.id;
  const parsed = reassignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const child = db.prepare(`SELECT school_id FROM children WHERE id = ?`).get(childId) as { school_id: string } | undefined;
  const psych = db.prepare(`SELECT school_id, role FROM users WHERE id = ?`).get(parsed.data.psychologist_id) as { school_id: string; role: Role } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  if (!psych || psych.school_id !== school_id || psych.role !== 'psychologist') return res.status(400).json({ error: 'invalid_psychologist' });

  db.prepare(`UPDATE children SET psychologist_id = ? WHERE id = ?`).run(parsed.data.psychologist_id, childId);
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'reassigned_psychologist', resource_type: 'child', resource_id: childId, child_id: childId,
    metadata: { psychologist_id: parsed.data.psychologist_id },
  });
  res.json({ ok: true });
});

// Link/unlink parent ↔ child
const linkSchema = z.object({ parent_id: z.string() });
adminRouter.post('/children/:id/parents', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const childId = req.params.id;
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const child = db.prepare(`SELECT school_id FROM children WHERE id = ?`).get(childId) as { school_id: string } | undefined;
  const parent = db.prepare(`SELECT school_id, role FROM users WHERE id = ?`).get(parsed.data.parent_id) as { school_id: string; role: Role } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  if (!parent || parent.school_id !== school_id || parent.role !== 'parent') return res.status(400).json({ error: 'not_a_parent' });
  db.prepare(
    `INSERT OR IGNORE INTO child_parents (child_id, parent_id, created_at) VALUES (?, ?, ?)`
  ).run(childId, parsed.data.parent_id, new Date().toISOString());
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'linked_parent', resource_type: 'child_parents', resource_id: `${childId}:${parsed.data.parent_id}`, child_id: childId,
    metadata: { parent_id: parsed.data.parent_id },
  });
  res.json({ ok: true });
});

adminRouter.delete('/children/:id/parents/:parentId', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const { id: childId, parentId } = req.params;
  const child = db.prepare(`SELECT school_id FROM children WHERE id = ?`).get(childId) as { school_id: string } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  db.prepare(`DELETE FROM child_parents WHERE child_id = ? AND parent_id = ?`).run(childId, parentId);
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'unlinked_parent', resource_type: 'child_parents', resource_id: `${childId}:${parentId}`, child_id: childId,
  });
  res.json({ ok: true });
});

adminRouter.get('/children/:id/parents', (req, res) => {
  const { school_id } = req.auth!;
  const childId = req.params.id;
  const child = db.prepare(`SELECT school_id FROM children WHERE id = ?`).get(childId) as { school_id: string } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.phone FROM child_parents cp
       JOIN users u ON u.id = cp.parent_id WHERE cp.child_id = ? ORDER BY u.name`
    )
    .all(childId);
  res.json(rows);
});
