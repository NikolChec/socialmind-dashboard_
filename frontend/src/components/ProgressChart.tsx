import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import type { ProgressPoint } from '@socialmind/shared';

interface Props {
  data: ProgressPoint[];
  metric: 'latency' | 'talk' | 'success' | 'sentiment';
}

export function ProgressChart({ data, metric }: Props) {
  const { t } = useTranslation();
  const config = {
    latency: { key: 'response_latency_avg_ms', label: t('child.metric_latency'), color: '#f59e0b' },
    talk: { key: 'talk_time_ratio', label: t('child.metric_talk'), color: '#6366f1' },
    success: { key: 'scenario_success_rate', label: t('child.metric_success'), color: '#10b981' },
    sentiment: { key: 'sentiment_score', label: t('child.metric_sentiment'), color: '#22d3ee' },
  } as const;
  const c = config[metric];
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey={c.key} name={c.label} stroke={c.color} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
