import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../db/schema.js';
import { requireAuth, psychologistCanAccessChild } from '../middleware/auth.js';
import { auditFor, getUserName } from '../services/audit.js';
import type { ScenarioQueueItem } from '@socialmind/shared';

export const queueRouter = Router();
queueRouter.use(requireAuth);

const addSchema = z.object({
  scenario: z.string(),
  notes: z.string().max(500).optional(),
});

queueRouter.get('/:childId', (req, res) => {
  const { id: userId, role } = req.auth!;
  const { childId } = req.params;
  if (!psychologistCanAccessChild(userId, childId, role)) return res.status(403).json({ error: 'forbidden' });
  const rows = db
    .prepare(
      `SELECT q.*, u.name AS assigned_by_name
       FROM scenario_queue q JOIN users u ON u.id = q.assigned_by
       WHERE q.child_id = ? AND q.consumed_at IS NULL
       ORDER BY q.assigned_at DESC`
    )
    .all(childId) as ScenarioQueueItem[];
  res.json(rows);
});

queueRouter.post('/:childId', (req, res) => {
  const { id: userId, role } = req.auth!;
  if (role === 'parent') return res.status(403).json({ error: 'read_only' });
  const { childId } = req.params;
  if (!psychologistCanAccessChild(userId, childId, role)) return res.status(403).json({ error: 'forbidden' });
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO scenario_queue (id, child_id, scenario, assigned_by, assigned_at, notes) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, childId, parsed.data.scenario, userId, new Date().toISOString(), parsed.data.notes ?? '');
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'queued_scenario', resource_type: 'scenario_queue', resource_id: id, child_id: childId,
    metadata: { scenario: parsed.data.scenario },
  });
  res.json({ id });
});

queueRouter.delete('/:childId/:itemId', (req, res) => {
  const { id: userId, role } = req.auth!;
  if (role === 'parent') return res.status(403).json({ error: 'read_only' });
  const { childId, itemId } = req.params;
  if (!psychologistCanAccessChild(userId, childId, role)) return res.status(403).json({ error: 'forbidden' });
  const row = db.prepare(`SELECT scenario FROM scenario_queue WHERE id = ? AND child_id = ?`).get(itemId, childId) as { scenario: string } | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare(`DELETE FROM scenario_queue WHERE id = ?`).run(itemId);
  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'removed_scenario', resource_type: 'scenario_queue', resource_id: itemId, child_id: childId,
    metadata: { scenario: row.scenario },
  });
  res.json({ ok: true });
});
