import type { Response } from 'express';

export interface AlertEvent {
  type: 'new_alert';
  priority: 'high' | 'medium' | 'low';
  child_id: string;
  child_name: string;
  excerpt: string;
  alert_id: string;
  created_at: string;
}

type Sub = { userId: string; res: Response };
const subs = new Set<Sub>();

export function subscribe(userId: string, res: Response): () => void {
  const sub: Sub = { userId, res };
  subs.add(sub);
  res.write(': connected\n\n');
  const keepalive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* noop */ }
  }, 25000);
  return () => {
    clearInterval(keepalive);
    subs.delete(sub);
  };
}

export function broadcastToUser(userId: string, event: AlertEvent) {
  for (const sub of subs) {
    if (sub.userId !== userId) continue;
    try {
      sub.res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      subs.delete(sub);
    }
  }
}
