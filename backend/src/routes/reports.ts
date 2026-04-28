import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { db } from '../db/schema.js';
import { requireAuth, psychologistCanAccessChild } from '../middleware/auth.js';
import { auditFor, getUserName } from '../services/audit.js';
import { computeChildrenForScope } from '../services/analytics.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get('/child/:id', (req, res) => {
  const { id: userId, role, school_id } = req.auth!;
  const childId = req.params.id;
  if (!psychologistCanAccessChild(userId, childId, role)) return res.status(403).json({ error: 'forbidden' });
  const weeks = Math.max(1, Math.min(52, Number(req.query.weeks) || 4));

  const child = db
    .prepare(
      `SELECT c.*, u.name AS psychologist_name FROM children c JOIN users u ON u.id = c.psychologist_id WHERE c.id = ?`
    )
    .get(childId) as
    | { id: string; display_name: string; grade: number; notes: string; psychologist_name: string; date_of_birth: string; is_sensitive: number }
    | undefined;
  if (!child) return res.status(404).json({ error: 'not_found' });

  if (child.is_sensitive && req.query.confirm !== '1') {
    return res.status(428).json({ error: 'confirmation_required', reason: 'sensitive_child' });
  }

  const summary = computeChildrenForScope({ role, userId, schoolId: school_id }).find((c) => c.id === childId);

  const since = new Date(Date.now() - weeks * 7 * 24 * 3600 * 1000).toISOString();

  const sessions = db
    .prepare(
      `SELECT scenario, started_at, scenario_success, duration_sec, metrics_json, notes
       FROM sessions WHERE child_id = ? AND started_at >= ? ORDER BY started_at DESC`
    )
    .all(childId, since) as Array<{
    scenario: string; started_at: string; scenario_success: number;
    duration_sec: number; metrics_json: string; notes: string | null;
  }>;

  const alerts = db
    .prepare(
      `SELECT priority, type, excerpt, created_at, acknowledged_at, action_taken
       FROM alerts WHERE child_id = ? AND created_at >= ? ORDER BY created_at DESC`
    )
    .all(childId, since) as Array<{
    priority: string; type: string; excerpt: string; created_at: string;
    acknowledged_at: string | null; action_taken: string | null;
  }>;

  const contacts = db
    .prepare(
      `SELECT contacted_at, method, person, topic, outcome FROM parent_contacts
       WHERE child_id = ? AND contacted_at >= ? ORDER BY contacted_at DESC`
    )
    .all(childId, since) as Array<{ contacted_at: string; method: string; person: string; topic: string; outcome: string }>;

  const scenarioAgg = new Map<string, { n: number; wins: number }>();
  for (const s of sessions) {
    const b = scenarioAgg.get(s.scenario) ?? { n: 0, wins: 0 };
    b.n += 1;
    b.wins += s.scenario_success ? 1 : 0;
    scenarioAgg.set(s.scenario, b);
  }

  auditFor(req)({
    user_id: userId, user_name: getUserName(userId),
    action: 'downloaded_report', resource_type: 'report', resource_id: `child-${childId}-${weeks}w`,
    child_id: childId, metadata: { weeks, sensitive: !!child.is_sensitive },
  });

  const filename = `${child.display_name.replace(/\s+/g, '_')}_${weeks}w.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.pipe(res);

  doc.fontSize(20).fillColor('#1e293b').text('SocialMind — Clinician Report', { align: 'left' });
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor('#475569').text(`${weeks}-week period ending ${new Date().toISOString().slice(0, 10)}`);
  doc.moveDown(1);

  doc.fontSize(14).fillColor('#0f172a').text(child.display_name);
  doc.fontSize(10).fillColor('#475569').text(`Grade ${child.grade} · DOB ${child.date_of_birth}`);
  doc.text(`Psychologist: ${child.psychologist_name}`);
  if (summary) {
    const label = summary.risk_score >= 60 ? 'HIGH RISK' : summary.risk_score >= 30 ? 'MONITOR' : 'STABLE';
    doc.moveDown(0.3).fillColor('#0f172a').text(`Risk score: ${summary.risk_score} — ${label}`);
    if (summary.risk_reasons.length) {
      doc.fontSize(9).fillColor('#475569');
      for (const r of summary.risk_reasons) doc.text(`  • ${r}`);
    }
  }
  if (child.notes) {
    doc.moveDown(0.4).fontSize(10).fillColor('#0f172a').text('Background notes:', { continued: false });
    doc.fontSize(9).fillColor('#475569').text(child.notes);
  }

  doc.moveDown(0.8).fontSize(12).fillColor('#0f172a').text('Summary');
  doc.fontSize(10).fillColor('#334155');
  const successes = sessions.filter((s) => s.scenario_success).length;
  const successRate = sessions.length ? Math.round((successes / sessions.length) * 100) : 0;
  const avgLatency = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + (JSON.parse(s.metrics_json).response_latency_avg_ms as number), 0) / sessions.length)
    : 0;
  doc.text(`Sessions: ${sessions.length}`);
  doc.text(`Scenario success rate: ${successRate}%`);
  doc.text(`Average response latency: ${avgLatency} ms`);
  doc.text(`Alerts raised: ${alerts.length} (high: ${alerts.filter((a) => a.priority === 'high').length}, medium: ${alerts.filter((a) => a.priority === 'medium').length})`);
  doc.text(`Parent/guardian contacts logged: ${contacts.length}`);

  if (scenarioAgg.size > 0) {
    doc.moveDown(0.8).fontSize(12).fillColor('#0f172a').text('Scenario performance');
    doc.fontSize(10).fillColor('#334155');
    for (const [s, b] of Array.from(scenarioAgg.entries()).sort((a, b) => a[1].wins / a[1].n - b[1].wins / b[1].n)) {
      doc.text(`  ${s.replace(/_/g, ' ')}: ${b.wins}/${b.n} (${Math.round((b.wins / b.n) * 100)}%)`);
    }
  }

  if (alerts.length > 0) {
    doc.moveDown(0.8).fontSize(12).fillColor('#0f172a').text('Alerts');
    doc.fontSize(9).fillColor('#334155');
    for (const a of alerts) {
      doc.text(`[${a.priority}] ${a.created_at.slice(0, 10)} ${a.type.replace(/_/g, ' ')} — "${a.excerpt}"${a.acknowledged_at ? ' [reviewed]' : ' [OPEN]'}${a.action_taken ? ` (${a.action_taken.replace(/_/g, ' ')})` : ''}`);
    }
  }

  if (contacts.length > 0) {
    doc.moveDown(0.8).fontSize(12).fillColor('#0f172a').text('Parent / guardian contacts');
    doc.fontSize(9).fillColor('#334155');
    for (const c of contacts) {
      doc.text(`${c.contacted_at.slice(0, 10)} · ${c.method} · ${c.person} — ${c.topic}${c.outcome ? ` → ${c.outcome}` : ''}`);
    }
  }

  const withNotes = sessions.filter((s) => s.notes && s.notes.trim().length > 0);
  if (withNotes.length > 0) {
    doc.moveDown(0.8).fontSize(12).fillColor('#0f172a').text('Recent clinician notes');
    doc.fontSize(9).fillColor('#334155');
    for (const s of withNotes.slice(0, 10)) {
      doc.text(`${s.started_at.slice(0, 10)} (${s.scenario.replace(/_/g, ' ')}): ${s.notes}`);
    }
  }

  doc.moveDown(1.5).fontSize(8).fillColor('#94a3b8').text('Generated by SocialMind Clinician. Confidential — share only with authorized parties.', { align: 'center' });
  doc.end();
});
