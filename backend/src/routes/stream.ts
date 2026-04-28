import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { subscribe } from '../services/events.js';

export const streamRouter = Router();

const TICKET_TTL_MS = 30_000;

streamRouter.post('/ticket', requireAuth, (req, res) => {
  const { id } = req.auth!;
  const ticket = crypto.randomUUID() + crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO sse_tickets (id, user_id, expires_at) VALUES (?, ?, ?)`
  ).run(ticket, id, expiresAt);
  res.json({ ticket, expires_at: expiresAt });
});

streamRouter.get('/alerts', (req, res) => {
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : null;
  if (!ticket) return res.status(401).json({ error: 'missing_ticket' });

  const row = db
    .prepare(`SELECT user_id, expires_at, used_at FROM sse_tickets WHERE id = ?`)
    .get(ticket) as { user_id: string; expires_at: string; used_at: string | null } | undefined;
  if (!row) return res.status(401).json({ error: 'invalid_ticket' });
  if (row.used_at) return res.status(401).json({ error: 'ticket_already_used' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ error: 'ticket_expired' });
  }
  db.prepare(`UPDATE sse_tickets SET used_at = ? WHERE id = ?`).run(new Date().toISOString(), ticket);
  db.prepare(`DELETE FROM sse_tickets WHERE expires_at < ?`).run(new Date(Date.now() - 60_000).toISOString());

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const unsubscribe = subscribe(row.user_id, res);
  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});
