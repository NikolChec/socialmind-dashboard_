import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, Plus, Check, X, MessageCircle, Sparkles } from 'lucide-react';
import type { ScenarioQueueRequest, ScenarioType } from '@socialmind/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { scenarioLabel, timeAgo } from '../lib/format';

const SCENARIOS: ScenarioType[] = [
  'asking_teacher_for_help', 'joining_group_conversation', 'handling_disagreement',
  'ordering_in_public', 'introducing_yourself', 'presenting_in_class',
  'refusing_peer_pressure', 'asking_for_a_date',
];

export function ScenarioRequestsPanel({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [requests, setRequests] = useState<ScenarioQueueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const canSubmit = user?.role === 'teacher' || user?.role === 'parent';
  const canDecide = user?.role === 'psychologist' || user?.role === 'school_admin';

  async function load() {
    setLoading(true);
    try {
      setRequests(await api.childScenarioRequests(childId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [childId]);

  async function submit(scenario: ScenarioType, notes: string) {
    await api.submitScenarioRequest(childId, { scenario, notes });
    setShowForm(false);
    await load();
  }
  async function approve(reqId: string) {
    const note = prompt(t('childapp.approve_note_prompt')) ?? '';
    await api.approveScenarioRequest(childId, reqId, note);
    await load();
  }
  async function reject(reqId: string) {
    const note = prompt(t('childapp.reject_note_prompt')) ?? '';
    await api.rejectScenarioRequest(childId, reqId, note);
    await load();
  }

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line flex items-center gap-2">
        <Inbox size={16} className="text-accent" />
        <h2 className="font-medium">{t('childapp.scenario_requests_title')}</h2>
        <span className="text-xs text-muted ms-auto">{requests.length}</span>
        {canSubmit && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs px-2.5 py-1 rounded bg-accent hover:bg-accent/90 text-white inline-flex items-center gap-1"
          >
            {showForm ? <X size={12} /> : <Plus size={12} />}
            {showForm ? t('common.cancel') : t('childapp.suggest_scenario')}
          </button>
        )}
      </header>

      <div className="p-5 space-y-4">
        {showForm && canSubmit && <ScenarioRequestForm onSubmit={submit} onCancel={() => setShowForm(false)} />}

        {loading ? (
          <div className="text-sm text-muted">{t('common.loading')}</div>
        ) : requests.length === 0 ? (
          <div className="text-sm text-muted">{t('childapp.no_scenario_requests')}</div>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="bg-ink border border-line rounded-md px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Sparkles size={12} className="text-accent" />
                      <span className="text-sm text-slate-100 font-medium">{scenarioLabel(r.scenario)}</span>
                      <StatusBadge status={r.status} />
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                        {r.requester_role}
                      </span>
                    </div>
                    {r.notes && <div className="text-xs text-slate-400 mt-1">{r.notes}</div>}
                    <div className="text-[11px] text-muted mt-1">
                      {t('childapp.requested_by', { name: r.requester_name, ago: timeAgo(r.created_at) })}
                    </div>
                    {r.decision_note && (
                      <div className="text-xs text-slate-300 italic mt-1 flex items-start gap-1">
                        <MessageCircle size={12} className="mt-0.5 flex-shrink-0" /> {r.decision_note}
                        {r.decided_by_name && <span className="text-muted"> — {r.decided_by_name}</span>}
                      </div>
                    )}
                  </div>
                  {canDecide && r.status === 'pending' && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => approve(r.id)} title={t('childapp.approve')} className="p-1.5 rounded bg-good/20 text-green-300 hover:bg-good/30">
                        <Check size={14} />
                      </button>
                      <button onClick={() => reject(r.id)} title={t('childapp.reject')} className="p-1.5 rounded bg-bad/20 text-red-300 hover:bg-bad/30">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ScenarioRequestForm({
  onSubmit, onCancel,
}: { onSubmit: (scenario: ScenarioType, notes: string) => Promise<void>; onCancel: () => void }) {
  const { t } = useTranslation();
  const [scenario, setScenario] = useState<ScenarioType>('joining_group_conversation');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try { await onSubmit(scenario, notes.trim()); } finally { setBusy(false); }
  }

  return (
    <div className="bg-ink border border-accent/30 rounded-md p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-accent">{t('childapp.suggest_scenario')}</div>
      <p className="text-xs text-muted">{t('childapp.suggest_scenario_intro')}</p>
      <select
        value={scenario}
        onChange={(e) => setScenario(e.target.value as ScenarioType)}
        className="w-full bg-card border border-line rounded px-3 py-2 text-sm"
      >
        {SCENARIOS.map((s) => <option key={s} value={s}>{scenarioLabel(s)}</option>)}
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('childapp.scenario_notes_ph')}
        rows={3}
        maxLength={500}
        className="w-full bg-card border border-line rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded border border-line text-slate-300 hover:bg-white/5">
          {t('common.cancel')}
        </button>
        <button onClick={submit} disabled={busy} className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium">
          {busy ? t('common.saving') : t('childapp.send_request')}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const cls = status === 'approved' ? 'bg-good/15 text-green-300'
    : status === 'rejected' ? 'bg-bad/15 text-red-300'
    : 'bg-warn/15 text-amber-300';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${cls}`}>{status}</span>;
}
