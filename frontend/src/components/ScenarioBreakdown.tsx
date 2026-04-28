import { useTranslation } from 'react-i18next';
import type { ScenarioBreakdown } from '@socialmind/shared';
import { scenarioLabel } from '../lib/format';

export function ScenarioBreakdownList({ data }: { data: ScenarioBreakdown[] }) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return <div className="text-sm text-muted">{t('child.scenario_perf_empty')}</div>;
  }
  return (
    <ul className="space-y-2">
      {data.map((s) => {
        const pct = Math.round(s.success_rate * 100);
        const color = pct >= 70 ? 'bg-good' : pct >= 40 ? 'bg-warn' : 'bg-bad';
        return (
          <li key={s.scenario}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-200">{scenarioLabel(s.scenario)}</span>
              <span className="text-muted">
                {s.successes}/{s.attempts} · {pct}%
              </span>
            </div>
            <div className="h-1.5 bg-ink rounded">
              <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
