import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const IDLE_MS = 20 * 60 * 1000; // 20 minutes
const WARNING_MS = 2 * 60 * 1000; // warn 2 minutes before logout

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove'];

export function useIdleLogout(onLogout: () => void) {
  const [warning, setWarning] = useState<null | { secondsLeft: number }>(null);
  const lastActivity = useRef(Date.now());
  const warnTimer = useRef<number | null>(null);
  const logoutTimer = useRef<number | null>(null);
  const countdownTimer = useRef<number | null>(null);

  useEffect(() => {
    function clearAll() {
      if (warnTimer.current !== null) window.clearTimeout(warnTimer.current);
      if (logoutTimer.current !== null) window.clearTimeout(logoutTimer.current);
      if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current);
      warnTimer.current = null;
      logoutTimer.current = null;
      countdownTimer.current = null;
    }

    function scheduleWarning() {
      clearAll();
      warnTimer.current = window.setTimeout(() => {
        let secondsLeft = Math.floor(WARNING_MS / 1000);
        setWarning({ secondsLeft });
        countdownTimer.current = window.setInterval(() => {
          secondsLeft -= 1;
          setWarning({ secondsLeft: Math.max(0, secondsLeft) });
        }, 1000);
        logoutTimer.current = window.setTimeout(() => {
          setWarning(null);
          clearAll();
          onLogout();
        }, WARNING_MS);
      }, IDLE_MS - WARNING_MS);
    }

    function reset() {
      lastActivity.current = Date.now();
      setWarning(null);
      scheduleWarning();
    }

    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, reset, { passive: true });
    scheduleWarning();
    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset);
      clearAll();
    };
  }, [onLogout]);

  function stayIn() {
    setWarning(null);
    // reset happens automatically on next user interaction via the listeners
    window.dispatchEvent(new Event('mousedown'));
  }

  return { warning, stayIn };
}

export function IdleWarningModal({ secondsLeft, onStay }: { secondsLeft: number; onStay: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 bg-black/70 grid place-items-center z-[60]">
      <div className="bg-card border border-line rounded-lg p-6 max-w-sm w-full space-y-4">
        <div className="text-lg font-semibold text-slate-100">{t('security.idle_warning_title')}</div>
        <div className="text-sm text-slate-300">
          {t('security.idle_warning_body', { sec: secondsLeft })}
        </div>
        <div className="flex justify-end">
          <button
            onClick={onStay}
            className="px-4 py-2 rounded bg-accent hover:bg-accent/90 text-sm font-medium text-white"
          >
            {t('security.stay_signed_in')}
          </button>
        </div>
      </div>
    </div>
  );
}
