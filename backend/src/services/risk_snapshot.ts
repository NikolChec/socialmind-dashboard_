import crypto from 'node:crypto';
import { db } from '../db/schema.js';

function childrenIds(): string[] {
  return (db.prepare(`SELECT id FROM children`).all() as Array<{ id: string }>).map((c) => c.id);
}

export function writeSnapshotForChild(childId: string, date: Date): void {
  const iso = date.toISOString();
  const day = iso.slice(0, 10);

  const alertCounts = db
    .prepare(
      `SELECT
        SUM(CASE WHEN priority='high' AND (acknowledged_at IS NULL OR acknowledged_at > ?) AND created_at <= ? THEN 1 ELSE 0 END) AS uh,
        SUM(CASE WHEN priority='medium' AND (acknowledged_at IS NULL OR acknowledged_at > ?) AND created_at <= ? THEN 1 ELSE 0 END) AS um,
        SUM(CASE WHEN priority='low' AND (acknowledged_at IS NULL OR acknowledged_at > ?) AND created_at <= ? THEN 1 ELSE 0 END) AS ul
       FROM alerts WHERE child_id = ?`
    )
    .get(iso, iso, iso, iso, iso, iso, childId) as { uh: number | null; um: number | null; ul: number | null };

  const uh = alertCounts.uh ?? 0;
  const um = alertCounts.um ?? 0;
  const ul = alertCounts.ul ?? 0;

  const recent = db
    .prepare(
      `SELECT metrics_json, started_at FROM sessions
       WHERE child_id = ? AND started_at <= ? ORDER BY started_at DESC LIMIT 6`
    )
    .all(childId, iso) as Array<{ metrics_json: string; started_at: string }>;

  const sentiments = recent.map((r) => JSON.parse(r.metrics_json).sentiment_score as number);
  const avgAll = sentiments.length > 0 ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length : null;
  const newer = sentiments.slice(0, 3);
  const older = sentiments.slice(3, 6);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const sentimentDrop =
    older.length > 0 && newer.length > 0 ? Math.max(0, avg(older) - avg(newer)) : 0;

  const latestSession = db
    .prepare(`SELECT started_at FROM sessions WHERE child_id = ? AND started_at <= ? ORDER BY started_at DESC LIMIT 1`)
    .get(childId, iso) as { started_at: string } | undefined;

  let score = 0;
  score += Math.min(40, uh * 20);
  score += Math.min(20, um * 5);
  score += Math.min(20, sentimentDrop * 40);
  if (!latestSession) {
    score += 15;
  } else {
    const daysSince = (date.getTime() - new Date(latestSession.started_at).getTime()) / (24 * 3600 * 1000);
    if (daysSince > 14) score += 20;
    else if (daysSince > 7) score += 10;
  }
  score = Math.min(100, Math.round(score));

  db.prepare(
    `INSERT INTO risk_snapshots (id, child_id, snapshot_date, risk_score, unread_high, unread_medium, unread_low, sentiment_avg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(child_id, snapshot_date) DO UPDATE SET
       risk_score = excluded.risk_score,
       unread_high = excluded.unread_high,
       unread_medium = excluded.unread_medium,
       unread_low = excluded.unread_low,
       sentiment_avg = excluded.sentiment_avg`
  ).run(crypto.randomUUID(), childId, day, score, uh, um, ul, avgAll);
}

export function backfillAllSnapshots(weeks = 12): void {
  const ids = childrenIds();
  const now = new Date();
  for (let w = weeks; w >= 0; w--) {
    const d = new Date(now);
    d.setDate(d.getDate() - w * 7);
    for (const id of ids) writeSnapshotForChild(id, d);
  }
}

export function writeTodaysSnapshots(): void {
  for (const id of childrenIds()) writeSnapshotForChild(id, new Date());
}
