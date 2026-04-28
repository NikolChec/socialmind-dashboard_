import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Alert, EscalationAction } from '@socialmind/shared';
import { api } from '../lib/api';
import { PriorityBadge } from '../components/PriorityBadge';
import { AlertActionDialog, useEscalationLabel } from '../components/AlertActionDialog';
import { alertTypeLabel, formatDateTime, timeAgo } from '../lib/format';
import { useAuth } from '../lib/auth';

type AlertRow = Alert & { child_name: string };

export function AlertsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isParent = user?.role === 'parent';
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [onlyUnack, setOnlyUnack] = useState(true);
  const [loading, setLoading] = useState(true);
  const [ackTarget, setAckTarget] = useState<AlertRow | null>(null);
  const escalationLabel = useEscalationLabel();

  function refresh() {
    setLoading(true);
    api.alerts(onlyUnack).then(setAlerts).finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, [onlyUnack]);

  async function confirmAck(body: { action_taken?: EscalationAction; action_note?: string }) {
    if (!ackTarget) return;
    await api.ackAlert(ackTarget.id, body);
    setAlerts((xs) =>
      xs.map((a) => a.id === ackTarget.id
        ? { ...a, acknowledged_at: new Date().toISOString(), action_taken: body.action_taken ?? null, action_note: body.action_note ?? null }
        : a
      )
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('alerts.title')}</h1>
          <p className="text-sm text-muted">{t('alerts.subtitle')}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={onlyUnack} onChange={(e) => setOnlyUnack(e.target.checked)} />
          {t('alerts.only_unreviewed')}
        </label>
      </div>

      {loading ? (
        <div className="text-muted">{t('common.loading')}</div>
      ) : alerts.length === 0 ? (
        <div className="bg-card border border-line rounded-lg px-5 py-10 text-center text-muted">
          {t('alerts.empty')}
        </div>
      ) : (
        <div className="bg-card border border-line rounded-lg overflow-hidden">
          <ul className="divide-y divide-line">
            {alerts.map((a) => (
              <li key={a.id} className={`px-5 py-4 ${a.priority === 'high' ? 'bg-bad/5' : ''}`}>
                <div className="flex items-center gap-3">
                  <PriorityBadge priority={a.priority} />
                  <Link to={`/children/${a.child_id}`} className="text-slate-100 font-medium hover:underline">
                    {a.child_name}
                  </Link>
                  <span className="text-xs text-muted">{alertTypeLabel(a.type)}</span>
                  <span className="ms-auto text-xs text-muted" title={formatDateTime(a.created_at)}>
                    {timeAgo(a.created_at)}
                  </span>
                </div>
                <div className="text-sm text-slate-200 mt-2">"{a.excerpt}"</div>
                {a.context && <div className="text-xs text-muted mt-1">{a.context}</div>}
                <div className="mt-2">
                  {a.acknowledged_at ? (
                    <div className="text-xs">
                      <span className="text-green-300">{t('child.reviewed_ago', { ago: timeAgo(a.acknowledged_at) })}</span>
                      {a.action_taken && <span className="text-muted"> · {escalationLabel(a.action_taken)}</span>}
                      {a.action_note && <div className="text-slate-400 italic mt-0.5">"{a.action_note}"</div>}
                    </div>
                  ) : !isParent ? (
                    <button
                      onClick={() => setAckTarget(a)}
                      className="text-xs px-2 py-1 rounded border border-line text-slate-300 hover:bg-white/5"
                    >
                      {t('alerts.mark_reviewed')}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ackTarget && (
        <AlertActionDialog
          alert={ackTarget}
          onClose={() => setAckTarget(null)}
          onSubmit={confirmAck}
        />
      )}
    </div>
  );
}
