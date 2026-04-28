import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db/schema.js';
import { JWT_SECRET, JWT_TTL_SECONDS, requireAuth } from '../middleware/auth.js';
import { auditFor, getUserName } from '../services/audit.js';
import type { AuthUser } from '@socialmind/shared';

export const authRouter = Router();

const isDev = process.env.NODE_ENV !== 'production';
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: isDev ? 120 : 10, // lenient in dev so testing doesn't block you
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

const LOCKOUT_ATTEMPTS = isDev ? 25 : 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = isDev ? 2 * 60 * 1000 : 30 * 60 * 1000; // 2 min in dev vs 30 min in prod

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'school_admin' | 'psychologist' | 'parent';
  school_id: string;
  password_hash: string;
  school_name: string;
  failed_login_attempts: number | null;
  last_failed_login: string | null;
  locked_until: string | null;
}

authRouter.post('/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const { email, password } = parsed.data;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.school_id, u.password_hash,
              u.failed_login_attempts, u.last_failed_login, u.locked_until,
              s.name AS school_name
       FROM users u JOIN schools s ON s.id = u.school_id
       WHERE lower(u.email) = lower(?)`
    )
    .get(email) as UserRow | undefined;

  const now = Date.now();
  const audit = auditFor(req);

  if (row?.locked_until && new Date(row.locked_until).getTime() > now) {
    const unlockIn = Math.ceil((new Date(row.locked_until).getTime() - now) / 60_000);
    audit({
      user_id: row.id, user_name: row.name,
      action: 'login_blocked_locked', resource_type: 'auth', resource_id: row.id,
    });
    return res.status(423).json({ error: 'account_locked', unlock_in_minutes: unlockIn });
  }

  const ok = row ? bcrypt.compareSync(password, row.password_hash) : false;
  if (!ok) {
    if (row) {
      const last = row.last_failed_login ? new Date(row.last_failed_login).getTime() : 0;
      const withinWindow = now - last < LOCKOUT_WINDOW_MS;
      const attempts = (withinWindow ? (row.failed_login_attempts ?? 0) : 0) + 1;
      const shouldLock = attempts >= LOCKOUT_ATTEMPTS;
      db.prepare(
        `UPDATE users SET failed_login_attempts = ?, last_failed_login = ?, locked_until = ? WHERE id = ?`
      ).run(
        attempts,
        new Date(now).toISOString(),
        shouldLock ? new Date(now + LOCKOUT_DURATION_MS).toISOString() : row.locked_until,
        row.id
      );
      audit({
        user_id: row.id, user_name: row.name,
        action: shouldLock ? 'login_failed_locked_out' : 'login_failed',
        resource_type: 'auth', resource_id: row.id,
        metadata: { attempts, email },
      });
    } else {
      audit({
        user_id: null, user_name: email,
        action: 'login_failed_unknown_user', resource_type: 'auth',
        metadata: { email },
      });
    }
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  if (!row) return res.status(401).json({ error: 'invalid_credentials' });

  db.prepare(
    `UPDATE users SET failed_login_attempts = 0, last_failed_login = NULL, locked_until = NULL WHERE id = ?`
  ).run(row.id);

  const user: AuthUser = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    school_id: row.school_id,
    school_name: row.school_name,
  };
  const token = jwt.sign({ id: user.id, role: user.role, school_id: user.school_id }, JWT_SECRET, {
    expiresIn: JWT_TTL_SECONDS,
  });

  audit({
    user_id: user.id, user_name: user.name,
    action: 'login_success', resource_type: 'auth', resource_id: user.id,
  });

  res.json({ token, user, expires_in: JWT_TTL_SECONDS });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.school_id, s.name AS school_name
       FROM users u JOIN schools s ON s.id = u.school_id WHERE u.id = ?`
    )
    .get(req.auth!.id) as AuthUser | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

authRouter.post('/logout', requireAuth, (req, res) => {
  const { id } = req.auth!;
  auditFor(req)({
    user_id: id, user_name: getUserName(id),
    action: 'logout', resource_type: 'auth', resource_id: id,
  });
  res.json({ ok: true });
});
