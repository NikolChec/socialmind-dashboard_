import crypto from 'node:crypto';
import type { Request } from 'express';
import { db } from '../db/schema.js';
import { requestMeta } from '../middleware/auth.js';

export interface AuditInput {
  user_id: string | null;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  child_id?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
}

const insert = () =>
  db.prepare(
    `INSERT INTO audit_log
      (id, user_id, user_name, action, resource_type, resource_id, child_id, metadata_json, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

export function recordAudit(entry: AuditInput) {
  insert().run(
    crypto.randomUUID(),
    entry.user_id,
    entry.user_name,
    entry.action,
    entry.resource_type,
    entry.resource_id ?? null,
    entry.child_id ?? null,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
    entry.ip ?? null,
    entry.user_agent ?? null,
    new Date().toISOString()
  );
}

export function auditFor(req: Request): (entry: Omit<AuditInput, 'ip' | 'user_agent'>) => void {
  const meta = requestMeta(req);
  return (entry) => recordAudit({ ...entry, ip: meta.ip, user_agent: meta.user_agent });
}

export function getUserName(userId: string | null | undefined): string {
  if (!userId) return 'system';
  const row = db.prepare(`SELECT name FROM users WHERE id = ?`).get(userId) as { name: string } | undefined;
  return row?.name ?? 'unknown';
}
