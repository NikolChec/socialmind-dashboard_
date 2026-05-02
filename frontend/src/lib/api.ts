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
  HelperChatLog,
  ChildMissionWithMeta,
  MissionRequest,
  NewMissionInput,
  MissionDifficulty,
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

  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers, credentials: 'include' });
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
    request<LoginResponse | { requires_2fa: true; otp_token: string; email_hint: string; delivered: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  verifyOtp: (otp_token: string, code: string, trust_device: boolean) =>
    request<LoginResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ otp_token, code, trust_device }),
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
  childHelperChats: (id: string) => request<HelperChatLog>(`/children/${id}/helper-chats`),
  adminCreateChild: (body: {
    display_name: string; grade: number; date_of_birth: string;
    username: string; password: string; psychologist_id: string;
    preferred_lang?: 'en' | 'he' | 'ru'; notes?: string;
  }) => request<{ id: string; username: string }>('/admin/children', {
    method: 'POST', body: JSON.stringify(body),
  }),
  adminDeleteChild: (id: string) => request<{ ok: true }>(`/admin/children/${id}`, { method: 'DELETE' }),

  childGuardians: (id: string) =>
    request<Array<{ id: string; name: string; email: string; phone: string | null; rel: 'parent' | 'psychologist' | 'teacher' }>>(`/children/${id}/guardians`),
  childMissions: (id: string) => request<ChildMissionWithMeta[]>(`/children/${id}/missions`),
  createMission: (childId: string, body: NewMissionInput) =>
    request<{ id: string }>(`/children/${childId}/missions`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  deleteMission: (childId: string, missionId: string) =>
    request<{ ok: true }>(`/children/${childId}/missions/${missionId}`, { method: 'DELETE' }),

  childMissionRequests: (childId: string) =>
    request<MissionRequest[]>(`/children/${childId}/mission-requests`),
  submitMissionRequest: (childId: string, body: { title: string; description: string; difficulty?: MissionDifficulty; xp?: number }) =>
    request<{ id: string }>(`/children/${childId}/mission-requests`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  approveMissionRequest: (childId: string, reqId: string, note?: string) =>
    request<{ ok: true; mission_id: string }>(`/children/${childId}/mission-requests/${reqId}/approve`, {
      method: 'POST', body: JSON.stringify({ note: note ?? '' }),
    }),
  rejectMissionRequest: (childId: string, reqId: string, note?: string) =>
    request<{ ok: true }>(`/children/${childId}/mission-requests/${reqId}/reject`, {
      method: 'POST', body: JSON.stringify({ note: note ?? '' }),
    }),

  childScenarioRequests: (childId: string) =>
    request<import('@socialmind/shared').ScenarioQueueRequest[]>(`/children/${childId}/scenario-requests`),
  submitScenarioRequest: (childId: string, body: { scenario: ScenarioType; notes?: string }) =>
    request<{ id: string }>(`/children/${childId}/scenario-requests`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  approveScenarioRequest: (childId: string, reqId: string, note?: string) =>
    request<{ ok: true; queue_id: string }>(`/children/${childId}/scenario-requests/${reqId}/approve`, {
      method: 'POST', body: JSON.stringify({ note: note ?? '' }),
    }),
  rejectScenarioRequest: (childId: string, reqId: string, note?: string) =>
    request<{ ok: true }>(`/children/${childId}/scenario-requests/${reqId}/reject`, {
      method: 'POST', body: JSON.stringify({ note: note ?? '' }),
    }),

  labelHelperMessage: (childId: string, msgId: string, body: { severity: 'safe'|'low'|'medium'|'high'|'critical'; category: string; reason?: string }) =>
    request<{ ok: true; label_id: string; severity: string; category: string }>(
      `/children/${childId}/helper-messages/${msgId}/label`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  learnedSafetyPatterns: () =>
    request<Array<{ id: string; pattern: string; category: string; severity: string; hit_count: number; last_hit_at: string | null; created_at: string }>>(
      `/children/safety-patterns/learned`
    ),
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

  audit: (opts: { mine?: boolean; child_id?: string; limit?: number; range?: 'day' | 'week' | 'month' | 'all' } = {}) => {
    const p = new URLSearchParams();
    if (opts.mine) p.set('mine', 'true');
    if (opts.child_id) p.set('child_id', opts.child_id);
    if (opts.limit) p.set('limit', String(opts.limit));
    if (opts.range) p.set('range', opts.range);
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
  adminUpdateUser: (id: string, body: { name?: string; email?: string; phone?: string | null; password?: string }) =>
    request<{ ok: true }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminDeleteUser: (id: string) =>
    request<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' }),
  adminSetUserTwoFactor: (id: string, enabled: boolean, email?: string | null) =>
    request<{ ok: true }>(`/admin/users/${id}/2fa`, { method: 'PATCH', body: JSON.stringify({ enabled, email: email ?? null }) }),
  adminGetChildTwoFactor: (id: string) =>
    request<{ enabled: boolean; email: string | null }>(`/admin/children/${id}/2fa`),
  adminSetChildTwoFactor: (id: string, enabled: boolean, email?: string | null) =>
    request<{ ok: true }>(`/admin/children/${id}/2fa`, { method: 'PATCH', body: JSON.stringify({ enabled, email: email ?? null }) }),
  adminUpdateChildCredentials: (id: string, body: { username?: string; password?: string }) =>
    request<{ ok: true }>(`/admin/children/${id}/credentials`, { method: 'PATCH', body: JSON.stringify(body) }),
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

  adminListChildPsychologists: (childId: string) =>
    request<Array<{ id: string; email: string; name: string; phone: string | null; is_primary: number }>>(`/admin/children/${childId}/psychologists`),
  adminLinkPsychologist: (childId: string, psychologistId: string) =>
    request<{ ok: true }>(`/admin/children/${childId}/psychologists`, {
      method: 'POST', body: JSON.stringify({ psychologist_id: psychologistId }),
    }),
  adminUnlinkPsychologist: (childId: string, psychologistId: string) =>
    request<{ ok: true }>(`/admin/children/${childId}/psychologists/${psychologistId}`, { method: 'DELETE' }),

  adminListChildTeachers: (childId: string) =>
    request<Array<{ id: string; email: string; name: string; phone: string | null }>>(`/admin/children/${childId}/teachers`),
  adminLinkTeacher: (childId: string, teacherId: string) =>
    request<{ ok: true }>(`/admin/children/${childId}/teachers`, {
      method: 'POST', body: JSON.stringify({ teacher_id: teacherId }),
    }),
  adminUnlinkTeacher: (childId: string, teacherId: string) =>
    request<{ ok: true }>(`/admin/children/${childId}/teachers/${teacherId}`, { method: 'DELETE' }),

  adminListPermissionRequests: (status?: 'pending' | 'approved' | 'denied') =>
    request<Array<{
      id: string; teacher_id: string; teacher_name: string; child_id: string; child_name: string;
      scope: 'helper_chats' | 'alerts' | 'sessions' | 'missions' | 'full';
      reason: string; status: 'pending' | 'approved' | 'denied';
      requested_at: string; resolved_at: string | null; resolved_by: string | null;
      resolved_by_name: string | null; resolved_note: string | null;
    }>>(`/admin/permission-requests${status ? `?status=${status}` : ''}`),
  adminResolvePermissionRequest: (id: string, body: { status: 'approved' | 'denied'; resolved_note?: string }) =>
    request<{ ok: true }>(`/admin/permission-requests/${id}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),

  teacherListPermissionRequests: () =>
    request<Array<{ id: string; child_id: string; child_name: string; scope: string; status: string; requested_at: string; resolved_at: string | null; resolved_note: string | null }>>(`/teacher/permission-requests`),
  teacherCreatePermissionRequest: (body: { child_id: string; scope: 'helper_chats' | 'alerts' | 'sessions' | 'missions' | 'full'; reason?: string }) =>
    request<{ id: string }>(`/teacher/permission-requests`, { method: 'POST', body: JSON.stringify(body) }),

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
