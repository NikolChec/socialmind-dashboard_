import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Alert, EscalationAction } from '@socialmind/shared';

const ACTIONS: EscalationAction[] = [
  'contacted_parent', 'contacted_school', 'contacted_emergency',
  'addressed_in_session', 'scheduled_followup', 'no_action_needed',
];

interface Props {
  alert: Alert;
  onClose: () => void;
  onSubmit: (body: { action_taken?: EscalationAction; action_note?: string }) => Promise<void>;
}

export function AlertActionDialog({ alert, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const required = alert.priority === 'high';
  const [action, setAction] = useState<EscalationAction | ''>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (required && !action) {
      setError(t('alerts.dialog_action_required_err'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        action_taken: (action || undefined) as EscalationAction | undefined,
        action_note: note.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50" onClick={onClose}>
      <div
        className="bg-card border border-line rounded-lg w-full max-w-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-sm text-muted">{t('alerts.dialog_title')}</div>
          <div className="font-medium text-slate-100 mt-1">"{alert.excerpt}"</div>
        </div>

        <div>
          <div className="text-xs text-muted mb-2">
            {t('alerts.dialog_action_label')} {required && <span className="text-red-300">{t('alerts.dialog_action_required')}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
              <button
                key={a}
                onClick={() => setAction(a)}
                className={`text-start text-xs px-3 py-2 rounded border transition ${
                  action === a
                    ? 'border-accent bg-accent/10 text-white'
                    : 'border-line text-slate-300 hover:bg-white/5'
                }`}
              >
                {t(`alerts.action_${a}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <div className="text-xs text-muted mb-1">{t('alerts.dialog_note_label')}</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t('alerts.dialog_note_placeholder')}
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
          />
        </label>

        {error && <div className="text-sm text-red-400">{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-sm text-slate-300 hover:bg-white/5">
            {t('common.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-1.5 rounded bg-accent hover:bg-accent/90 disabled:opacity-50 text-sm font-medium text-white"
          >
            {submitting ? t('common.saving') : t('alerts.mark_reviewed')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useEscalationLabel() {
  const { t } = useTranslation();
  return (a: EscalationAction | null | undefined): string => (a ? t(`alerts.action_${a}`) : '');
}
