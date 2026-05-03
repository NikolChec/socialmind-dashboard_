import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, AlertTriangle, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import type { HelperChatLog, HelperChatSession, HelperChatMessage, SafetySeverity } from '@socialmind/shared';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../lib/auth';

const SEVERITY_STYLE: Record<SafetySeverity, { label: string; cls: string }> = {
  safe:     { label: 'safe',     cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  low:      { label: 'low',      cls: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' },
  medium:   { label: 'medium',   cls: 'bg-orange-500/10 text-orange-700 dark:text-orange-400' },
  high:     { label: 'HIGH',     cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' },
  critical: { label: 'CRITICAL', cls: 'bg-red-600/15 text-red-700 dark:text-red-300 font-bold' },
};

const SAFETY_CATEGORIES = [
  'self_harm', 'abuse', 'violence', 'sexual', 'bullying', 'hopelessness',
  'distress', 'eating_disorder', 'substance_use', 'medical_advice', 'pii_leak', 'language_drift',
] as const;

export function HelperChatsPanel({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<HelperChatLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  async function reload() {
    setLoading(true);
    try {
      setData(await api.childHelperChats(childId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [childId]);

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line flex items-center gap-2">
        <MessageSquare size={16} className="text-accent" />
        <h2 className="font-medium">Helper chats</h2>
        {data && (
          <span className="text-xs text-muted ms-auto">
            {data.sessions.length} session{data.sessions.length === 1 ? '' : 's'}
          </span>
        )}
      </header>

      <div className="p-5">
        {loading ? (
          <div className="text-muted text-sm">{t('common.loading')}</div>
        ) : !data || data.sessions.length === 0 ? (
          <div className="text-muted text-sm">No helper chats yet.</div>
        ) : (
          <div className="space-y-3">
            {data.sessions.map((s, i) => (
              <SessionRow
                key={s.started_at + i}
                session={s}
                childId={childId}
                childName={data.child_name}
                isOpen={openIdx === i}
                onToggle={() => setOpenIdx(openIdx === i ? null : i)}
                onLabeled={reload}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SessionRow({
  session,
  childId,
  childName,
  isOpen,
  onToggle,
  onLabeled,
}: {
  session: HelperChatSession;
  childId: string;
  childName: string;
  isOpen: boolean;
  onToggle: () => void;
  onLabeled: () => void;
}) {
  const sev = session.flags.severity;
  const style = SEVERITY_STYLE[sev];
  return (
    <div className="border border-line rounded-md">
      <button
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-elev/50 rounded-md"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{childName}</div>
          <div className="text-xs text-muted">
            {formatDateTime(session.started_at)} · {session.messages.length} msgs
          </div>
        </div>
        {sev !== 'safe' && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide flex items-center gap-1 ${style.cls}`}>
            {sev === 'critical' || sev === 'high' ? <AlertTriangle size={10} /> : null}
            {style.label}
          </span>
        )}
        {session.flags.categories.length > 0 && (
          <span className="text-[10px] text-muted hidden sm:inline">
            {session.flags.categories.join(', ')}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-line space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {session.messages.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              childId={childId}
              childName={childName}
              onLabeled={onLabeled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({
  message: m,
  childId,
  childName,
  onLabeled,
}: {
  message: HelperChatMessage;
  childId: string;
  childName: string;
  onLabeled: () => void;
}) {
  const { user } = useAuth();
  const canLabel = (user?.role === 'psychologist' || user?.role === 'school_admin') && m.role === 'child';

  return (
    <div className={`flex ${m.role === 'child' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm border ${
          m.role === 'child'
            ? 'bg-accent/15 text-slate-100 border-accent/30'
            : 'bg-ink text-slate-200 border-line'
        }`}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-0.5 flex items-center gap-2">
          <span>{m.role === 'child' ? childName : 'Helper'}</span>
          {canLabel && (
            <LabelMenu
              messageId={m.id}
              childId={childId}
              currentSeverity={m.flags?.severity ?? 'safe'}
              currentCategory={m.flags?.categories?.[0] ?? null}
              onLabeled={onLabeled}
            />
          )}
        </div>
        <div className="whitespace-pre-wrap text-slate-100">{m.content}</div>
        {m.flags && m.flags.severity !== 'safe' && (
          <div className={`mt-1.5 text-[10px] px-1.5 py-0.5 rounded inline-block ${SEVERITY_STYLE[m.flags.severity].cls}`}>
            {m.flags.severity.toUpperCase()} · {m.flags.categories.join(', ')}
            {(m.flags as { manual?: boolean }).manual && <span className="ms-1 opacity-70">(manual)</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function LabelMenu({
  messageId,
  childId,
  currentSeverity,
  currentCategory,
  onLabeled,
}: {
  messageId: string;
  childId: string;
  currentSeverity: SafetySeverity;
  currentCategory: string | null;
  onLabeled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [severity, setSeverity] = useState<SafetySeverity>(currentSeverity);
  const [category, setCategory] = useState<string>(currentCategory ?? 'distress');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      await api.labelHelperMessage(childId, messageId, { severity, category });
      onLabeled();
      setOpen(false);
    } catch (e) {
      console.error('label_failed', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Label this message"
        className="text-muted hover:text-accent inline-flex items-center gap-0.5 text-[10px] normal-case font-medium"
      >
        <Tag size={10} /> label
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-1 w-64 z-20 bg-card border border-line rounded-md shadow-lg p-3 space-y-2 normal-case">
          <div className="text-[11px] uppercase tracking-wider text-muted">Set severity</div>
          <div className="grid grid-cols-5 gap-1">
            {(['safe', 'low', 'medium', 'high', 'critical'] as SafetySeverity[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`text-[10px] px-1 py-1 rounded font-semibold ${
                  severity === s
                    ? SEVERITY_STYLE[s].cls + ' ring-1 ring-accent/50'
                    : 'bg-elev/50 text-slate-400 hover:bg-elev'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-muted pt-1">Category</div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-ink border border-line rounded px-2 py-1 text-xs text-slate-200"
          >
            {SAFETY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="text-[10px] text-muted leading-tight">
            The AI will read this message and learn similar phrases for future auto-flagging.
          </p>
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] px-2 py-1 rounded border border-line text-slate-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="text-[11px] px-2 py-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50 font-medium"
            >
              {busy ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
