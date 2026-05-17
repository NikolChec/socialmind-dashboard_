import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useAuth, type OtpChallenge } from '../lib/auth';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { BrandWordmark } from '../components/Brand';
import { DEMO_CREDENTIALS_LIST } from '../lib/mockData';

export function LoginPage() {
  const { login, verifyOtp } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const ch = await login(email, password);
      if (ch) {
        setChallenge(ch);
        setLoading(false);
        return;
      }
      nav('/');
    } catch (err) {
      const e = err as { status?: number; body?: { error?: string; unlock_in_minutes?: number } };
      if (e.status === 423 || e.body?.error === 'account_locked') {
        const min = e.body?.unlock_in_minutes;
        setError(
          typeof min === 'number' && min > 0
            ? t('security.lockout_message', { min })
            : t('security.lockout_message_generic')
        );
      } else if (e.status === 429 || e.body?.error === 'too_many_requests') {
        setError(t('security.too_many'));
      } else if (e.status === 401 || e.status === 400) {
        setError(t('auth.invalid'));
      } else if (e.status && e.status >= 500) {
        setError(t('security.server_error'));
      } else if (!e.status) {
        setError(t('security.network_error'));
      } else {
        setError(t('auth.invalid'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(challenge.otp_token, code, false);
      nav('/');
    } catch (err) {
      const e = err as { status?: number; body?: { error?: string } };
      const reason = e.body?.error;
      if (reason === 'wrong_code') setError(t('auth.otp_wrong'));
      else if (reason === 'expired') setError(t('auth.otp_expired'));
      else if (reason === 'too_many_attempts') setError(t('auth.otp_locked'));
      else setError(t('auth.invalid'));
    } finally {
      setLoading(false);
    }
  }

  if (challenge) {
    return (
      <div className="min-h-full relative grid place-items-center p-4 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-24 -start-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        </div>
        <div className="relative w-full max-w-md">
          <form onSubmit={onVerify} className="bg-card/90 backdrop-blur border border-line rounded-2xl p-8 shadow-card space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-accent" size={22} />
                  <BrandWordmark size="lg" />
                </div>
                <div className="text-sm text-muted mt-2">{t('auth.otp_subtitle', { email: challenge.email_hint })}</div>
                {!challenge.delivered && (
                  <div className="text-xs text-amber-300 mt-1.5">{t('auth.otp_not_delivered')}</div>
                )}
              </div>
              <LanguageSwitcher />
            </div>
            <div className="space-y-4">
              <Field label={t('auth.otp_code')} icon={<Lock size={15} strokeWidth={2} />}>
                <input
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="one-time-code"
                  autoFocus
                  className="w-full bg-ink border border-line rounded-lg ps-9 pe-3 py-2.5 text-base tracking-[0.4em] text-center font-mono focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition"
                  required
                />
              </Field>
            </div>
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-300 bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit" disabled={loading || code.length !== 6}
              className="w-full bg-accent hover:bg-accent/90 active:bg-accent/80 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold shadow-sm transition"
            >
              {loading ? t('auth.signingin') : t('auth.otp_verify')}
            </button>
            <button
              type="button"
              onClick={() => { setChallenge(null); setCode(''); setError(null); }}
              className="w-full text-xs text-muted hover:text-slate-100"
            >
              {t('auth.otp_back')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full relative grid place-items-center p-4 overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-24 -start-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <form
          onSubmit={onSubmit}
          className="bg-card/90 backdrop-blur border border-line rounded-2xl p-8 shadow-card space-y-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <BrandWordmark size="lg" />
              <div className="text-sm text-muted mt-1.5">{t('auth.subtitle')}</div>
            </div>
            <LanguageSwitcher />
          </div>

          <div className="space-y-4">
            <Field label={t('auth.email')} icon={<Mail size={15} strokeWidth={2} />}>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full bg-ink border border-line rounded-lg ps-9 pe-3 py-2.5 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition"
                required
              />
            </Field>

            <Field label={t('auth.password')} icon={<Lock size={15} strokeWidth={2} />}>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-ink border border-line rounded-lg ps-9 pe-3 py-2.5 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition"
                required
              />
            </Field>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-300 bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full bg-accent hover:bg-accent/90 active:bg-accent/80 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold shadow-sm transition"
          >
            {loading ? t('auth.signingin') : t('auth.signin')}
          </button>

          <div className="pt-2 border-t border-line/60">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">Demo accounts</div>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_CREDENTIALS_LIST.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onClick={() => { setEmail(c.email); setPassword(c.password); setError(null); }}
                  className="text-xs bg-ink border border-line hover:border-accent/60 hover:text-slate-100 text-muted rounded-md py-2 px-1.5 transition"
                  title={`${c.email} / ${c.password}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-muted/70 mt-2">Click a role to autofill. Password: demo123.</div>
          </div>

        </form>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1.5 font-medium">{label}</div>
      <div className="relative">
        <div className="absolute start-3 top-1/2 -translate-y-1/2 text-muted">
          {icon}
        </div>
        {children}
      </div>
    </label>
  );
}

