import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

export function ReportsPanel({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<number | null>(null);
  const [confirmWeeks, setConfirmWeeks] = useState<number | null>(null);

  async function download(weeks: number, confirm = false) {
    setBusy(weeks);
    try {
      await api.downloadReport(childId, weeks, { confirm });
      setConfirmWeeks(null);
    } catch (err) {
      const e = err as { status?: number; body?: { reason?: string } };
      if (e.status === 428) {
        setConfirmWeeks(weeks);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line">
        <h2 className="font-medium">{t('child.report_title')}</h2>
      </header>
      <div className="p-5 flex flex-wrap gap-2">
        <button
          onClick={() => download(4)} disabled={busy !== null}
          className="text-sm px-3 py-2 rounded border border-line text-slate-200 hover:bg-white/5 disabled:opacity-50"
        >
          {busy === 4 ? t('child.report_generating') : t('child.report_download_4w')}
        </button>
        <button
          onClick={() => download(12)} disabled={busy !== null}
          className="text-sm px-3 py-2 rounded border border-line text-slate-200 hover:bg-white/5 disabled:opacity-50"
        >
          {busy === 12 ? t('child.report_generating') : t('child.report_download_12w')}
        </button>
      </div>

      {confirmWeeks !== null && (
        <div className="fixed inset-0 bg-black/70 grid place-items-center z-[55]" onClick={() => setConfirmWeeks(null)}>
          <div
            className="bg-card border border-bad/50 rounded-lg p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-red-300">
              {t('security.pdf_confirm_title')}
            </div>
            <div className="text-sm text-slate-300">
              {t('security.pdf_confirm_body')}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmWeeks(null)}
                className="px-3 py-1.5 rounded text-sm text-slate-300 hover:bg-white/5"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => download(confirmWeeks, true)}
                disabled={busy !== null}
                className="px-4 py-1.5 rounded bg-bad hover:bg-bad/90 disabled:opacity-50 text-sm font-medium text-white"
              >
                {t('security.pdf_confirm_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
