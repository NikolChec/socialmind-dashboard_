import { db } from '../db/schema.js';

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM;
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;

type Severity = 'high' | 'medium';

interface NotifyInput {
  psychologist_id: string;
  child_id: string;
  child_name: string;
  severity: Severity;
  excerpt: string;
  alert_id: string;
}

async function sendSms(to: string, body: string): Promise<void> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log(`[notify stub] SMS to ${to}: ${body}`);
    return;
  }
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
  });
  if (!res.ok) {
    console.error('[twilio] send failed', res.status, await res.text());
  }
}

async function sendPush(token: string, title: string, body: string): Promise<void> {
  if (!FCM_SERVER_KEY) {
    console.log(`[notify stub] Push to ${token}: ${title} — ${body}`);
    return;
  }
  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${FCM_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: token, notification: { title, body } }),
  });
  if (!res.ok) {
    console.error('[fcm] send failed', res.status, await res.text());
  }
}

export async function notifyPsychologist(n: NotifyInput): Promise<void> {
  const user = db
    .prepare(`SELECT phone, fcm_token, name FROM users WHERE id = ?`)
    .get(n.psychologist_id) as { phone: string | null; fcm_token: string | null; name: string } | undefined;
  if (!user) return;

  const title = n.severity === 'high'
    ? `[SocialMind HIGH] ${n.child_name}`
    : `[SocialMind] ${n.child_name}`;
  const body = `${n.excerpt.slice(0, 120)}${n.excerpt.length > 120 ? '…' : ''}`;

  const tasks: Array<Promise<void>> = [];
  if (n.severity === 'high' && user.phone) tasks.push(sendSms(user.phone, `${title}\n${body}`));
  if (user.fcm_token) tasks.push(sendPush(user.fcm_token, title, body));
  await Promise.allSettled(tasks);
}

export function isStubbed(): boolean {
  return !TWILIO_SID && !FCM_SERVER_KEY;
}
