import { Router } from 'express';
import { db } from '../db/schema.js';
import { requireAuth, psychologistCanAccessChild } from '../middleware/auth.js';
import type { AuditEntry } from '@socialmind/shared';

export const auditRouter = Router();
auditRouter.use(requireAuth);

function parseRow(r: {
  id: string; user_id: string | null; user_name: string; action: string;
  resource_type: string; resource_id: string | null; child_id: string | null;
  metadata_json: string | null; ip: string | null; user_agent: string | null; created_at: string;
}): AuditEntry {
  return {
    id: r.id,
    user_id: r.user_id,
    user_name: r.user_name,
    action: r.action,
    resource_type: r.resource_type,
    resource_id: r.resource_id,
    child_id: r.child_id,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
    ip: r.ip,
    user_agent: r.user_agent,
    created_at: r.created_at,
  };
}

auditRouter.get('/', (req, res) => {
  const { id, role, school_id } = req.auth!;
  const onlyMine = req.query.mine === 'true';
  const childId = typeof req.query.child_id === 'string' ? req.query.child_id : null;
  const limit = Math.min(500, Number(req.query.limit) || 200);

  if (childId && !psychologistCanAccessChild(id, childId, role)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const parts: string[] = [];
  const params: Array<string | number> = [];

  if (role === 'school_admin') {
    parts.push(`(a.child_id IN (SELECT id FROM children WHERE school_id = ?) OR a.user_id IN (SELECT id FROM users WHERE school_id = ?))`);
    params.push(school_id, school_id);
  } else if (role === 'psychologist') {
    parts.push(`(a.child_id IN (SELECT id FROM children WHERE psychologist_id = ?) OR a.user_id = ?)`);
    params.push(id, id);
  } else {
    // parents see only events on their own children, and only clinical actions by the psychologist
    parts.push(`a.child_id IN (SELECT child_id FROM child_parents WHERE parent_id = ?)`);
    params.push(id);
    parts.push(`a.user_id IN (SELECT id FROM users WHERE role = 'psychologist')`);
  }
  if (onlyMine) {
    parts.push(`a.user_id = ?`);
    params.push(id);
  }
  if (childId) {
    parts.push(`a.child_id = ?`);
    params.push(childId);
  }

  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT a.* FROM audit_log a ${where} ORDER BY a.created_at DESC LIMIT ?`)
    .all(...params, limit) as Parameters<typeof parseRow>[0][];
  res.json(rows.map(parseRow));
});
