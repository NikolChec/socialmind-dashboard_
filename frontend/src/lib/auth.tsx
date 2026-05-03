import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthUser } from '@socialmind/shared';
import { api, getToken, setToken } from './api';

export interface OtpChallenge {
  otp_token: string;
  email_hint: string;
  delivered: boolean;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  /** Returns null when login completed; returns a challenge when 2FA is required. */
  login: (email: string, password: string) => Promise<OtpChallenge | null>;
  verifyOtp: (otp_token: string, code: string, trust_device: boolean) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    api.me()
      .then((u) => setUser(u))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<OtpChallenge | null> {
    const res = await api.login(email, password);
    if ('requires_2fa' in res) {
      return { otp_token: res.otp_token, email_hint: res.email_hint, delivered: res.delivered };
    }
    setToken(res.token);
    setUser(res.user);
    return null;
  }

  async function verifyOtp(otp_token: string, code: string, trust_device: boolean) {
    const res = await api.verifyOtp(otp_token, code, trust_device);
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    api.logout().catch(() => {});
    setToken(null);
    setUser(null);
  }

  return <Ctx.Provider value={{ user, loading, login, verifyOtp, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
