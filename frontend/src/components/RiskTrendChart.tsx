import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import type { RiskSnapshotPoint } from '@socialmind/shared';

export function RiskTrendChart({ data }: { data: RiskSnapshotPoint[] }) {
  const { t } = useTranslation();
  if (data.length < 2) return <div className="text-sm text-muted">{t('child.risk_trend_empty')}</div>;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="3 3" />
          <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="risk_score" name={t('child.risk_trend_title')} stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
