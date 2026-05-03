import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { auditFor, getUserName } from '../services/audit.js';
import type { AdminUserRow, Role } from '@socialmind/shared';
import { MAX_PARENTS_PER_CHILD, MAX_PSYCHOLOGISTS_PER_CHILD } from '@socialmind/shared';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('school_admin'));

function withLinkedChildren(userId: string, role: Role): { ids: string[]; names: string[] } {
  const sql =
    role === 'parent'
      ? `SELECT c.id, c.display_name FROM child_parents cp
         JOIN children c ON c.id = cp.child_id WHERE cp.parent_id = ?
         ORDER BY c.display_name`
      : role === 'psychologist'
      ? `SELECT DISTINCT c.id, c.display_name FROM children c
         WHERE c.psychologist_id = ?
            OR c.id IN (SELECT child_id FROM child_psychologists WHERE psychologist_id = ?)
         ORDER BY c.display_name`
      : role === 'teacher'
      ? `SELECT c.id, c.display_name FROM child_teachers ct
         JOIN children c ON c.id = ct.child_id WHERE ct.teacher_id = ?
         ORDER BY c.display_name`
      : '';
  if (!sql) return { ids: [], names: [] };
  const params = role === 'psychologist' ? [userId, userId] : [userId];
  const rows = db.prepare(sql).all(...params) as Array<{ id: string; display_name: string }>;
  return { ids: rows.map((r) => r.id), names: rows.map((r) => r.display_name) };
}

adminRouter.get('/users', (req, res) => {
  const { school_id } = req.auth!;
  const roleFilter = typeof req.query.role === 'string' ? req.query.role : null;
  let sql = `SELECT id, school_id, email, name, role, phone, created_at,
                    COALESCE(two_factor_enabled,0) AS two_factor_enabled,
                    two_factor_email
             FROM users WHERE school_id = ?`;
  const params: Array<string> = [school_id];
  if (roleFilter) {
    sql += ` AND role = ?`;
    params.push(roleFilter);
  }
  sql += ` ORDER BY role, name`;
  const rows = db.prepare(sql).all(...params) as Array<{
    id: string; school_id: string; email: string; name: string; role: Role; phone: string | null; created_at: string; two_factor_enabled: number; two_factor_email: string | null;
  }>;
  const out: AdminUserRow[] = rows.map((u) => {
    const linked = withLinkedChildren(u.id, u.role);
    return {
      ...u,
      two_factor_enabled: !!u.two_factor_enabled,
      two_factor_email: u.two_factor_email,
      linked_child_ids: linked.ids,
      linked_child_names: linked.names,
    };
  });
  res.json(out);
});

// Toggle a user's 2FA setting + optionally route OTPs to a different email.
// Empty/null email clears the override and falls back to the login email.
const twoFaSchema = z.object({
  enabled: z.boolean(),
  email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
});
adminRouter.patch('/users/:id/2fa', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const parsed = twoFaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const target = db
    .prepare(`SELECT id, school_id, name, role FROM users WHERE id = ?`)
    .get(req.params.id) as { id: string; school_id: string; name: string; role: Role } | undefined;
  if (!target || target.school_id !== school_id) return res.status(404).json({ error: 'not_found' });
  const otpEmail = parsed.data.email && parsed.data.email.length > 0 ? parsed.data.email : null;
  db.prepare(`UPDATE users SET two_factor_enabled = ?, two_factor_email = ? WHERE id = ?`)
    .run(parsed.data.enabled ? 1 : 0, otpEmail, target.id);
  // When disabling, also revoke any pending OTPs and trusted devices so the change takes effect immediately.
  if (!parsed.data.enabled) {
    db.prepare(`DELETE FROM email_otps WHERE user_id = ?`).run(target.id);
    db.prepare(`DELETE FROM trusted_devices WHERE user_id = ?`).run(target.id);
  }
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: parsed.data.enabled ? '2fa_enabled' : '2fa_disabled',
    resource_type: 'user', resource_id: target.id,
    metadata: { target_name: target.name, target_role: target.role, otp_email: otpEmail },
  });
  res.json({ ok: true });
});

// Only admins (this whole router is admin-gated) can create users — including other admins,
// psychologists, parents, and teachers. The user explicitly asked for this.
const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(200),
  role: z.enum(['school_admin', 'psychologist', 'parent', 'teacher']),
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

  if (child_ids && child_ids.length > 0) {
    const now = new Date().toISOString();
    if (role === 'parent') {
      const link = db.prepare(
        `INSERT OR IGNORE INTO child_parents (child_id, parent_id, created_at) VALUES (?, ?, ?)`
      );
      for (const cid of child_ids) {
        const row = db.prepare(`SELECT 1 FROM children WHERE id = ? AND school_id = ?`).get(cid, school_id);
        if (!row) continue;
        const count = (db.prepare(`SELECT COUNT(*) AS n FROM child_parents WHERE child_id = ?`).get(cid) as { n: number }).n;
        if (count >= MAX_PARENTS_PER_CHILD) continue;
        link.run(cid, id, now);
      }
    } else if (role === 'psychologist') {
      const link = db.prepare(
        `INSERT OR IGNORE INTO child_psychologists (child_id, psychologist_id, created_at) VALUES (?, ?, ?)`
      );
      for (const cid of child_ids) {
        const row = db.prepare(`SELECT 1 FROM children WHERE id = ? AND school_id = ?`).get(cid, school_id);
        if (!row) continue;
        const count = (db.prepare(`SELECT COUNT(*) AS n FROM child_psychologists WHERE child_id = ?`).get(cid) as { n: number }).n;
        if (count >= MAX_PSYCHOLOGISTS_PER_CHILD) continue;
        link.run(cid, id, now);
      }
    } else if (role === 'teacher') {
      const link = db.prepare(
        `INSERT OR IGNORE INTO child_teachers (child_id, teacher_id, created_at) VALUES (?, ?, ?)`
      );
      for (const cid of child_ids) {
        const row = db.prepare(`SELECT 1 FROM children WHERE id = ? AND school_id = ?`).get(cid, school_id);
        if (row) link.run(cid, id, now);
      }
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
  email: z.string().email().max(120).optional(),
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
  if (parsed.data.email !== undefined) {
    // Reject if a different user already owns the new email (case-insensitive).
    const existing = db.prepare(`SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?`).get(parsed.data.email, targetId) as { id: string } | undefined;
    if (existing) return res.status(409).json({ error: 'email_in_use' });
    sets.push('email = ?'); params.push(parsed.data.email);
  }
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
  db.prepare(`DELETE FROM child_psychologists WHERE psychologist_id = ?`).run(targetId);
  db.prepare(`DELETE FROM child_teachers WHERE teacher_id = ?`).run(targetId);
  db.prepare(`DELETE FROM permission_requests WHERE teacher_id = ?`).run(targetId);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(targetId);

  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'deleted_user', resource_type: 'user', resource_id: targetId,
  });
  res.json({ ok: true });
});

// Reassign a child's psychologist
const reassignSchema = z.object({ psychologist_id: z.string() });
// Create a new child (with username + password so they can log into the child app).
const createChildSchema = z.object({
  display_name: z.string().min(1).max(80),
  grade: z.number().int().min(1).max(12),
  date_of_birth: z.string().min(4),
  username: z.string().min(2).max(40).regex(/^[a-zA-Z0-9_-]+$/, 'username_alpha_only'),
  password: z.string().min(6).max(100),
  psychologist_id: z.string(),
  preferred_lang: z.enum(['en', 'he', 'ru']).optional(),
  notes: z.string().max(2000).optional(),
});
adminRouter.post('/children', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const parsed = createChildSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', detail: parsed.error.message });
  const d = parsed.data;

  const psych = db.prepare(`SELECT school_id, role FROM users WHERE id = ?`).get(d.psychologist_id) as { school_id: string; role: Role } | undefined;
  if (!psych || psych.school_id !== school_id || psych.role !== 'psychologist') {
    return res.status(400).json({ error: 'invalid_psychologist' });
  }
  const exists = db.prepare(`SELECT 1 FROM children WHERE lower(username) = lower(?)`).get(d.username);
  if (exists) return res.status(409).json({ error: 'username_taken' });

  const id = crypto.randomUUID();
  const password_hash = bcrypt.hashSync(d.password, 10);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO children (id, school_id, psychologist_id, display_name, grade, date_of_birth, notes, username, password_hash, preferred_lang, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, school_id, d.psychologist_id, d.display_name, d.grade, d.date_of_birth, d.notes ?? '', d.username, password_hash, d.preferred_lang ?? 'en', now);
  db.prepare(
    `INSERT OR IGNORE INTO child_psychologists (child_id, psychologist_id, created_at) VALUES (?, ?, ?)`
  ).run(id, d.psychologist_id, now);

  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'created_child', resource_type: 'child', resource_id: id, child_id: id,
    metadata: { display_name: d.display_name, username: d.username, psychologist_id: d.psychologist_id },
  });
  res.status(201).json({ id, username: d.username });
});

// Admin-only: read or set the 2FA settings for a child login. Same shape as user 2FA.
adminRouter.get('/children/:id/2fa', (req, res) => {
  const { school_id } = req.auth!;
  const row = db
    .prepare(`SELECT id, school_id, COALESCE(two_factor_enabled,0) AS two_factor_enabled, two_factor_email FROM children WHERE id = ?`)
    .get(req.params.id) as { id: string; school_id: string; two_factor_enabled: number; two_factor_email: string | null } | undefined;
  if (!row || row.school_id !== school_id) return res.status(404).json({ error: 'not_found' });
  res.json({ enabled: !!row.two_factor_enabled, email: row.two_factor_email });
});

adminRouter.patch('/children/:id/2fa', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const parsed = twoFaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const target = db
    .prepare(`SELECT id, school_id, display_name FROM children WHERE id = ?`)
    .get(req.params.id) as { id: string; school_id: string; display_name: string } | undefined;
  if (!target || target.school_id !== school_id) return res.status(404).json({ error: 'not_found' });
  const otpEmail = parsed.data.email && parsed.data.email.length > 0 ? parsed.data.email : null;
  // 2FA can only be turned ON if a destination email is configured — otherwise the kid
  // would lock themselves out (no email = no code = no login).
  if (parsed.data.enabled && !otpEmail) {
    return res.status(400).json({ error: 'email_required_when_enabling' });
  }
  db.prepare(`UPDATE children SET two_factor_enabled = ?, two_factor_email = ? WHERE id = ?`)
    .run(parsed.data.enabled ? 1 : 0, otpEmail, target.id);
  if (!parsed.data.enabled) {
    // Clear any pending OTPs / trusted-device cookies tied to this child so the change
    // takes effect on the next login attempt.
    db.prepare(`DELETE FROM email_otps WHERE user_id = ? AND COALESCE(subject_kind,'user') = 'child'`).run(target.id);
    db.prepare(`DELETE FROM trusted_devices WHERE user_id = ? AND COALESCE(subject_kind,'user') = 'child'`).run(target.id);
  }
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: parsed.data.enabled ? 'child_2fa_enabled' : 'child_2fa_disabled',
    resource_type: 'child', resource_id: target.id, child_id: target.id,
    metadata: { name: target.display_name, otp_email: otpEmail },
  });
  res.json({ ok: true });
});

// Admin can update a child's username and/or password — handy for "the kid forgot"
// or "the username is too hard to type". Both fields optional; reject duplicate usernames.
const childCredsSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-z0-9._-]+$/i, 'lowercase letters, digits, dot/dash/underscore only').optional(),
  password: z.string().min(6).max(128).optional(),
});
adminRouter.patch('/children/:id/credentials', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const target = db
    .prepare(`SELECT id, school_id, display_name, username FROM children WHERE id = ?`)
    .get(req.params.id) as { id: string; school_id: string; display_name: string; username: string | null } | undefined;
  if (!target || target.school_id !== school_id) return res.status(404).json({ error: 'not_found' });
  const parsed = childCredsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const sets: string[] = [];
  const params: Array<string | null> = [];
  if (parsed.data.username !== undefined) {
    const existing = db.prepare(`SELECT id FROM children WHERE lower(username) = lower(?) AND id != ?`).get(parsed.data.username, target.id) as { id: string } | undefined;
    if (existing) return res.status(409).json({ error: 'username_in_use' });
    sets.push('username = ?'); params.push(parsed.data.username);
  }
  if (parsed.data.password !== undefined) {
    sets.push('password_hash = ?'); params.push(bcrypt.hashSync(parsed.data.password, 10));
  }
  if (sets.length === 0) return res.json({ ok: true });
  params.push(target.id);
  db.prepare(`UPDATE children SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'updated_child_credentials',
    resource_type: 'child', resource_id: target.id, child_id: target.id,
    metadata: {
      name: target.display_name,
      changed_username: parsed.data.username !== undefined,
      changed_password: parsed.data.password !== undefined,
    },
  });
  res.json({ ok: true });
});

adminRouter.delete('/children/:id', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const childId = req.params.id;
  const child = db.prepare(`SELECT school_id, display_name FROM children WHERE id = ?`).get(childId) as { school_id: string; display_name: string } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  db.prepare(`DELETE FROM children WHERE id = ?`).run(childId);
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'deleted_child', resource_type: 'child', resource_id: childId, child_id: childId,
    metadata: { display_name: child.display_name },
  });
  res.json({ ok: true });
});

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
  db.prepare(
    `INSERT OR IGNORE INTO child_psychologists (child_id, psychologist_id, created_at) VALUES (?, ?, ?)`
  ).run(childId, parsed.data.psychologist_id, new Date().toISOString());
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
  const already = db.prepare(`SELECT 1 FROM child_parents WHERE child_id = ? AND parent_id = ?`).get(childId, parsed.data.parent_id);
  if (!already) {
    const count = (db.prepare(`SELECT COUNT(*) AS n FROM child_parents WHERE child_id = ?`).get(childId) as { n: number }).n;
    if (count >= MAX_PARENTS_PER_CHILD) {
      return res.status(409).json({ error: 'parent_limit_reached', detail: `A child can have at most ${MAX_PARENTS_PER_CHILD} linked parents.` });
    }
  }
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

// ---- Linked psychologists (max 2 per child) ----
const psychLinkSchema = z.object({ psychologist_id: z.string() });

adminRouter.get('/children/:id/psychologists', (req, res) => {
  const { school_id } = req.auth!;
  const childId = req.params.id;
  const child = db.prepare(`SELECT school_id, psychologist_id FROM children WHERE id = ?`).get(childId) as { school_id: string; psychologist_id: string } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.phone, (u.id = ?) AS is_primary
       FROM child_psychologists cp
       JOIN users u ON u.id = cp.psychologist_id
       WHERE cp.child_id = ? ORDER BY is_primary DESC, u.name`
    )
    .all(child.psychologist_id, childId);
  res.json(rows);
});

adminRouter.post('/children/:id/psychologists', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const childId = req.params.id;
  const parsed = psychLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const child = db.prepare(`SELECT school_id FROM children WHERE id = ?`).get(childId) as { school_id: string } | undefined;
  const psych = db.prepare(`SELECT school_id, role FROM users WHERE id = ?`).get(parsed.data.psychologist_id) as { school_id: string; role: Role } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  if (!psych || psych.school_id !== school_id || psych.role !== 'psychologist') return res.status(400).json({ error: 'invalid_psychologist' });
  const already = db.prepare(`SELECT 1 FROM child_psychologists WHERE child_id = ? AND psychologist_id = ?`).get(childId, parsed.data.psychologist_id);
  if (!already) {
    const count = (db.prepare(`SELECT COUNT(*) AS n FROM child_psychologists WHERE child_id = ?`).get(childId) as { n: number }).n;
    if (count >= MAX_PSYCHOLOGISTS_PER_CHILD) {
      return res.status(409).json({ error: 'psychologist_limit_reached', detail: `A child can have at most ${MAX_PSYCHOLOGISTS_PER_CHILD} linked psychologists.` });
    }
  }
  db.prepare(
    `INSERT OR IGNORE INTO child_psychologists (child_id, psychologist_id, created_at) VALUES (?, ?, ?)`
  ).run(childId, parsed.data.psychologist_id, new Date().toISOString());
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'linked_psychologist', resource_type: 'child_psychologists', resource_id: `${childId}:${parsed.data.psychologist_id}`, child_id: childId,
    metadata: { psychologist_id: parsed.data.psychologist_id },
  });
  res.json({ ok: true });
});

adminRouter.delete('/children/:id/psychologists/:psychId', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const { id: childId, psychId } = req.params;
  const child = db.prepare(`SELECT school_id, psychologist_id FROM children WHERE id = ?`).get(childId) as { school_id: string; psychologist_id: string } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  if (child.psychologist_id === psychId) {
    return res.status(409).json({ error: 'is_primary_psychologist', detail: 'Reassign the primary psychologist before unlinking.' });
  }
  db.prepare(`DELETE FROM child_psychologists WHERE child_id = ? AND psychologist_id = ?`).run(childId, psychId);
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'unlinked_psychologist', resource_type: 'child_psychologists', resource_id: `${childId}:${psychId}`, child_id: childId,
  });
  res.json({ ok: true });
});

// ---- Linked teachers (no hard cap; teachers see only summary, full data needs permission) ----
const teacherLinkSchema = z.object({ teacher_id: z.string() });

adminRouter.get('/children/:id/teachers', (req, res) => {
  const { school_id } = req.auth!;
  const childId = req.params.id;
  const child = db.prepare(`SELECT school_id FROM children WHERE id = ?`).get(childId) as { school_id: string } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.phone FROM child_teachers ct
       JOIN users u ON u.id = ct.teacher_id WHERE ct.child_id = ? ORDER BY u.name`
    )
    .all(childId);
  res.json(rows);
});

adminRouter.post('/children/:id/teachers', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const childId = req.params.id;
  const parsed = teacherLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const child = db.prepare(`SELECT school_id FROM children WHERE id = ?`).get(childId) as { school_id: string } | undefined;
  const teacher = db.prepare(`SELECT school_id, role FROM users WHERE id = ?`).get(parsed.data.teacher_id) as { school_id: string; role: Role } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  if (!teacher || teacher.school_id !== school_id || teacher.role !== 'teacher') return res.status(400).json({ error: 'not_a_teacher' });
  db.prepare(
    `INSERT OR IGNORE INTO child_teachers (child_id, teacher_id, created_at) VALUES (?, ?, ?)`
  ).run(childId, parsed.data.teacher_id, new Date().toISOString());
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'linked_teacher', resource_type: 'child_teachers', resource_id: `${childId}:${parsed.data.teacher_id}`, child_id: childId,
    metadata: { teacher_id: parsed.data.teacher_id },
  });
  res.json({ ok: true });
});

adminRouter.delete('/children/:id/teachers/:teacherId', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const { id: childId, teacherId } = req.params;
  const child = db.prepare(`SELECT school_id FROM children WHERE id = ?`).get(childId) as { school_id: string } | undefined;
  if (!child || child.school_id !== school_id) return res.status(404).json({ error: 'child_not_found' });
  db.prepare(`DELETE FROM child_teachers WHERE child_id = ? AND teacher_id = ?`).run(childId, teacherId);
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: 'unlinked_teacher', resource_type: 'child_teachers', resource_id: `${childId}:${teacherId}`, child_id: childId,
  });
  res.json({ ok: true });
});

// ---- Permission requests (admin can review, approve/deny) ----
const resolvePermissionSchema = z.object({
  status: z.enum(['approved', 'denied']),
  resolved_note: z.string().max(2000).optional(),
});

adminRouter.get('/permission-requests', (req, res) => {
  const { school_id } = req.auth!;
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  let sql = `SELECT pr.*, t.name AS teacher_name, c.display_name AS child_name, r.name AS resolved_by_name
             FROM permission_requests pr
             JOIN users t ON t.id = pr.teacher_id
             JOIN children c ON c.id = pr.child_id
             LEFT JOIN users r ON r.id = pr.resolved_by
             WHERE c.school_id = ?`;
  const params: unknown[] = [school_id];
  if (status) { sql += ` AND pr.status = ?`; params.push(status); }
  sql += ` ORDER BY pr.requested_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

adminRouter.patch('/permission-requests/:id', (req, res) => {
  const { id: adminId, school_id } = req.auth!;
  const parsed = resolvePermissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const reqRow = db
    .prepare(
      `SELECT pr.id, pr.status, pr.child_id, c.school_id
       FROM permission_requests pr JOIN children c ON c.id = pr.child_id
       WHERE pr.id = ?`
    )
    .get(req.params.id) as { id: string; status: string; child_id: string; school_id: string } | undefined;
  if (!reqRow || reqRow.school_id !== school_id) return res.status(404).json({ error: 'not_found' });
  if (reqRow.status !== 'pending') return res.status(409).json({ error: 'already_resolved' });
  db.prepare(
    `UPDATE permission_requests SET status = ?, resolved_at = ?, resolved_by = ?, resolved_note = ? WHERE id = ?`
  ).run(parsed.data.status, new Date().toISOString(), adminId, parsed.data.resolved_note ?? null, req.params.id);
  auditFor(req)({
    user_id: adminId, user_name: getUserName(adminId),
    action: parsed.data.status === 'approved' ? 'approved_permission_request' : 'denied_permission_request',
    resource_type: 'permission_request', resource_id: req.params.id, child_id: reqRow.child_id,
    metadata: { note: parsed.data.resolved_note ?? null },
  });
  res.json({ ok: true });
});
