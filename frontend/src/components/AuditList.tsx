import { useTranslation } from 'react-i18next';
import type { AuditEntry } from '@socialmind/shared';
import { timeAgo } from '../lib/format';

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  const { t } = useTranslation();
  if (entries.length === 0) return <div className="text-sm text-muted">{t('audit.empty')}</div>;
  return (
    <ul className="divide-y divide-line">
      {entries.map((e) => {
        const key = `audit.action_${e.action}`;
        const translated = t(key);
        const actionLabel = translated === key ? e.action.replace(/_/g, ' ') : translated;
        return (
          <li key={e.id} className="py-2 flex items-center gap-3 text-sm">
            <div className="text-slate-200 min-w-[120px]">{e.user_name}</div>
            <div className="text-slate-300 flex-1">{actionLabel}</div>
            <div className="text-xs text-muted">{timeAgo(e.created_at)}</div>
          </li>
        );
      })}
    </ul>
  );
}
