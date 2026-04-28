import i18n from '../i18n';

const localeMap: Record<string, string> = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };
function locale(): string {
  return localeMap[i18n.language] ?? 'en-US';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(locale(), {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale(), {
    year: 'numeric', month: 'short', day: '2-digit',
  });
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = i18n.t.bind(i18n);
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('common.justnow');
  if (diff < 3600) return t('common.ago_minutes', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('common.ago_hours', { n: Math.floor(diff / 3600) });
  return t('common.ago_days', { n: Math.floor(diff / 86400) });
}

export function scenarioLabel(s: string): string {
  const key = `scenarios.${s}`;
  const translated = i18n.t(key);
  return translated === key ? s.replace(/_/g, ' ') : translated;
}

export function alertTypeLabel(s: string): string {
  const key = `alert_types.${s}`;
  const translated = i18n.t(key);
  return translated === key ? s.replace(/_/g, ' ') : translated;
}

export function priorityLabel(p: 'high' | 'medium' | 'low'): string {
  return i18n.t(`priority.${p}`);
}
