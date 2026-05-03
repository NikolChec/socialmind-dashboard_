// Email-OTP layer that sits between password auth and JWT issuance.
// Flow: user posts email+password → we validate → if 2FA required for their role,
// we issue an opaque otp_token, mail a 6-digit code, and the client posts back
// { otp_token, code } to /auth/verify-otp to redeem the real session JWT.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/schema.js';
import { sendMail } from './email.js';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface OtpInitResult {
  otp_token: string;
  email: string;
  delivered: boolean;
}

// Generate + email a fresh code, store the hash, return the opaque token.
// The token IS the row id — single-use and rate-limited via the row's attempt counter.
// `subjectKind` distinguishes user-side OTPs from child-side OTPs at verify time.
export async function startOtp(
  userId: string,
  userName: string,
  userEmail: string,
  subjectKind: 'user' | 'child' = 'user',
): Promise<OtpInitResult> {
  // Six-digit zero-padded numeric code — easy to read in email.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = bcrypt.hashSync(code, 8);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO email_otps (id, user_id, code_hash, attempts, created_at, expires_at, subject_kind)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  ).run(id, userId, codeHash, new Date(now).toISOString(), new Date(now + OTP_TTL_MS).toISOString(), subjectKind);

  const subject = `SocialMind sign-in code: ${code}`;
  const text = [
    `Hi ${userName},`,
    '',
    `Your SocialMind sign-in code is: ${code}`,
    '',
    'It expires in 10 minutes. If you did not request this, ignore this email.',
    '',
    '— SocialMind',
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px">
    <p>Hi ${escapeHtml(userName)},</p>
    <p>Your SocialMind sign-in code is:</p>
    <p style="font-size:28px;font-weight:600;letter-spacing:6px;color:#6366f1;background:#f1f5f9;padding:16px 24px;border-radius:8px;display:inline-block">${code}</p>
    <p style="color:#64748b;font-size:13px">It expires in 10 minutes. If you did not request this, ignore this email.</p>
    <p style="color:#94a3b8;font-size:12px">— SocialMind</p>
  </div>`;

  const send = await sendMail({ to: userEmail, subject, text, html });
  return { otp_token: id, email: userEmail, delivered: send.ok };
}

// Verify a submitted code against a token. Mutates the row's attempt counter and consumed_at.
// Returns the matching userId on success, or an error code.
export type OtpVerifyResult =
  | { ok: true; user_id: string; subject_kind: 'user' | 'child' }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'wrong_code' | 'already_used' };

// `expectedKind` lets the caller restrict the lookup so a child-side endpoint can't
// redeem an admin OTP and vice versa.
export function verifyOtp(otpToken: string, submittedCode: string, expectedKind?: 'user' | 'child'): OtpVerifyResult {
  const row = db
    .prepare(
      `SELECT id, user_id, code_hash, attempts, expires_at, consumed_at, COALESCE(subject_kind,'user') AS subject_kind FROM email_otps WHERE id = ?`
    )
    .get(otpToken) as { id: string; user_id: string; code_hash: string; attempts: number; expires_at: string; consumed_at: string | null; subject_kind: 'user' | 'child' } | undefined;
  if (!row) return { ok: false, reason: 'not_found' };
  if (expectedKind && row.subject_kind !== expectedKind) return { ok: false, reason: 'not_found' };
  if (row.consumed_at) return { ok: false, reason: 'already_used' };
  if (Date.parse(row.expires_at) < Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  const matches = bcrypt.compareSync(submittedCode, row.code_hash);
  db.prepare(`UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?`).run(otpToken);
  if (!matches) return { ok: false, reason: 'wrong_code' };

  db.prepare(`UPDATE email_otps SET consumed_at = ? WHERE id = ?`).run(new Date().toISOString(), otpToken);
  return { ok: true, user_id: row.user_id, subject_kind: row.subject_kind };
}

// Mint a long-lived "trust this browser" cookie so the user only sees the OTP
// prompt on first sign-in from a given device.
export function issueTrustedDevice(
  userId: string,
  userAgent: string | null,
  subjectKind: 'user' | 'child' = 'user',
): { cookieValue: string; expiresAt: Date } {
  const raw = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomUUID();
  const tokenHash = bcrypt.hashSync(raw, 8);
  const now = new Date();
  const expires = new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS);
  db.prepare(
    `INSERT INTO trusted_devices (id, user_id, token_hash, user_agent, created_at, expires_at, subject_kind)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, tokenHash, userAgent, now.toISOString(), expires.toISOString(), subjectKind);
  // Cookie format: `<id>.<raw>` — id is the lookup key, raw is verified via bcrypt.
  return { cookieValue: `${id}.${raw}`, expiresAt: expires };
}

export function isTrustedDevice(
  userId: string,
  cookieValue: string | undefined,
  subjectKind: 'user' | 'child' = 'user',
): boolean {
  if (!cookieValue) return false;
  const [id, raw] = cookieValue.split('.');
  if (!id || !raw) return false;
  const row = db
    .prepare(`SELECT token_hash, expires_at, COALESCE(subject_kind,'user') AS subject_kind FROM trusted_devices WHERE id = ? AND user_id = ?`)
    .get(id, userId) as { token_hash: string; expires_at: string; subject_kind: 'user' | 'child' } | undefined;
  if (!row) return false;
  if (row.subject_kind !== subjectKind) return false;
  if (Date.parse(row.expires_at) < Date.now()) return false;
  if (!bcrypt.compareSync(raw, row.token_hash)) return false;
  db.prepare(`UPDATE trusted_devices SET last_used_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  return true;
}

// Roles that MUST do 2FA. Parents/teachers are optional.
export function role2faRequired(role: string): boolean {
  return role === 'school_admin' || role === 'psychologist';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
