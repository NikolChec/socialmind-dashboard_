import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './auth.js';

export const CHILD_JWT_TTL_SECONDS = 24 * 60 * 60;

export interface ChildAuthPayload {
  child_id: string;
  school_id: string;
  kind: 'child';
}

declare global {
  namespace Express {
    interface Request {
      child?: ChildAuthPayload;
    }
  }
}

export function signChildToken(p: Omit<ChildAuthPayload, 'kind'>): string {
  return jwt.sign({ ...p, kind: 'child' as const }, JWT_SECRET, {
    expiresIn: CHILD_JWT_TTL_SECONDS,
  });
}

export function requireChildAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' });
  }
  try {
    const payload = jwt.verify(header.slice('Bearer '.length), JWT_SECRET) as ChildAuthPayload;
    if (payload.kind !== 'child' || !payload.child_id) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    req.child = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
