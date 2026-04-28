import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/schema.js';

const DEFAULT_SECRET = 'dev-secret-change-me';
export const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
export const JWT_TTL_SECONDS = 8 * 60 * 60; // 8 hours (down from 7 days)

if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_SECRET) {
  throw new Error(
    'SECURITY: JWT_SECRET must be set to a strong random value in production. Refusing to start.'
  );
}

export interface AuthPayload {
  id: string;
  role: 'school_admin' | 'psychologist' | 'parent';
  school_id: string;
}

export interface RequestMeta {
  ip: string | null;
  user_agent: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

export function requireRole(...roles: AuthPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

export function userCanAccessChild(userId: string, childId: string, role: string): boolean {
  if (role === 'school_admin') {
    const user = db.prepare('SELECT school_id FROM users WHERE id = ?').get(userId) as { school_id: string } | undefined;
    const child = db.prepare('SELECT school_id FROM children WHERE id = ?').get(childId) as { school_id: string } | undefined;
    return !!user && !!child && user.school_id === child.school_id;
  }
  if (role === 'psychologist') {
    const row = db.prepare('SELECT 1 FROM children WHERE id = ? AND psychologist_id = ?').get(childId, userId);
    return !!row;
  }
  if (role === 'parent') {
    const row = db.prepare('SELECT 1 FROM child_parents WHERE child_id = ? AND parent_id = ?').get(childId, userId);
    return !!row;
  }
  return false;
}

// Backwards-compat alias (old callsites)
export const psychologistCanAccessChild = userCanAccessChild;

export function isReadOnlyRole(role: string): boolean {
  return role === 'parent';
}

export function requestMeta(req: Request): RequestMeta {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0].trim();
  return {
    ip: first || req.ip || req.socket.remoteAddress || null,
    user_agent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}
