import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, Plus, Trash2, X } from 'lucide-react';
import type { ChildMissionWithMeta, MissionDifficulty } from '@socialmind/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime, timeAgo } from '../lib/format';

export function MissionsManagerPanel({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [missions, setMissions] = useState<ChildMissionWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = user?.role === 'psychologist' || user?.role === 'school_admin';

  async function load() {
    setLoading(true);
    try {
      setMissions(await api.childMissions(childId));
    } catch {
      setError(t('childapp.load_failed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [childId]);

  async function onCreate(body: { title: string; description: string; difficulty: MissionDifficulty; xp: number; due_date: string | null }) {
    await api.createMission(childId, body);
    setShowForm(false);
    await load();
  }

  async function onDelete(id: string) {
    if (!confirm(t('childapp.confirm_delete_mission'))) return;
    await api.deleteMission(childId, id);
    await load();
  }

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line flex items-center gap-2">
        <ListChecks size={16} className="text-accent" />
        <h2 className="font-medium">{t('childapp.missions_title')}</h2>
        <span className="text-xs text-muted ms-auto">{t('childapp.missions_count', { n: missions.length })}</span>
        {canManage && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs px-2.5 py-1 rounded bg-accent hover:bg-accent/90 text-white inline-flex items-center gap-1"
          >
            {showForm ? <X size={12} /> : <Plus size={12} />}
            {showForm ? t('common.cancel') : t('childapp.add_mission')}
          </button>
        )}
      </header>

      <div className="p-5 space-y-4">
        {showForm && canManage && <NewMissionForm onSubmit={onCreate} onCancel={() => setShowForm(false)} />}

        {loading ? (
          <div className="text-sm text-muted">{t('common.loading')}</div>
        ) : error ? (
          <div className="text-sm text-rose-300">{error}</div>
        ) : missions.length === 0 ? (
          <div className="text-sm text-muted">{t('childapp.no_missions')}</div>
        ) : (
          <ul className="space-y-2">
            {missions.map((m) => (
              <li key={m.id} className="bg-ink border border-line rounded-md px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-slate-100 font-medium">{m.title}</span>
                      <DifficultyBadge difficulty={m.difficulty} />
                      <span className="text-[10px] text-amber-300">+{m.xp} XP</span>
                      <SourceBadge source={m.source} />
                      {m.completed_at && (
                        <span className="text-[10px] text-green-300">
                          ✓ {timeAgo(m.completed_at)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{m.description}</div>
                    <div className="text-[11px] text-muted mt-1">
                      {t('childapp.assigned_at', { when: formatDateTime(m.assigned_at) })}
                      {m.assigned_by_name && ` · ${t('childapp.assigned_by_label', { name: m.assigned_by_name })}`}
                      {m.due_date && ` · ${t('childapp.due', { when: formatDateTime(m.due_date) })}`}
                    </div>
                    {m.child_reflection && (
                      <div className="text-xs text-slate-400 italic mt-1">"{m.child_reflection}"</div>
                    )}
                  </div>
                  {canManage && (
                    <button
                      onClick={() => onDelete(m.id)}
                      title={t('childapp.delete_mission')}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
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

function NewMissionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (body: { title: string; description: string; difficulty: MissionDifficulty; xp: number; due_date: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<MissionDifficulty>('medium');
  const [xp, setXp] = useState(15);
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || !description.trim()) return;
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        difficulty,
        xp,
        due_date: due ? new Date(due).toISOString() : null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-ink border border-accent/30 rounded-md p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-accent">{t('childapp.new_mission')}</div>
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
        placeholder={t('childapp.mission_desc_ph')}
        rows={3}
        className="w-full bg-card border border-line rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
        maxLength={1000}
      />
      <div className="grid grid-cols-3 gap-2">
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
        <label className="text-xs text-muted block">
          {t('childapp.due_optional')}
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
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
          {busy ? t('common.saving') : t('childapp.assign')}
        </button>
      </div>
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: MissionDifficulty }) {
  const cls = difficulty === 'easy' ? 'bg-good/15 text-green-300'
    : difficulty === 'medium' ? 'bg-warn/15 text-amber-300'
    : 'bg-bad/15 text-red-300';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{difficulty}</span>;
}

function SourceBadge({ source }: { source: 'auto' | 'psychologist' | 'parent_request' }) {
  if (source === 'auto') return null;
  const label = source === 'psychologist' ? 'PSYCH' : 'PARENT';
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">{label}</span>;
}
