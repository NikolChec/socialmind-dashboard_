import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScenarioQueueItem, ScenarioType } from '@socialmind/shared';
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
  const [picked, setPicked] = useState<ScenarioType>('asking_teacher_for_help');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.queue(childId).then(setItems);
  }, [childId]);

  async function add() {
    setAdding(true);
    try {
      await api.queueAdd(childId, picked);
      setItems(await api.queue(childId));
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
          <div className="flex gap-2">
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value as ScenarioType)}
              className="flex-1 bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>{scenarioLabel(s)}</option>
              ))}
            </select>
            <button
              onClick={add} disabled={adding}
              className="px-3 py-2 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-sm font-medium text-white"
            >
              {t('child.queue_add')}
            </button>
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
