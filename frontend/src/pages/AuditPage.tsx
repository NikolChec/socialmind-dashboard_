import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import type { AuditEntry } from '@socialmind/shared';
import { api } from '../lib/api';
import { AuditList } from '../components/AuditList';

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  // Quote if contains comma, quote, newline, or CR; double up internal quotes per RFC 4180.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function entriesToCsv(entries: AuditEntry[]): string {
  const cols = ['created_at', 'user_name', 'user_id', 'action', 'resource_type', 'resource_id', 'child_id', 'ip', 'user_agent', 'metadata'];
  const lines: string[] = [cols.join(',')];
  for (const e of entries) {
    lines.push([
      e.created_at, e.user_name, e.user_id, e.action, e.resource_type,
      e.resource_id, e.child_id, e.ip, e.user_agent,
      e.metadata ? JSON.stringify(e.metadata) : '',
    ].map(escapeCsv).join(','));
  }
  return lines.join('\r\n');
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob(['﻿', content], { type: mime }); // BOM so Excel reads UTF-8 correctly
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Range = 'day' | 'week' | 'month' | 'all';

export function AuditPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [mine, setMine] = useState(false);
  const [range, setRange] = useState<Range>('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.audit({ mine, range, limit: range === 'all' ? 2000 : 500 })
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [mine, range]);

  const ranges: Array<{ key: Range; label: string }> = [
    { key: 'day', label: t('audit.range_day') },
    { key: 'week', label: t('audit.range_week') },
    { key: 'month', label: t('audit.range_month') },
    { key: 'all', label: t('audit.range_all') },
  ];

  function downloadCsv() {
    const today = new Date().toISOString().slice(0, 10);
    const fname = `socialmind-audit-${range}-${mine ? 'mine' : 'all'}-${today}.csv`;
    downloadBlob(fname, entriesToCsv(entries), 'text/csv;charset=utf-8');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('audit.title')}</h1>
          <p className="text-sm text-muted">{t('audit.subtitle')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 bg-card border border-line rounded-md p-0.5">
            {ranges.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1 text-xs rounded transition ${range === r.key ? 'bg-accent text-white' : 'text-slate-400 hover:bg-white/5'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-card border border-line rounded-md p-0.5">
            <button
              onClick={() => setMine(false)}
              className={`px-3 py-1 text-xs rounded ${!mine ? 'bg-accent/20 text-white' : 'text-slate-400 hover:bg-white/5'}`}
            >
              {t('audit.filter_all')}
            </button>
            <button
              onClick={() => setMine(true)}
              className={`px-3 py-1 text-xs rounded ${mine ? 'bg-accent/20 text-white' : 'text-slate-400 hover:bg-white/5'}`}
            >
              {t('audit.filter_mine')}
            </button>
          </div>
          <button
            onClick={downloadCsv}
            disabled={entries.length === 0 || loading}
            title={t('audit.download_csv')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-xs font-semibold text-white transition"
          >
            <Download size={13} strokeWidth={2.5} />
            {t('audit.download_csv')}
          </button>
        </div>
      </div>

      <div className="bg-card border border-line rounded-lg px-5 py-3">
        {loading ? (
          <div className="text-muted">{t('common.loading')}</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-muted text-center py-8">{t('audit.empty_range')}</div>
        ) : (
          <>
            <div className="text-xs text-muted mb-3">{t('audit.count', { n: entries.length })}</div>
            <AuditList entries={entries} />
          </>
        )}
      </div>
    </div>
  );
}
