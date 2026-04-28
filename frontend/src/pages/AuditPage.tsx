import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditEntry } from '@socialmind/shared';
import { api } from '../lib/api';
import { AuditList } from '../components/AuditList';

export function AuditPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.audit({ mine }).then(setEntries).finally(() => setLoading(false));
  }, [mine]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('audit.title')}</h1>
          <p className="text-sm text-muted">{t('audit.subtitle')}</p>
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
      </div>

      <div className="bg-card border border-line rounded-lg px-5 py-3">
        {loading ? <div className="text-muted">{t('common.loading')}</div> : <AuditList entries={entries} />}
      </div>
    </div>
  );
}
