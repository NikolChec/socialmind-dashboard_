import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { openAlertStream, type AlertStreamEvent } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Toast extends AlertStreamEvent { toastId: number }

export function AlertToaster() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!user) return;
    let idCounter = 0;
    let close: (() => void) | null = null;
    openAlertStream((e) => {
      if (e.priority === 'low') return;
      const toast: Toast = { ...e, toastId: ++idCounter };
      setToasts((xs) => [...xs, toast].slice(-4));
      setTimeout(() => {
        setToasts((xs) => xs.filter((x) => x.toastId !== toast.toastId));
      }, e.priority === 'high' ? 15000 : 8000);
    }).then((c) => { close = c; });
    return () => { close?.(); };
  }, [user]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 end-6 flex flex-col gap-2 z-40 max-w-sm">
      {toasts.map((x) => (
        <button
          key={x.toastId}
          onClick={() => {
            setToasts((xs) => xs.filter((t) => t.toastId !== x.toastId));
            nav(`/children/${x.child_id}`);
          }}
          className={`text-start rounded-lg border px-4 py-3 shadow-lg transition ${
            x.priority === 'high'
              ? 'bg-bad/20 border-bad/60 text-red-100'
              : 'bg-warn/20 border-warn/60 text-amber-100'
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide">
            {x.priority === 'high' ? t('toast.new_high', { name: x.child_name }) : t('toast.new_medium', { name: x.child_name })}
          </div>
          <div className="text-sm mt-0.5 line-clamp-2">"{x.excerpt}"</div>
        </button>
      ))}
    </div>
  );
}
