import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Alert, ChildSummary } from '@socialmind/shared';
import { api, type PriorityDistributionRow } from '../lib/api';
import { PriorityBadge } from '../components/PriorityBadge';
import { RiskScoreBadge } from '../components/RiskScoreBadge';
import { PriorityDistributionChart } from '../components/PriorityDistributionChart';
import { timeAgo, alertTypeLabel } from '../lib/format';
import { useAuth } from '../lib/auth';

type AlertRow = Alert & { child_name: string };

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isParent = user?.role === 'parent';
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [distribution, setDistribution] = useState<PriorityDistributionRow[]>([]);
  const [mode, setMode] = useState<'unread' | 'total'>('unread');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tasks: Array<Promise<unknown>> = [api.children()];
    if (!isParent) {
      tasks.push(api.alerts(true));
      tasks.push(api.priorityDistribution());
    }
    Promise.all(tasks)
      .then((res) => {
        setChildren(res[0] as ChildSummary[]);
        if (!isParent) {
          setAlerts(((res[1] as AlertRow[]) || []).slice(0, 6));
          setDistribution((res[2] as PriorityDistributionRow[]) || []);
        }
      })
      .finally(() => setLoading(false));
  }, [isParent]);

  if (loading) return <div className="text-muted">{t('common.loading')}</div>;

  const totalChildren = children.length;
  const openAlerts = children.reduce((n, c) => n + c.unread_alerts, 0);
  const highOpen = children.reduce((n, c) => n + c.unread_high, 0);
  const highRisk = children.filter((c) => c.risk_score >= 60).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted">{t('dashboard.subtitle')}</p>
      </div>

      <div className={`grid gap-4 ${isParent ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
        <Stat label={t('dashboard.stat_children')} value={totalChildren} />
        <Stat label={t('dashboard.stat_high_risk')} value={highRisk} tone={highRisk > 0 ? 'bad' : 'neutral'} />
        {!isParent && <Stat label={t('dashboard.stat_open_alerts')} value={openAlerts} tone={openAlerts > 0 ? 'warn' : 'neutral'} />}
        {!isParent && <Stat label={t('dashboard.stat_high_priority')} value={highOpen} tone={highOpen > 0 ? 'bad' : 'neutral'} />}
      </div>

      {!isParent && (
        <PriorityDistributionChart data={distribution} mode={mode} onModeChange={setMode} />
      )}

      <div className={`grid gap-6 ${isParent ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
        {!isParent && (
          <section className="lg:col-span-2 bg-card border border-line rounded-lg">
            <header className="px-5 py-3 border-b border-line flex items-center justify-between">
              <h2 className="font-medium">{t('dashboard.recent_alerts')}</h2>
              <Link to="/alerts" className="text-xs text-accent hover:underline">{t('common.viewall')}</Link>
            </header>
            <ul className="divide-y divide-line">
              {alerts.length === 0 && <li className="px-5 py-6 text-sm text-muted">{t('dashboard.no_open_alerts')}</li>}
              {alerts.map((a) => (
                <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                  <PriorityBadge priority={a.priority} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      <Link to={`/children/${a.child_id}`} className="text-slate-100 hover:underline">{a.child_name}</Link>
                      <span className="text-muted"> · {alertTypeLabel(a.type)}</span>
                    </div>
                    <div className="text-xs text-slate-400 truncate">"{a.excerpt}"</div>
                  </div>
                  <div className="text-xs text-muted whitespace-nowrap">{timeAgo(a.created_at)}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`bg-card border border-line rounded-lg ${isParent ? '' : ''}`}>
          <header className="px-5 py-3 border-b border-line flex items-center justify-between">
            <h2 className="font-medium">{isParent ? t('parent.your_child') : t('dashboard.children_by_risk')}</h2>
            {!isParent && <Link to="/children" className="text-xs text-accent hover:underline">{t('common.viewall')}</Link>}
          </header>
          <ul className="divide-y divide-line">
            {children.slice(0, 8).map((c) => (
              <li key={c.id} className="px-5 py-3 flex items-center gap-3">
                <Link to={`/children/${c.id}`} className="flex-1 min-w-0 hover:underline">
                  <div className="text-sm truncate">{c.display_name}</div>
                  <div className="text-xs text-muted">{t('child.grade', { n: c.grade })} · {timeAgo(c.last_session_at)}</div>
                </Link>
                <RiskScoreBadge score={c.risk_score} reasons={c.risk_reasons} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="bg-card border border-line rounded-lg p-5">
      <div className="text-xs text-muted uppercase tracking-wider">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
