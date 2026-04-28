import { useTranslation } from 'react-i18next';

interface Props {
  score: number;
  reasons?: string[];
  size?: 'sm' | 'md';
}

export function RiskScoreBadge({ score, reasons, size = 'sm' }: Props) {
  const { t } = useTranslation();
  const tone =
    score >= 60 ? 'bg-bad/15 text-red-300 border-bad/40'
    : score >= 30 ? 'bg-warn/15 text-amber-300 border-warn/40'
    : 'bg-good/10 text-green-300 border-good/30';
  const label =
    score >= 60 ? t('risk.high')
    : score >= 30 ? t('risk.monitor')
    : t('risk.stable');
  const pad = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      title={reasons && reasons.length > 0 ? reasons.join('\n') : t('risk.no_elevated')}
      className={`inline-flex items-center gap-1.5 rounded border font-semibold ${tone} ${pad}`}
    >
      <span>{label}</span>
      <span className="opacity-70">·</span>
      <span>{score}</span>
    </span>
  );
}
