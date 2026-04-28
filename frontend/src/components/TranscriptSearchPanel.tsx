import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TranscriptMatch } from '@socialmind/shared';
import { api } from '../lib/api';
import { formatDateTime, scenarioLabel } from '../lib/format';

export function TranscriptSearchPanel({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<TranscriptMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (debounced.length < 2) { setResults([]); setSearched(false); return; }
    let cancelled = false;
    setLoading(true);
    api.transcriptSearch(childId, debounced)
      .then((r) => { if (!cancelled) { setResults(r); setSearched(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [childId, debounced]);

  const totalMatches = results.reduce((n, r) => n + r.snippets.length, 0);

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line">
        <h2 className="font-medium">{t('child.search_title')}</h2>
      </header>
      <div className="p-5 space-y-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('child.search_placeholder')}
          className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        {loading && <div className="text-xs text-muted">{t('common.loading')}</div>}
        {!loading && searched && results.length === 0 && (
          <div className="text-sm text-muted">{t('child.search_no_results')}</div>
        )}
        {!loading && searched && results.length > 0 && (
          <div className="text-xs text-muted">
            {t('child.search_matches', { n: totalMatches, sessions: results.length })}
          </div>
        )}
        <ul className="space-y-3 max-h-72 overflow-y-auto scrollbar-thin">
          {results.map((r) => (
            <li key={r.session_id} className="bg-ink border border-line rounded-md p-3">
              <div className="text-xs text-slate-300 font-medium">
                {scenarioLabel(r.scenario)} <span className="text-muted font-normal">· {formatDateTime(r.started_at)}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {r.snippets.map((s, i) => (
                  <li key={i} className="text-xs text-slate-300">
                    <span className="text-muted uppercase tracking-wide">{s.speaker}:</span> {highlight(s.text, debounced)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escape(q)})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-accent/40 text-white px-0.5 rounded">{p}</mark>
      : <span key={i}>{p}</span>
  );
}
function escape(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
