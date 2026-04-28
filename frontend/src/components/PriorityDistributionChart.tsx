import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import type { PriorityDistributionRow } from '../lib/api';

type Mode = 'unread' | 'total';

export function PriorityDistributionChart({
  data, mode, onModeChange,
}: { data: PriorityDistributionRow[]; mode: Mode; onModeChange: (m: Mode) => void }) {
  const nav = useNavigate();
  const { t } = useTranslation();

  const rows = data
    .map((d) => ({
      ...d,
      high: mode === 'unread' ? d.unread_high : d.total_high,
      medium: mode === 'unread' ? d.unread_medium : d.total_medium,
      low: mode === 'unread' ? d.unread_low : d.total_low,
    }))
    .filter((d) => d.high + d.medium + d.low > 0);

  const height = Math.max(180, rows.length * 36 + 40);

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line flex items-center justify-between">
        <div>
          <h2 className="font-medium">{t('dashboard.priority_dist_title')}</h2>
          <p className="text-xs text-muted">{t('dashboard.priority_dist_hint')}</p>
        </div>
        <div className="flex gap-1">
          {(['unread', 'total'] as Mode[]).map((m) => (
            <button key={m}
              onClick={() => onModeChange(m)}
              className={`px-3 py-1 rounded text-xs ${
                mode === m ? 'bg-accent/20 text-white' : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              {m === 'unread' ? t('dashboard.priority_dist_unread') : t('dashboard.priority_dist_total')}
            </button>
          ))}
        </div>
      </header>
      <div className="p-5">
        {rows.length === 0 ? (
          <div className="text-muted text-sm text-center py-8">
            {mode === 'unread' ? t('dashboard.priority_dist_empty_unread') : t('dashboard.priority_dist_empty_total')}
          </div>
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="child_name" stroke="#94a3b8" fontSize={12} width={140} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="high" stackId="p" name={t('priority.high')} fill="#ef4444" onClick={(d) => nav(`/children/${d.child_id}`)} cursor="pointer">
                  {rows.map((r) => <Cell key={r.child_id} />)}
                </Bar>
                <Bar dataKey="medium" stackId="p" name={t('priority.medium')} fill="#f59e0b" onClick={(d) => nav(`/children/${d.child_id}`)} cursor="pointer">
                  {rows.map((r) => <Cell key={r.child_id} />)}
                </Bar>
                <Bar dataKey="low" stackId="p" name={t('priority.low')} fill="#64748b" onClick={(d) => nav(`/children/${d.child_id}`)} cursor="pointer">
                  {rows.map((r) => <Cell key={r.child_id} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
