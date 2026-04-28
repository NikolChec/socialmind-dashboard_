import { useTranslation } from 'react-i18next';

export function SensitiveBadge() {
  const { t } = useTranslation();
  return (
    <span
      title={t('security.sensitive_tooltip')}
      className="inline-flex items-center gap-1 rounded border border-bad/50 bg-bad/15 text-red-300 font-semibold px-2 py-0.5 text-[11px] uppercase tracking-wide"
    >
      🔒 {t('security.sensitive_badge')}
    </span>
  );
}
