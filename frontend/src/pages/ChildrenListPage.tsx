import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ChildSummary } from '@socialmind/shared';
import { api } from '../lib/api';
import { RiskScoreBadge } from '../components/RiskScoreBadge';
import { timeAgo } from '../lib/format';

type SortKey = 'risk' | 'name' | 'last_session' | 'alerts';

export function ChildrenListPage() {
  const { t } = useTranslation();
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('risk');

  useEffect(() => {
    api.children().then(setChildren).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-muted">{t('common.loading')}</div>;

  const filtered = children
    .filter((c) =>
      c.display_name.toLowerCase().includes(q.toLowerCase()) ||
      c.psychologist_name.toLowerCase().includes(q.toLowerCase())
    )
    .sort((a, b) => {
      switch (sort) {
        case 'name': return a.display_name.localeCompare(b.display_name);
        case 'last_session': return (b.last_session_at ?? '').localeCompare(a.last_session_at ?? '');
        case 'alerts': return b.unread_alerts - a.unread_alerts;
        case 'risk':
        default:
          return b.risk_score - a.risk_score || a.display_name.localeCompare(b.display_name);
      }
    });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('children.title')}</h1>
          <p className="text-sm text-muted">{t('children.subtitle', { count: children.length, sort: t(`children.sort_${sort}`) })}</p>
        </div>
        <input
          type="text" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)}
          className="bg-card border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
      </div>

      <div className="bg-card border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <Th onClick={() => setSort('risk')} active={sort === 'risk'}>{t('children.col_risk')}</Th>
              <Th onClick={() => setSort('name')} active={sort === 'name'}>{t('children.col_name')}</Th>
              <th className="text-start px-5 py-3 font-medium">{t('children.col_grade')}</th>
              <th className="text-start px-5 py-3 font-medium">{t('children.col_psychologist')}</th>
              <Th onClick={() => setSort('last_session')} active={sort === 'last_session'}>{t('children.col_last_session')}</Th>
              <Th onClick={() => setSort('alerts')} active={sort === 'alerts'}>{t('children.col_open_alerts')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.02]">
                <td className="px-5 py-3"><RiskScoreBadge score={c.risk_score} reasons={c.risk_reasons} /></td>
                <td className="px-5 py-3">
                  <Link to={`/children/${c.id}`} className="text-slate-100 hover:underline font-medium">
                    {c.display_name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-300">{c.grade}</td>
                <td className="px-5 py-3 text-slate-300">{c.psychologist_name}</td>
                <td className="px-5 py-3 text-slate-400">{timeAgo(c.last_session_at)}</td>
                <td className="px-5 py-3">
                  {c.unread_alerts > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                      {c.unread_high > 0 && (
                        <span className="text-[11px] bg-bad/15 text-red-300 border border-bad/40 rounded px-2 py-0.5">
                          {c.unread_high} {t('priority.high')}
                        </span>
                      )}
                      {c.unread_medium > 0 && (
                        <span className="text-[11px] bg-warn/15 text-amber-300 border border-warn/40 rounded px-2 py-0.5">
                          {c.unread_medium} {t('priority.medium')}
                        </span>
                      )}
                      {c.unread_low > 0 && (
                        <span className="text-[11px] bg-slate-500/15 text-slate-300 border border-slate-500/30 rounded px-2 py-0.5">
                          {c.unread_low} {t('priority.low')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted">{t('children.no_matches')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active: boolean }) {
  return (
    <th className="text-start px-5 py-3 font-medium">
      <button onClick={onClick} className={`hover:text-slate-200 ${active ? 'text-slate-200' : ''}`}>
        {children}{active && ' ↓'}
      </button>
    </th>
  );
}
