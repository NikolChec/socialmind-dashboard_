import { useTranslation } from 'react-i18next';
import type { AlertPriority } from '@socialmind/shared';

export function PriorityBadge({ priority }: { priority: AlertPriority }) {
  const { t } = useTranslation();
  const styles: Record<AlertPriority, string> = {
    high: 'bg-bad/15 text-red-300 border border-bad/40',
    medium: 'bg-warn/15 text-amber-300 border border-warn/40',
    low: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${styles[priority]}`}>
      {t(`priority.${priority}`)}
    </span>
  );
}
