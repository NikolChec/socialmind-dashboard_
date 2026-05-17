/// <reference types="vite/client" />
// HACKATHON DEMO BUILD — no backend. All methods resolve against in-memory mock data
// from ./mockData. The original fetch-based implementation is preserved as api.real.ts.bak.
//
// The exported `api` object's shape is identical to the real one, so no page or
// component needed to change. To restore: `mv api.real.ts.bak api.ts`.

import type {
  AuthUser,
  Child,
  LoginResponse,
  ChatMessage,
  EscalationAction,
  ScenarioQueueItem,
  ParentContact,
  AuditEntry,
  TranscriptMatch,
  ContactMethod,
  ScenarioType,
  AdminUserRow,
  Role,
  ChildMissionWithMeta,
  MissionRequest,
  NewMissionInput,
  MissionDifficulty,
  ScenarioQueueRequest,
} from '@socialmind/shared';
import * as mock from './mockData';

// auth.tsx uses `'requires_2fa' in res` to discriminate the login response.
// Preserve the union shape so that narrowing works, even though the demo build
// never returns the 2FA variant.
type LoginOrChallenge =
  | LoginResponse
  | { requires_2fa: true; otp_token: string; email_hint: string; delivered: boolean };

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

export const API_BASE = '';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

// Small fake latency so loading states briefly show. Keep it short — judges are watching.
const DELAY_MS = 120;
const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status, body });
}

export const api = {
  // ───── auth ─────
  login: async (email: string, password: string): Promise<LoginOrChallenge> => {
    const r = mock.loginWithDemoCreds(email, password);
    if (r === 'invalid') throw httpError(401, { error: 'invalid_credentials' });
    return delay(r);
  },
  verifyOtp: async (_otp_token: string, _code: string, _trust_device: boolean): Promise<LoginResponse> => {
    // 2FA path is unreachable in the demo build — login never returns requires_2fa.
    throw httpError(400, { error: 'demo_mode_no_otp' });
  },
  me: async (): Promise<AuthUser> => {
    const token = getToken();
    const u = token ? mock.userFromToken(token) : null;
    if (!u) throw httpError(401, { error: 'invalid_token' });
    return delay(u);
  },
  logout: async () => {
    return delay({ ok: true as const });
  },

  // ───── children ─────
  children: async () => delay(mock.getChildSummaries()),
  child: async (id: string): Promise<Child & { psychologist_name: string }> => {
    const c = mock.getChildById(id);
    if (!c) throw httpError(404, { error: 'not_found' });
    return delay(c);
  },
  childSessions: async (id: string) => delay(mock.getSessions(id)),
  childProgress: async (id: string) => delay(mock.getProgress(id)),
  childAlerts: async (id: string) => delay(mock.getChildAlerts(id)),
  childScenarioBreakdown: async (id: string) => delay(mock.getScenarioBreakdown(id)),
  childRiskHistory: async (id: string) => delay(mock.getRiskHistory(id)),
  childCompanionActivity: async (id: string) => delay(mock.getCompanionActivity(id)),
  childHelperChats: async (id: string) => delay(mock.getHelperChats(id)),
  childGuardians: async (id: string) => delay(mock.guardiansFor(id)),

  updateSessionNotes: async (childId: string, sessionId: string, notes: string) => {
    mock.updateSessionNotes(childId, sessionId, notes);
    return delay({ ok: true as const });
  },
  setSensitive: async (childId: string, is_sensitive: boolean) => {
    mock.setSensitivity(childId, is_sensitive);
    return delay({ ok: true as const });
  },

  // ───── alerts ─────
  alerts: async (onlyUnack = false) => delay(mock.getAllAlerts(onlyUnack)),
  ackAlert: async (id: string, body: { action_taken?: EscalationAction; action_note?: string } = {}) => {
    mock.ackAlert(id, body);
    return delay({ ok: true as const });
  },

  // ───── analytics ─────
  priorityDistribution: async (): Promise<PriorityDistributionRow[]> =>
    delay(mock.getPriorityDistribution()),

  // ───── missions ─────
  childMissions: async (id: string): Promise<ChildMissionWithMeta[]> => delay(mock.getMissions(id)),
  createMission: async (childId: string, body: NewMissionInput) => {
    const id = mock.addMission(childId, {
      title: body.title, description: body.description,
      difficulty: body.difficulty, xp: body.xp, due_date: body.due_date ?? null,
    });
    return delay({ id });
  },
  deleteMission: async (childId: string, missionId: string) => {
    mock.deleteMission(childId, missionId);
    return delay({ ok: true as const });
  },

  // ───── mission requests ─────
  childMissionRequests: async (childId: string): Promise<MissionRequest[]> =>
    delay(mock.getMissionRequests(childId)),
  submitMissionRequest: async (childId: string, body: { title: string; description: string; difficulty?: MissionDifficulty; xp?: number }) => {
    const id = mock.submitMissionRequest(childId, body);
    return delay({ id });
  },
  approveMissionRequest: async (childId: string, reqId: string, note?: string) => {
    const mission_id = mock.decideMissionRequest(childId, reqId, true, note) ?? '';
    return delay({ ok: true as const, mission_id });
  },
  rejectMissionRequest: async (childId: string, reqId: string, note?: string) => {
    mock.decideMissionRequest(childId, reqId, false, note);
    return delay({ ok: true as const });
  },

  // ───── scenario requests ─────
  childScenarioRequests: async (childId: string): Promise<ScenarioQueueRequest[]> =>
    delay(mock.getScenarioRequests(childId)),
  submitScenarioRequest: async (childId: string, body: { scenario: ScenarioType; notes?: string }) => {
    const id = mock.submitScenarioRequest(childId, body.scenario, body.notes);
    return delay({ id });
  },
  approveScenarioRequest: async (childId: string, reqId: string, note?: string) => {
    const queue_id = mock.decideScenarioRequest(childId, reqId, true, note) ?? '';
    return delay({ ok: true as const, queue_id });
  },
  rejectScenarioRequest: async (childId: string, reqId: string, note?: string) => {
    mock.decideScenarioRequest(childId, reqId, false, note);
    return delay({ ok: true as const });
  },

  // ───── helper-message labelling + learned patterns ─────
  labelHelperMessage: async (_childId: string, _msgId: string, body: { severity: 'safe'|'low'|'medium'|'high'|'critical'; category: string; reason?: string }) =>
    delay({ ok: true as const, label_id: `label-${Date.now()}`, severity: body.severity, category: body.category }),
  learnedSafetyPatterns: async () =>
    delay([
      { id: 'lp-1', pattern: 'feel sad all the time', category: 'distress', severity: 'medium', hit_count: 3, last_hit_at: new Date(Date.now() - 20 * 3_600_000).toISOString(), created_at: new Date(Date.now() - 14 * 86_400_000).toISOString() },
      { id: 'lp-2', pattern: 'want to disappear',     category: 'self_harm', severity: 'high',   hit_count: 1, last_hit_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), created_at: new Date(Date.now() - 7 * 86_400_000).toISOString() },
      { id: 'lp-3', pattern: 'they push me',          category: 'bullying',  severity: 'high',   hit_count: 2, last_hit_at: new Date(Date.now() - 3 * 3_600_000).toISOString(), created_at: new Date(Date.now() - 10 * 86_400_000).toISOString() },
    ]),
  transcriptSearch: async (id: string, q: string): Promise<TranscriptMatch[]> => {
    const sessions = mock.getSessions(id);
    const needle = q.toLowerCase();
    const out: TranscriptMatch[] = [];
    for (const s of sessions) {
      const hits = s.transcript.filter((t) => t.text.toLowerCase().includes(needle));
      if (hits.length === 0) continue;
      out.push({
        session_id: s.id, scenario: s.scenario, started_at: s.started_at,
        snippets: hits.map((h) => ({ speaker: h.speaker, text: h.text, ts: h.ts })),
      });
    }
    return delay(out);
  },

  // ───── scenario queue ─────
  queue: async (childId: string): Promise<ScenarioQueueItem[]> => delay(mock.getScenarioQueue(childId)),
  queueAdd: async (childId: string, scenario: ScenarioType, notes?: string) => {
    const id = mock.addQueueItem(childId, scenario, notes);
    return delay({ id });
  },
  queueRemove: async (childId: string, itemId: string) => {
    mock.removeQueueItem(childId, itemId);
    return delay({ ok: true as const });
  },

  // ───── parent contacts ─────
  contacts: async (childId: string): Promise<ParentContact[]> => delay(mock.getContacts(childId)),
  contactAdd: async (childId: string, body: { contacted_at: string; method: ContactMethod; person: string; topic: string; outcome?: string; notes?: string }) => {
    const id = mock.addContact(childId, body);
    return delay({ id });
  },
  contactRemove: async (childId: string, contactId: string) => {
    mock.removeContact(childId, contactId);
    return delay({ ok: true as const });
  },

  // ───── audit ─────
  audit: async (opts: { mine?: boolean; child_id?: string; limit?: number; range?: 'day' | 'week' | 'month' | 'all' } = {}): Promise<AuditEntry[]> =>
    delay(mock.getAudit(opts)),

  // ───── PDF reports — disabled in demo ─────
  downloadReport: async (_childId: string, _weeks: number, _opts: { confirm?: boolean } = {}) => {
    await delay(null);
    alert('Demo mode — PDF generation requires the backend. Click any other dashboard area to keep exploring.');
  },

  // ───── assistant (counselor's clinical chatbot) ─────
  assistantChat: async (messages: ChatMessage[], _child_id?: string) => {
    const last = messages[messages.length - 1]?.content ?? '';
    const reply = canned(last);
    return delay({ reply });
  },

  // ───── admin: users ─────
  adminUsers: async (role?: Role): Promise<AdminUserRow[]> => delay(mock.listUsers(role)),
  adminCreateUser: async (body: { email: string; name: string; role: Role; password: string; phone?: string; child_ids?: string[] }) => {
    const id = mock.createUser(body);
    return delay({ id });
  },
  adminUpdateUser: async (id: string, body: { name?: string; email?: string; phone?: string | null; password?: string }) => {
    mock.updateUser(id, body);
    return delay({ ok: true as const });
  },
  adminDeleteUser: async (id: string) => {
    mock.deleteUser(id);
    return delay({ ok: true as const });
  },
  adminSetUserTwoFactor: async (id: string, enabled: boolean, email?: string | null) => {
    mock.setUserTwoFactor(id, enabled, email ?? null);
    return delay({ ok: true as const });
  },

  // ───── admin: children ─────
  adminCreateChild: async (body: { display_name: string; grade: number; date_of_birth: string; username: string; password: string; psychologist_id: string; preferred_lang?: 'en' | 'he' | 'ru'; notes?: string }) => {
    const r = mock.createChild(body);
    return delay(r);
  },
  adminDeleteChild: async (id: string) => {
    mock.deleteChild(id);
    return delay({ ok: true as const });
  },
  adminGetChildTwoFactor: async (id: string) => {
    const c = mock.mockState.children.find((c) => c.id === id);
    return delay({ enabled: !!c?.two_factor_enabled, email: c?.two_factor_email ?? null });
  },
  adminSetChildTwoFactor: async (id: string, enabled: boolean, email?: string | null) => {
    const c = mock.mockState.children.find((c) => c.id === id);
    if (c) { c.two_factor_enabled = enabled; c.two_factor_email = email ?? null; }
    return delay({ ok: true as const });
  },
  adminUpdateChildCredentials: async (id: string, body: { username?: string; password?: string }) => {
    const c = mock.mockState.children.find((c) => c.id === id);
    if (c && body.username !== undefined) c.username = body.username;
    return delay({ ok: true as const });
  },
  adminReassignPsychologist: async (childId: string, psychologistId: string) => {
    const c = mock.mockState.children.find((c) => c.id === childId);
    if (c) c.psychologist_id = psychologistId;
    return delay({ ok: true as const });
  },

  // ───── admin: child↔user linkage ─────
  adminListChildParents: async (childId: string) =>
    delay(mock.listChildLinks(childId, 'parents').map(({ id, name, email, phone }) => ({ id, name, email, phone }))),
  adminLinkParent: async (childId: string, parentId: string) => {
    mock.linkChildUser(childId, parentId, 'parents');
    return delay({ ok: true as const });
  },
  adminUnlinkParent: async (childId: string, parentId: string) => {
    mock.unlinkChildUser(childId, parentId, 'parents');
    return delay({ ok: true as const });
  },

  adminListChildPsychologists: async (childId: string) =>
    delay(mock.listChildLinks(childId, 'psychologists')),
  adminLinkPsychologist: async (childId: string, psychologistId: string) => {
    mock.linkChildUser(childId, psychologistId, 'psychologists');
    return delay({ ok: true as const });
  },
  adminUnlinkPsychologist: async (childId: string, psychologistId: string) => {
    mock.unlinkChildUser(childId, psychologistId, 'psychologists');
    return delay({ ok: true as const });
  },

  adminListChildTeachers: async (childId: string) =>
    delay(mock.listChildLinks(childId, 'teachers').map(({ id, name, email, phone }) => ({ id, name, email, phone }))),
  adminLinkTeacher: async (childId: string, teacherId: string) => {
    mock.linkChildUser(childId, teacherId, 'teachers');
    return delay({ ok: true as const });
  },
  adminUnlinkTeacher: async (childId: string, teacherId: string) => {
    mock.unlinkChildUser(childId, teacherId, 'teachers');
    return delay({ ok: true as const });
  },

  // ───── admin: permission requests ─────
  adminListPermissionRequests: async (status?: 'pending' | 'approved' | 'denied') =>
    delay(mock.listPermissionRequests(status)),
  adminResolvePermissionRequest: async (id: string, body: { status: 'approved' | 'denied'; resolved_note?: string }) => {
    mock.resolvePermissionRequest(id, body.status, body.resolved_note);
    return delay({ ok: true as const });
  },

  // ───── teacher: permission requests ─────
  teacherListPermissionRequests: async () =>
    delay(mock.listPermissionRequests().map((r) => ({
      id: r.id, child_id: r.child_id, child_name: r.child_name, scope: r.scope,
      status: r.status, requested_at: r.requested_at,
      resolved_at: r.resolved_at, resolved_note: r.resolved_note,
    }))),
  teacherCreatePermissionRequest: async (_body: { child_id: string; scope: 'helper_chats' | 'alerts' | 'sessions' | 'missions' | 'full'; reason?: string }) =>
    delay({ id: `pr-${Date.now()}` }),
};

// Canned reply for the clinical assistant chat (no LLM in the demo).
function canned(input: string): string {
  const q = input.toLowerCase();
  if (q.includes('yoav')) return 'Yoav had a high-priority bullying alert ~3 hours ago. His sentiment has been trending down for the past three days. His mother was contacted by Dr. Klein the same day. Worth a one-on-one this week.';
  if (q.includes('maya')) return 'Maya logged a medium-severity distress message yesterday — "I just feel sad all the time and nothing helps." It\'s a one-week mood change. Consider a check-in and review with her teacher.';
  if (q.includes('daniel')) return 'Daniel\'s self-harm flag from 3 days ago is resolved — parent contacted, emergency session held, safety plan in place. Continue weekly cadence.';
  if (q.includes('risk') || q.includes('priority')) return 'Right now: Yoav (78 — bullying flag, active), Daniel (65 — in treatment, post-incident), Maya (55 — emerging distress). Yoav is the most time-sensitive.';
  return 'I can summarize a specific child\'s status, surface trending risks, or pull recent helper-chat themes. Try asking about Yoav, Maya, or Daniel, or about priorities for this week.';
}

export interface AlertStreamEvent {
  type: 'new_alert';
  priority: 'high' | 'medium' | 'low';
  child_id: string;
  child_name: string;
  excerpt: string;
  alert_id: string;
  created_at: string;
}

// Fires one synthetic alert ~20s after the dashboard mounts so judges see the live-alert flow.
// Also appends the alert to mockState so it shows in lists when navigated to.
export async function openAlertStream(onEvent: (e: AlertStreamEvent) => void): Promise<() => void> {
  const token = getToken();
  if (!token) return () => {};

  let cancelled = false;
  const t = setTimeout(() => {
    if (cancelled) return;
    const alertId = `alert-live-${Date.now()}`;
    const childId = 'child-dana';
    const child = mock.mockState.children.find((c) => c.id === childId);
    const child_name = child?.display_name ?? 'Dana Levi';
    const excerpt = "i'm really nervous about the presentation on monday";
    mock.mockState.alerts.unshift({
      id: alertId, child_id: childId, session_id: null,
      priority: 'medium', type: 'severe_anxiety',
      excerpt, context: 'Helper chat — Dana surfaced rising anxiety about her upcoming class presentation.',
      created_at: new Date().toISOString(),
      acknowledged_at: null, acknowledged_by: null,
      action_taken: null, action_note: null,
      child_name,
    });
    onEvent({
      type: 'new_alert', priority: 'medium',
      child_id: childId, child_name,
      excerpt, alert_id: alertId,
      created_at: new Date().toISOString(),
    });
  }, 20_000);

  return () => { cancelled = true; clearTimeout(t); };
}
