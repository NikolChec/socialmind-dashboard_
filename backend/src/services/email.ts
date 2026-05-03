// Tiny nodemailer wrapper. Gmail SMTP is the default (host smtp.gmail.com:587 with STARTTLS),
// but any provider works — set SMTP_HOST/SMTP_PORT in .env to override.
import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

export interface MailOpts {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(opts: MailOpts): Promise<{ ok: boolean; reason?: string }> {
  const t = getTransporter();
  if (!t) {
    // No SMTP creds configured — fall back to logging so dev/staging keeps working.
    console.warn('[email] SMTP not configured; would have sent:', { to: opts.to, subject: opts.subject });
    console.warn('[email] body:', opts.text);
    return { ok: false, reason: 'smtp_not_configured' };
  }
  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@social-mind.org';
    await t.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
    return { ok: true };
  } catch (e) {
    console.error('[email] send failed:', e);
    return { ok: false, reason: 'send_failed' };
  }
}
