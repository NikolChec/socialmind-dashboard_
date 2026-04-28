import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Alert, AuditEntry, Child, EscalationAction, ProgressPoint, RiskSnapshotPoint, ScenarioBreakdown, Session } from '@socialmind/shared';
import { api } from '../lib/api';
import { ProgressChart } from '../components/ProgressChart';
import { RiskTrendChart } from '../components/RiskTrendChart';
import { PriorityBadge } from '../components/PriorityBadge';
import { RiskScoreBadge } from '../components/RiskScoreBadge';
import { ScenarioBreakdownList } from '../components/ScenarioBreakdown';
import { AlertActionDialog, useEscalationLabel } from '../components/AlertActionDialog';
import { SensitiveBadge } from '../components/SensitiveBadge';
import { ScenarioQueuePanel } from '../components/ScenarioQueuePanel';
import { ParentContactsPanel } from '../components/ParentContactsPanel';
import { TranscriptSearchPanel } from '../components/TranscriptSearchPanel';
import { ReportsPanel } from '../components/ReportsPanel';
import { AuditList } from '../components/AuditList';
import { formatDateTime, formatDuration, scenarioLabel, alertTypeLabel, timeAgo } from '../lib/format';
import { AssistantPanel } from '../components/AssistantPanel';
import { CompanionActivityPanel } from '../components/CompanionActivityPanel';
import { useAuth } from '../lib/auth';

type ChildRow = Child & { psychologist_name: string; is_sensitive: boolean };
type MetricKey = 'latency' | 'talk' | 'success' | 'sentiment';

export function ChildDetailPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [child, setChild] = useState<ChildRow | null>(null);
  const [summary, setSummary] = useState<{ risk_score: number; risk_reasons: string[] } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [progress, setProgress] = useState<ProgressPoint[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [breakdown, setBreakdown] = useState<ScenarioBreakdown[]>([]);
  const [riskHistory, setRiskHistory] = useState<RiskSnapshotPoint[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [metric, setMetric] = useState<MetricKey>('success');
  const [loading, setLoading] = useState(true);
  const [ackAlert, setAckAlert] = useState<Alert | null>(null);
  const escalationLabel = useEscalationLabel();
  const isParent = user?.role === 'parent';

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.child(id),
      api.childSessions(id),
      api.childProgress(id),
      api.childAlerts(id),
      api.childScenarioBreakdown(id),
      api.childRiskHistory(id),
      api.audit({ child_id: id, limit: 25 }),
      api.children(),
    ])
      .then(([c, s, p, a, b, rh, au, all]) => {
        setChild(c);
        setSessions(s);
        setProgress(p);
        setAlerts(a);
        setBreakdown(b);
        setRiskHistory(rh);
        setAudit(au);
        setSelectedSession(s[0] ?? null);
        const me = all.find((x) => x.id === id);
        if (me) setSummary({ risk_score: me.risk_score, risk_reasons: me.risk_reasons });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const recentStats = useMemo(() => {
    if (sessions.length === 0) return null;
    const latest = sessions.slice(0, 5);
    const successRate = latest.filter((s) => s.scenario_success).length / latest.length;
    const avgLatency = Math.round(latest.reduce((a, s) => a + s.metrics.response_latency_avg_ms, 0) / latest.length);
    return { successRate, avgLatency, total: sessions.length };
  }, [sessions]);

  async function confirmAck(body: { action_taken?: EscalationAction; action_note?: string }) {
    if (!ackAlert) return;
    await api.ackAlert(ackAlert.id, body);
    setAlerts((xs) =>
      xs.map((a) => a.id === ackAlert.id
        ? { ...a, acknowledged_at: new Date().toISOString(), action_taken: body.action_taken ?? null, action_note: body.action_note ?? null }
        : a
      )
    );
  }

  if (loading || !child) return <div className="text-muted">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/children" className="text-xs text-accent hover:underline">{t('common.back')}</Link>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">{child.display_name}</h1>
          {summary && <RiskScoreBadge score={summary.risk_score} reasons={summary.risk_reasons} size="md" />}
          {child.is_sensitive && <SensitiveBadge />}
          {user?.role === 'school_admin' && (
            <button
              onClick={async () => {
                await api.setSensitive(child.id, !child.is_sensitive);
                setChild({ ...child, is_sensitive: !child.is_sensitive });
              }}
              className="text-[11px] px-2 py-1 rounded border border-line text-slate-300 hover:bg-white/5"
            >
              {child.is_sensitive ? t('security.unmark_sensitive') : t('security.mark_sensitive')}
            </button>
          )}
        </div>
        <div className="text-sm text-muted">
          {t('child.grade', { n: child.grade })} · {t('child.psychologist', { name: child.psychologist_name })}
        </div>
        {child.notes && <div className="mt-2 text-sm text-slate-300 max-w-2xl">{child.notes}</div>}
        {summary && summary.risk_reasons.length > 0 && (
          <ul className="mt-3 text-xs text-slate-400 list-disc list-inside">
            {summary.risk_reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
      </div>

      {recentStats && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label={t('child.sessions_completed')} value={`${recentStats.total}`} />
          <Stat label={t('child.recent_success_rate')} value={`${Math.round(recentStats.successRate * 100)}%`} />
          <Stat label={t('child.recent_avg_latency')} value={`${recentStats.avgLatency} ms`} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-card border border-line rounded-lg">
          <header className="px-5 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-medium">{t('child.progress_title')}</h2>
            <div className="flex gap-1">
              {(['success', 'sentiment', 'talk', 'latency'] as MetricKey[]).map((k) => (
                <button key={k}
                  onClick={() => setMetric(k)}
                  className={`px-3 py-1 rounded text-xs ${
                    metric === k ? 'bg-accent/20 text-white' : 'text-slate-400 hover:bg-white/5'
                  }`}
                >
                  {t(`child.metric_${k}`)}
                </button>
              ))}
            </div>
          </header>
          <div className="p-5">
            {progress.length === 0 ? (
              <div className="text-muted text-sm">{t('child.progress_empty')}</div>
            ) : (
              <ProgressChart data={progress} metric={metric} />
            )}
          </div>
        </section>

        <section className="bg-card border border-line rounded-lg">
          <header className="px-5 py-3 border-b border-line">
            <h2 className="font-medium">{t('child.scenario_perf_title')}</h2>
            <p className="text-xs text-muted mt-0.5">{t('child.scenario_perf_subtitle')}</p>
          </header>
          <div className="p-5">
            <ScenarioBreakdownList data={breakdown} />
          </div>
        </section>
      </div>

      <section className="bg-card border border-line rounded-lg">
        <header className="px-5 py-3 border-b border-line">
          <h2 className="font-medium">{t('child.risk_trend_title')}</h2>
        </header>
        <div className="p-5">
          <RiskTrendChart data={riskHistory} />
        </div>
      </section>

      {isParent && (
        <div className="text-xs text-amber-300 bg-warn/10 border border-warn/30 rounded px-3 py-2">
          {t('parent.readonly_note')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScenarioQueuePanel childId={child.id} readOnly={isParent} />
        <ReportsPanel childId={child.id} />
      </div>

      <ParentContactsPanel childId={child.id} readOnly={isParent} />

      <TranscriptSearchPanel childId={child.id} />

      <div className={`grid gap-6 ${isParent ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
        <section className={`bg-card border border-line rounded-lg ${isParent ? '' : 'lg:col-span-2'}`}>
          <header className="px-5 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-medium">{t('child.sessions')}</h2>
            <span className="text-xs text-muted">{t('child.total_count', { n: sessions.length })}</span>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-5 divide-x divide-line">
            <ul className="md:col-span-2 divide-y divide-line max-h-[32rem] overflow-y-auto scrollbar-thin">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedSession(s)}
                    className={`w-full text-start px-5 py-3 hover:bg-white/[0.03] ${
                      selectedSession?.id === s.id ? 'bg-white/[0.04]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-100">{scenarioLabel(s.scenario)}</div>
                      <span className={`text-[11px] rounded px-1.5 py-0.5 ${
                        s.scenario_success ? 'bg-good/15 text-green-300' : 'bg-bad/15 text-red-300'
                      }`}>
                        {s.scenario_success ? t('child.session_success') : t('child.session_incomplete')}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {formatDateTime(s.started_at)} · {formatDuration(s.duration_sec)}
                      {s.notes && <span className="ms-2 text-accent">· {t('child.has_note')}</span>}
                    </div>
                  </button>
                </li>
              ))}
              {sessions.length === 0 && <li className="px-5 py-6 text-sm text-muted">{t('child.select_session_hint')}</li>}
            </ul>
            <div className="md:col-span-3 p-5 min-h-[32rem] max-h-[32rem] overflow-y-auto scrollbar-thin">
              {selectedSession ? (
                <SessionDetail
                  key={selectedSession.id}
                  childId={child.id}
                  childName={child.display_name}
                  session={selectedSession}
                  readOnly={isParent}
                  onNotesSaved={(notes) => {
                    setSelectedSession((s) => s ? { ...s, notes } : s);
                    setSessions((xs) => xs.map((s) => s.id === selectedSession.id ? { ...s, notes } : s));
                  }}
                />
              ) : (
                <div className="text-sm text-muted">{t('child.select_session_hint')}</div>
              )}
            </div>
          </div>
        </section>

        {!isParent && (
        <section className="bg-card border border-line rounded-lg">
          <header className="px-5 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-medium">{t('child.alerts')}</h2>
            <span className="text-xs text-muted">{alerts.length}</span>
          </header>
          <ul className="divide-y divide-line max-h-[32rem] overflow-y-auto scrollbar-thin">
            {alerts.length === 0 && <li className="px-5 py-6 text-sm text-muted">{t('child.no_alerts')}</li>}
            {alerts.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <PriorityBadge priority={a.priority} />
                  <span className="text-xs text-muted">{alertTypeLabel(a.type)}</span>
                  <span className="ms-auto text-xs text-muted">{timeAgo(a.created_at)}</span>
                </div>
                <div className="text-sm text-slate-200">"{a.excerpt}"</div>
                {a.context && <div className="text-xs text-muted mt-1">{a.context}</div>}
                {!a.acknowledged_at ? (
                  !isParent && (
                    <button
                      onClick={() => setAckAlert(a)}
                      className="mt-2 text-xs px-2 py-1 rounded border border-line text-slate-300 hover:bg-white/5"
                    >
                      {t('alerts.mark_reviewed')}
                    </button>
                  )
                ) : (
                  <div className="mt-1">
                    <div className="text-xs text-green-300">{t('child.reviewed_ago', { ago: timeAgo(a.acknowledged_at) })}</div>
                    {a.action_taken && (
                      <div className="text-xs text-muted">{t('child.action_label', { label: escalationLabel(a.action_taken) })}</div>
                    )}
                    {a.action_note && (
                      <div className="text-xs text-slate-400 italic">"{a.action_note}"</div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
        )}
      </div>

      <section className="bg-card border border-line rounded-lg">
        <header className="px-5 py-3 border-b border-line">
          <h2 className="font-medium">{t('child.activity_title')}</h2>
        </header>
        <div className="px-5 py-3">
          <AuditList entries={audit} />
        </div>
      </section>

      <CompanionActivityPanel childId={child.id} childName={child.display_name} />

      <AssistantPanel childId={child.id} childName={child.display_name} />

      {ackAlert && (
        <AlertActionDialog
          alert={ackAlert}
          onClose={() => setAckAlert(null)}
          onSubmit={confirmAck}
        />
      )}
    </div>
  );
}

function SessionDetail({
  childId, childName, session, onNotesSaved, readOnly,
}: { childId: string; childName: string; session: Session; onNotesSaved: (notes: string) => void; readOnly: boolean }) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(session.notes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateSessionNotes(childId, session.id, notes);
      onNotesSaved(notes);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  const dirty = notes !== session.notes;

  return (
    <>
      <div className="mb-3">
        <div className="text-sm text-slate-100 font-medium">{scenarioLabel(session.scenario)}</div>
        <div className="text-xs text-muted">
          {session.ai_character_name} · {formatDateTime(session.started_at)}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4 text-xs">
        <Metric label={t('child.metric_latency')} value={`${session.metrics.response_latency_avg_ms} ms`} />
        <Metric label={t('child.metric_talk')} value={`${Math.round(session.metrics.talk_time_ratio * 100)}%`} />
        <Metric label={t('child.metric_words')} value={String(session.metrics.word_count)} />
        <Metric label={t('child.metric_sentiment')} value={session.metrics.sentiment_score.toFixed(2)} />
      </div>

      <div className="text-xs text-muted mb-2 uppercase tracking-wider">{t('child.transcript')}</div>
      <ul className="space-y-2 mb-5">
        {session.transcript.map((t, i) => (
          <li key={i} className={`text-sm flex gap-2 ${t.speaker === 'ai' ? '' : 'justify-end'}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
              t.speaker === 'ai' ? 'bg-white/5 text-slate-200' : 'bg-accent/15 text-slate-100'
            }`}>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">
                {t.speaker === 'ai' ? session.ai_character_name : childName}
              </div>
              {t.text}
            </div>
          </li>
        ))}
      </ul>

      {!readOnly && (
        <div className="border-t border-line pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted uppercase tracking-wider">{t('child.clinician_notes')}</div>
            {saved && <span className="text-xs text-green-300">{t('common.saved')}</span>}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t('child.notes_placeholder')}
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-3 py-1.5 rounded bg-accent hover:bg-accent/90 disabled:opacity-50 text-xs font-medium text-white"
            >
              {saving ? t('common.saving') : t('child.save_note')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-line rounded-lg p-4">
      <div className="text-xs text-muted uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink border border-line rounded px-2 py-1.5">
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className="text-slate-100 text-sm">{value}</div>
    </div>
  );
}
