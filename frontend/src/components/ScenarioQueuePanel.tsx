import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { ScenarioBreakdown, ScenarioQueueItem, ScenarioType } from '@socialmind/shared';
import { api } from '../lib/api';
import { scenarioLabel, timeAgo } from '../lib/format';

const SCENARIOS: ScenarioType[] = [
  'asking_teacher_for_help', 'joining_group_conversation', 'handling_disagreement',
  'ordering_in_public', 'introducing_yourself', 'presenting_in_class',
  'refusing_peer_pressure', 'asking_for_a_date',
];

export function ScenarioQueuePanel({ childId, readOnly = false }: { childId: string; readOnly?: boolean }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ScenarioQueueItem[]>([]);
  const [picked, setPicked] = useState<ScenarioType | null>(null);
  const [adding, setAdding] = useState(false);
  const [breakdown, setBreakdown] = useState<ScenarioBreakdown[]>([]);
  const [userTouched, setUserTouched] = useState(false);

  useEffect(() => {
    api.queue(childId).then(setItems);
    api.childScenarioBreakdown(childId).then(setBreakdown).catch(() => setBreakdown([]));
  }, [childId]);

  // AI's pick: scenario with the lowest success rate in recent sessions (≥2 attempts).
  // Falls back to "joining_group_conversation" if there's no signal yet.
  const aiSuggestion = useMemo<ScenarioType>(() => {
    const candidates = breakdown.filter((b) => b.attempts >= 2);
    if (candidates.length === 0) return 'joining_group_conversation';
    candidates.sort((a, b) => a.success_rate - b.success_rate);
    return candidates[0].scenario as ScenarioType;
  }, [breakdown]);

  // Auto-fill the dropdown with the AI's suggestion until the psychologist changes it.
  // Once they pick something, we stop overriding so their choice sticks.
  useEffect(() => {
    if (!userTouched) setPicked(aiSuggestion);
  }, [aiSuggestion, userTouched]);

  const effectivePicked: ScenarioType = picked ?? aiSuggestion;
  const isAiPick = !userTouched && effectivePicked === aiSuggestion;

  async function add() {
    setAdding(true);
    try {
      await api.queueAdd(childId, effectivePicked);
      setItems(await api.queue(childId));
      // Reset to AI mode so the next add suggestion shows again.
      setUserTouched(false);
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await api.queueRemove(childId, id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line">
        <h2 className="font-medium">{t('child.queue_title')}</h2>
        <p className="text-xs text-muted">{t('child.queue_subtitle')}</p>
      </header>
      <div className="p-5 space-y-3">
        {!readOnly && (
          <div>
            <div className="flex gap-2">
              <div className={`flex-1 relative rounded-md transition-colors ${isAiPick ? 'ring-1 ring-accent/40' : ''}`}>
                <select
                  value={effectivePicked}
                  onChange={(e) => { setPicked(e.target.value as ScenarioType); setUserTouched(true); }}
                  className="w-full bg-ink border border-line rounded-md ps-3 pe-3 py-2 text-sm focus:outline-none focus:border-accent"
                >
                  {SCENARIOS.map((s) => (
                    <option key={s} value={s}>{scenarioLabel(s)}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={add} disabled={adding}
                className="px-3 py-2 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-sm font-medium text-white"
              >
                {t('child.queue_add')}
              </button>
            </div>
            <div className="mt-1.5 text-[11px] flex items-center gap-1.5">
              {isAiPick ? (
                <span className="text-accent inline-flex items-center gap-1">
                  <Sparkles size={11} /> {t('child.queue_ai_pick_hint') || "AI picked this — change it if you'd like"}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setUserTouched(false); setPicked(aiSuggestion); }}
                  className="text-muted hover:text-accent inline-flex items-center gap-1"
                >
                  <Sparkles size={11} /> {t('child.queue_reset_ai') || 'Reset to AI suggestion'}
                </button>
              )}
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div className="text-sm text-muted">{t('child.queue_empty')}</div>
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 bg-ink border border-line rounded-md px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-100">{scenarioLabel(i.scenario)}</div>
                  <div className="text-xs text-muted">
                    {t('child.queue_assigned_by', { who: i.assigned_by_name })} · {timeAgo(i.assigned_at)}
                  </div>
                </div>
                {!readOnly && (
                  <button onClick={() => remove(i.id)} className="text-xs text-slate-400 hover:text-red-300">
                    {t('child.queue_remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
