/// <reference types="vite/client" />
import type {
  AuthUser,
  Child,
  Session,
  Alert,
  ProgressPoint,
  LoginResponse,
  ChatMessage,
  ChildSummary,
  ScenarioBreakdown,
  EscalationAction,
  ScenarioQueueItem,
  ParentContact,
  AuditEntry,
  RiskSnapshotPoint,
  TranscriptMatch,
  ContactMethod,
  ScenarioType,
  AdminUserRow,
  Role,
  CompanionActivitySummary,
} from '@socialmind/shared';

export interface PriorityDistributionRow {
  child_id: string;
  child_name: string;
  grade: number;
  unread_high: number;
  unread_medium: number;
  unread_low: number;
  total_high: number;
  total_medium: number;
  total_low: number;
  total_alerts: number;
}

const TOKEN_KEY = 'socialmind.token';

// In dev (Vite served), `/api/*` is proxied to localhost:4000.
// In production (Electron loads dist/index.html via file://), there is no proxy,
// so we hit the backend directly. VITE_API_BASE is set at build time.
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (window.location.protocol === 'file:' ? 'http://localhost:4000' : '');

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Skip the ngrok free-tier browser-warning interstitial on API calls.
    // Harmless when not going through ngrok.
    'ngrok-skip-browser-warning': 'true',
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers });
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text(); }
    throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body });
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthUser>('/auth/me'),
  children: () => request<ChildSummary[]>('/children'),
  child: (id: string) => request<Child & { psychologist_name: string }>(`/children/${id}`),
  childSessions: (id: string) => request<Session[]>(`/children/${id}/sessions`),
  childProgress: (id: string) => request<ProgressPoint[]>(`/children/${id}/progress`),
  childAlerts: (id: string) => request<Alert[]>(`/children/${id}/alerts`),
  childScenarioBreakdown: (id: string) => request<ScenarioBreakdown[]>(`/children/${id}/scenario-breakdown`),
  updateSessionNotes: (childId: string, sessionId: string, notes: string) =>
    request<{ ok: true }>(`/children/${childId}/sessions/${sessionId}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),
  alerts: (onlyUnack = false) =>
    request<Array<Alert & { child_name: string }>>(`/alerts${onlyUnack ? '?unacknowledged=true' : ''}`),
  ackAlert: (id: string, body: { action_taken?: EscalationAction; action_note?: string } = {}) =>
    request<{ ok: true }>(`/alerts/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  priorityDistribution: () => request<PriorityDistributionRow[]>('/analytics/priority-distribution'),
  childRiskHistory: (id: string) => request<RiskSnapshotPoint[]>(`/children/${id}/risk-history`),
  childCompanionActivity: (id: string) => request<CompanionActivitySummary>(`/children/${id}/companion-activity`),
  transcriptSearch: (id: string, q: string) =>
    request<TranscriptMatch[]>(`/children/${id}/transcript-search?q=${encodeURIComponent(q)}`),

  queue: (childId: string) => request<ScenarioQueueItem[]>(`/queue/${childId}`),
  queueAdd: (childId: string, scenario: ScenarioType, notes?: string) =>
    request<{ id: string }>(`/queue/${childId}`, { method: 'POST', body: JSON.stringify({ scenario, notes }) }),
  queueRemove: (childId: string, itemId: string) =>
    request<{ ok: true }>(`/queue/${childId}/${itemId}`, { method: 'DELETE' }),

  contacts: (childId: string) => request<ParentContact[]>(`/contacts/${childId}`),
  contactAdd: (childId: string, body: {
    contacted_at: string; method: ContactMethod; person: string; topic: string; outcome?: string; notes?: string;
  }) => request<{ id: string }>(`/contacts/${childId}`, { method: 'POST', body: JSON.stringify(body) }),
  contactRemove: (childId: string, contactId: string) =>
    request<{ ok: true }>(`/contacts/${childId}/${contactId}`, { method: 'DELETE' }),

  audit: (opts: { mine?: boolean; child_id?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.mine) p.set('mine', 'true');
    if (opts.child_id) p.set('child_id', opts.child_id);
    if (opts.limit) p.set('limit', String(opts.limit));
    return request<AuditEntry[]>(`/audit${p.toString() ? `?${p}` : ''}`);
  },

  downloadReport: async (childId: string, weeks: number, opts: { confirm?: boolean } = {}) => {
    const token = getToken();
    const url = `${API_BASE}/api/reports/child/${childId}?weeks=${weeks}${opts.confirm ? '&confirm=1' : ''}`;
    const res = await fetch(url, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.status === 428) {
      const body = await res.json();
      throw Object.assign(new Error('confirmation_required'), { status: 428, body });
    }
    if (!res.ok) throw new Error(`report_failed_${res.status}`);
    const blob = await res.blob();
    const disp = res.headers.get('Content-Disposition') || '';
    const match = disp.match(/filename="([^"]+)"/);
    const name = match ? match[1] : `report.pdf`;
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl; a.download = name;
    document.body.appendChild(a); a.click();
    URL.revokeObjectURL(blobUrl); a.remove();
  },

  setSensitive: (childId: string, is_sensitive: boolean) =>
    request<{ ok: true }>(`/children/${childId}/sensitivity`, {
      method: 'PATCH', body: JSON.stringify({ is_sensitive }),
    }),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  adminUsers: (role?: Role) =>
    request<AdminUserRow[]>(`/admin/users${role ? `?role=${role}` : ''}`),
  adminCreateUser: (body: {
    email: string; name: string; role: Role; password: string; phone?: string; child_ids?: string[];
  }) => request<{ id: string }>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  adminUpdateUser: (id: string, body: { name?: string; phone?: string | null; password?: string }) =>
    request<{ ok: true }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminDeleteUser: (id: string) =>
    request<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' }),
  adminReassignPsychologist: (childId: string, psychologistId: string) =>
    request<{ ok: true }>(`/admin/children/${childId}/psychologist`, {
      method: 'PATCH', body: JSON.stringify({ psychologist_id: psychologistId }),
    }),
  adminListChildParents: (childId: string) =>
    request<Array<{ id: string; email: string; name: string; phone: string | null }>>(`/admin/children/${childId}/parents`),
  adminLinkParent: (childId: string, parentId: string) =>
    request<{ ok: true }>(`/admin/children/${childId}/parents`, {
      method: 'POST', body: JSON.stringify({ parent_id: parentId }),
    }),
  adminUnlinkParent: (childId: string, parentId: string) =>
    request<{ ok: true }>(`/admin/children/${childId}/parents/${parentId}`, { method: 'DELETE' }),

  assistantChat: (messages: ChatMessage[], child_id?: string) =>
    request<{ reply: string }>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, child_id }),
    }),
};

export interface AlertStreamEvent {
  type: 'new_alert';
  priority: 'high' | 'medium' | 'low';
  child_id: string;
  child_name: string;
  excerpt: string;
  alert_id: string;
  created_at: string;
}

export async function openAlertStream(onEvent: (e: AlertStreamEvent) => void): Promise<() => void> {
  const token = getToken();
  if (!token) return () => {};
  let src: EventSource | null = null;
  let closed = false;

  async function connect() {
    if (closed) return;
    try {
      const res = await fetch(`${API_BASE}/api/stream/ticket`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true',
        },
      });
      if (!res.ok) return;
      const { ticket } = (await res.json()) as { ticket: string };
      src = new EventSource(`${API_BASE}/api/stream/alerts?ticket=${encodeURIComponent(ticket)}`);
      src.onmessage = (m) => {
        try { onEvent(JSON.parse(m.data)); } catch { /* noop */ }
      };
      src.onerror = () => {
        src?.close();
        src = null;
        if (!closed) setTimeout(connect, 5000);
      };
    } catch {
      if (!closed) setTimeout(connect, 5000);
    }
  }

  await connect();
  return () => { closed = true; src?.close(); };
}
