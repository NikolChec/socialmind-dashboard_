import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../db/schema.js';
import { requireAuth, psychologistCanAccessChild } from '../middleware/auth.js';
import { auditFor, getUserName } from '../services/audit.js';
import type { ParentContact } from '@socialmind/shared';

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

const upsertSchema = z.object({
  contacted_at: z.string(),
  method: z.enum(['phone', 'sms', 'email', 'in_person', 'video', 'other']),
  person: z.string().min(1).max(200),
  topic: z.string().min(1).max(500),
  outcome: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
});

contactsRouter.get('/:childId', (req, res) => {
  const { id: userId, role } = req.auth!;
  const { childId } = req.params;
  if (!psychologistCanAccessChild(userId, childId, role)) return res.status(403).json({ error: 'forbidden' });
  const rows = db
    .prepare(
      `SELECT c.*, u.name AS logged_by_name FROM parent_contacts c JOIN users u ON u.id = c.logged_by
       WHERE c.child_id = ? ORDER BY c.contacted_at DESC`
    )
    .all(childId) as ParentContact[];
  res.json(rows);
});

contactsRouter.post('/:childId', (req, res) => {
  const { id: userId, role } = req.auth!;
  if (role === 'parent' || role === 'teacher') return res.status(403).json({ error: 'read_only' });
  const { childId } = req.params;
  if (!psychologistCanAccessChild(userId, childId, role)) return res.status(403).json({ error: 'forbidden' });
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO parent_contacts (id, child_id, logged_by, contacted_at, method, person, topic, outcome, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, childId, userId, parsed.data.contacted_at, parsed.data.method,
    parsed.data.person, parsed.data.topic, parsed.data.outcome ?? '', parsed.data.notes ?? '',
    new Date().toISOString()
  );
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'added_contact', resource_type: 'parent_contact', resource_id: id, child_id: childId,
    metadata: { method: parsed.data.method, person: parsed.data.person },
  });
  res.json({ id });
});

contactsRouter.delete('/:childId/:contactId', (req, res) => {
  const { id: userId, role } = req.auth!;
  if (role === 'parent' || role === 'teacher') return res.status(403).json({ error: 'read_only' });
  const { childId, contactId } = req.params;
  if (!psychologistCanAccessChild(userId, childId, role)) return res.status(403).json({ error: 'forbidden' });
  const row = db.prepare(`SELECT logged_by FROM parent_contacts WHERE id = ? AND child_id = ?`).get(contactId, childId);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare(`DELETE FROM parent_contacts WHERE id = ?`).run(contactId);
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'removed_contact', resource_type: 'parent_contact', resource_id: contactId, child_id: childId,
  });
  res.json({ ok: true });
});
