import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, MessageSquare, CheckCircle2, ListTodo, Clock } from 'lucide-react';
import type { CompanionActivitySummary } from '@socialmind/shared';
import { api } from '../lib/api';
import { timeAgo, formatDateTime } from '../lib/format';

export function CompanionActivityPanel({ childId, childName }: { childId: string; childName: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<CompanionActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.childCompanionActivity(childId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [childId]);

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line flex items-center gap-2">
        <Smartphone size={16} className="text-accent" />
        <h2 className="font-medium">{t('companion.title')}</h2>
        <span className="text-xs text-muted ms-auto">{t('companion.subtitle')}</span>
      </header>

      <div className="p-5 space-y-5">
        {loading ? (
          <div className="text-muted text-sm">{t('common.loading')}</div>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                icon={<Clock size={14} />}
                label={t('companion.last_login')}
                value={data.last_login_at ? timeAgo(data.last_login_at) : t('common.never')}
              />
              <Stat
                icon={<CheckCircle2 size={14} />}
                label={t('companion.missions_done')}
                value={String(data.missions_completed)}
              />
              <Stat
                icon={<ListTodo size={14} />}
                label={t('companion.missions_open')}
                value={String(data.missions_open)}
              />
              <Stat
                icon={<MessageSquare size={14} />}
                label={t('companion.helper_30d')}
                value={String(data.helper_messages_30d)}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted mb-2">
                  {t('companion.recent_missions')}
                </h3>
                {data.recent_completed_missions.length === 0 ? (
                  <div className="text-sm text-muted">{t('companion.empty_missions')}</div>
                ) : (
                  <ul className="space-y-2">
                    {data.recent_completed_missions.map((m) => (
                      <li key={m.id} className="bg-ink border border-line rounded-md px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm text-slate-100 truncate">{m.title}</div>
                          <span className="text-[10px] text-green-300 whitespace-nowrap">
                            {timeAgo(m.completed_at)}
                          </span>
                        </div>
                        {m.child_reflection && (
                          <div className="text-xs text-slate-400 italic mt-1">"{m.child_reflection}"</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted mb-2">
                  {t('companion.recent_helper', { name: childName })}
                </h3>
                {data.recent_helper_messages.length === 0 ? (
                  <div className="text-sm text-muted">{t('companion.empty_helper')}</div>
                ) : (
                  <ul className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                    {data.recent_helper_messages.map((m) => (
                      <li
                        key={m.id}
                        className={`rounded-md px-3 py-2 text-sm ${
                          m.role === 'child'
                            ? 'bg-accent/10 text-slate-100 border border-accent/20'
                            : 'bg-ink border border-line text-slate-300'
                        }`}
                      >
                        <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">
                          {m.role === 'child' ? childName : t('companion.helper_role')}
                          <span className="ms-2 normal-case tracking-normal">{formatDateTime(m.created_at)}</span>
                        </div>
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-ink border border-line rounded px-3 py-2">
      <div className="text-[10px] text-muted uppercase tracking-wider flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-slate-100 text-base font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}
