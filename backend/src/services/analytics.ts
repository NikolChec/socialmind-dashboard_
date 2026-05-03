import { db } from '../db/schema.js';

export interface ChildRiskRow {
  id: string;
  school_id: string;
  psychologist_id: string;
  display_name: string;
  grade: number;
  date_of_birth: string;
  notes: string;
  created_at: string;
  psychologist_name: string;
  unread_alerts: number;
  unread_high: number;
  unread_medium: number;
  unread_low: number;
  total_high: number;
  total_medium: number;
  total_low: number;
  last_session_at: string | null;
  sessions_14d: number;
  risk_score: number;
  risk_reasons: string[];
}

export function computeChildrenForScope(scope: { role: string; userId: string; schoolId: string }): ChildRiskRow[] {
  const { role, userId, schoolId } = scope;

  const baseRows = (
    role === 'school_admin'
      ? db.prepare(
          `SELECT c.*, u.name AS psychologist_name
           FROM children c JOIN users u ON u.id = c.psychologist_id
           WHERE c.school_id = ? ORDER BY c.display_name`
        ).all(schoolId)
      : role === 'psychologist'
      ? db.prepare(
          `SELECT c.*, u.name AS psychologist_name
           FROM children c JOIN users u ON u.id = c.psychologist_id
           WHERE c.psychologist_id = ?
              OR c.id IN (SELECT child_id FROM child_psychologists WHERE psychologist_id = ?)
           ORDER BY c.display_name`
        ).all(userId, userId)
      : role === 'teacher'
      ? db.prepare(
          `SELECT c.*, u.name AS psychologist_name
           FROM children c JOIN users u ON u.id = c.psychologist_id
           WHERE c.id IN (SELECT child_id FROM child_teachers WHERE teacher_id = ?)
           ORDER BY c.display_name`
        ).all(userId)
      : db.prepare(
          `SELECT c.*, u.name AS psychologist_name
           FROM children c JOIN users u ON u.id = c.psychologist_id
           WHERE c.id IN (SELECT child_id FROM child_parents WHERE parent_id = ?)
           ORDER BY c.display_name`
        ).all(userId)
  ) as Array<Omit<ChildRiskRow, 'unread_alerts' | 'unread_high' | 'unread_medium' | 'unread_low' | 'total_high' | 'total_medium' | 'total_low' | 'last_session_at' | 'sessions_14d' | 'risk_score' | 'risk_reasons'>>;

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  return baseRows.map((c) => {
    const alertCounts = db.prepare(
      `SELECT
        SUM(CASE WHEN priority='high' AND acknowledged_at IS NULL THEN 1 ELSE 0 END) AS uh,
        SUM(CASE WHEN priority='medium' AND acknowledged_at IS NULL THEN 1 ELSE 0 END) AS um,
        SUM(CASE WHEN priority='low' AND acknowledged_at IS NULL THEN 1 ELSE 0 END) AS ul,
        SUM(CASE WHEN priority='high' THEN 1 ELSE 0 END) AS th,
        SUM(CASE WHEN priority='medium' THEN 1 ELSE 0 END) AS tm,
        SUM(CASE WHEN priority='low' THEN 1 ELSE 0 END) AS tl
       FROM alerts WHERE child_id = ?`
    ).get(c.id) as { uh: number | null; um: number | null; ul: number | null; th: number | null; tm: number | null; tl: number | null };

    const uh = alertCounts.uh ?? 0;
    const um = alertCounts.um ?? 0;
    const ul = alertCounts.ul ?? 0;
    const th = alertCounts.th ?? 0;
    const tm = alertCounts.tm ?? 0;
    const tl = alertCounts.tl ?? 0;

    const lastSession = db.prepare(
      `SELECT started_at FROM sessions WHERE child_id = ? ORDER BY started_at DESC LIMIT 1`
    ).get(c.id) as { started_at: string } | undefined;

    const recentSessions = db.prepare(
      `SELECT started_at, metrics_json FROM sessions
       WHERE child_id = ? ORDER BY started_at DESC LIMIT 6`
    ).all(c.id) as Array<{ started_at: string; metrics_json: string }>;

    const sessions14d = db.prepare(
      `SELECT COUNT(*) AS n FROM sessions WHERE child_id = ? AND started_at >= ?`
    ).get(c.id, fourteenDaysAgo) as { n: number };

    const recentSentiments = recentSessions.slice(0, 3).map((s) => JSON.parse(s.metrics_json).sentiment_score as number);
    const olderSentiments = recentSessions.slice(3, 6).map((s) => JSON.parse(s.metrics_json).sentiment_score as number);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const sentimentDrop = olderSentiments.length > 0 && recentSentiments.length > 0
      ? Math.max(0, avg(olderSentiments) - avg(recentSentiments))
      : 0;

    const reasons: string[] = [];
    let score = 0;

    const highScore = Math.min(40, uh * 20);
    if (highScore > 0) reasons.push(`${uh} unreviewed high-priority alert${uh > 1 ? 's' : ''}`);
    score += highScore;

    const mediumScore = Math.min(20, um * 5);
    if (mediumScore > 0) reasons.push(`${um} unreviewed medium alert${um > 1 ? 's' : ''}`);
    score += mediumScore;

    const sentimentScore = Math.min(20, sentimentDrop * 40);
    if (sentimentScore > 5) reasons.push(`sentiment dropped ${sentimentDrop.toFixed(2)} over last 3 sessions`);
    score += sentimentScore;

    let engagementScore = 0;
    if (!lastSession) {
      engagementScore = 15;
      reasons.push('no sessions yet');
    } else {
      const daysSince = (Date.now() - new Date(lastSession.started_at).getTime()) / (24 * 3600 * 1000);
      if (daysSince > 14) {
        engagementScore = 20;
        reasons.push(`no session in ${Math.floor(daysSince)} days`);
      } else if (daysSince > 7) {
        engagementScore = 10;
        reasons.push(`last session ${Math.floor(daysSince)} days ago`);
      } else if (sessions14d.n === 0) {
        engagementScore = 5;
      }
    }
    score += engagementScore;

    return {
      ...c,
      unread_alerts: uh + um + ul,
      unread_high: uh,
      unread_medium: um,
      unread_low: ul,
      total_high: th,
      total_medium: tm,
      total_low: tl,
      last_session_at: lastSession?.started_at ?? null,
      sessions_14d: sessions14d.n,
      risk_score: Math.min(100, Math.round(score)),
      risk_reasons: reasons,
    };
  });
}
