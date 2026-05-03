import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, Plus, Check, X, MessageCircle } from 'lucide-react';
import type { MissionDifficulty, MissionRequest } from '@socialmind/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { timeAgo } from '../lib/format';

export function MissionRequestsPanel({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [requests, setRequests] = useState<MissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const isParent = user?.role === 'parent';
  const canDecide = user?.role === 'psychologist' || user?.role === 'school_admin';

  async function load() {
    setLoading(true);
    try {
      setRequests(await api.childMissionRequests(childId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [childId]);

  async function submitRequest(body: { title: string; description: string; difficulty: MissionDifficulty; xp: number }) {
    await api.submitMissionRequest(childId, body);
    setShowForm(false);
    await load();
  }

  async function approve(reqId: string) {
    const note = prompt(t('childapp.approve_note_prompt')) ?? '';
    await api.approveMissionRequest(childId, reqId, note);
    await load();
  }

  async function reject(reqId: string) {
    const note = prompt(t('childapp.reject_note_prompt')) ?? '';
    await api.rejectMissionRequest(childId, reqId, note);
    await load();
  }

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line flex items-center gap-2">
        <Inbox size={16} className="text-accent" />
        <h2 className="font-medium">{t('childapp.requests_title')}</h2>
        <span className="text-xs text-muted ms-auto">{requests.length}</span>
        {isParent && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs px-2.5 py-1 rounded bg-accent hover:bg-accent/90 text-white inline-flex items-center gap-1"
          >
            {showForm ? <X size={12} /> : <Plus size={12} />}
            {showForm ? t('common.cancel') : t('childapp.suggest_mission')}
          </button>
        )}
      </header>

      <div className="p-5 space-y-4">
        {showForm && isParent && <RequestForm onSubmit={submitRequest} onCancel={() => setShowForm(false)} />}

        {loading ? (
          <div className="text-sm text-muted">{t('common.loading')}</div>
        ) : requests.length === 0 ? (
          <div className="text-sm text-muted">{t('childapp.no_requests')}</div>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="bg-ink border border-line rounded-md px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-slate-100 font-medium">{r.title}</span>
                      <StatusBadge status={r.status} />
                      <span className="text-[10px] text-amber-300">+{r.xp} XP</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{r.difficulty}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{r.description}</div>
                    <div className="text-[11px] text-muted mt-1">
                      {t('childapp.requested_by', { name: r.parent_name, ago: timeAgo(r.created_at) })}
                    </div>
                    {r.psych_note && (
                      <div className="text-xs text-slate-300 italic mt-1 flex items-start gap-1">
                        <MessageCircle size={12} className="mt-0.5 flex-shrink-0" /> {r.psych_note}
                        {r.decided_by_name && (
                          <span className="text-muted"> — {r.decided_by_name}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {canDecide && r.status === 'pending' && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => approve(r.id)}
                        title={t('childapp.approve')}
                        className="p-1.5 rounded bg-good/20 text-green-300 hover:bg-good/30"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => reject(r.id)}
                        title={t('childapp.reject')}
                        className="p-1.5 rounded bg-bad/20 text-red-300 hover:bg-bad/30"
                      >
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

function RequestForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (body: { title: string; description: string; difficulty: MissionDifficulty; xp: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<MissionDifficulty>('medium');
  const [xp, setXp] = useState(15);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || !description.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ title: title.trim(), description: description.trim(), difficulty, xp });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-ink border border-accent/30 rounded-md p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-accent">{t('childapp.suggest_mission')}</div>
      <p className="text-xs text-muted">{t('childapp.suggest_intro')}</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('childapp.mission_title_ph')}
        className="w-full bg-card border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
        maxLength={120}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('childapp.suggest_desc_ph')}
        rows={3}
        className="w-full bg-card border border-line rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
        maxLength={1000}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted block">
          {t('childapp.difficulty')}
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as MissionDifficulty)}
            className="mt-1 w-full bg-card border border-line rounded px-2 py-1.5 text-sm"
          >
            <option value="easy">{t('childapp.easy')}</option>
            <option value="medium">{t('childapp.medium')}</option>
            <option value="hard">{t('childapp.hard')}</option>
          </select>
        </label>
        <label className="text-xs text-muted block">
          {t('childapp.xp_label')}
          <input
            type="number"
            min={0}
            max={200}
            value={xp}
            onChange={(e) => setXp(Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
            className="mt-1 w-full bg-card border border-line rounded px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded border border-line text-slate-300 hover:bg-white/5"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={submit}
          disabled={busy || !title.trim() || !description.trim()}
          className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium"
        >
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
