export type ISODate = string;
export type UUID = string;

export type AlertPriority = 'high' | 'medium' | 'low';

export type AlertType =
  | 'self_harm'
  | 'suicide_ideation'
  | 'violence'
  | 'abuse'
  | 'bullying'
  | 'severe_anxiety'
  | 'emotional_distress'
  | 'unusual_language'
  | 'other';

export type ScenarioType =
  | 'asking_teacher_for_help'
  | 'joining_group_conversation'
  | 'handling_disagreement'
  | 'ordering_in_public'
  | 'introducing_yourself'
  | 'presenting_in_class'
  | 'refusing_peer_pressure'
  | 'asking_for_a_date';

export type Speaker = 'ai' | 'child';

export type Role = 'school_admin' | 'psychologist' | 'parent' | 'teacher';

export const MAX_PARENTS_PER_CHILD = 2;
export const MAX_PSYCHOLOGISTS_PER_CHILD = 2;

export type PermissionScope = 'helper_chats' | 'alerts' | 'sessions' | 'missions' | 'full';
export type PermissionStatus = 'pending' | 'approved' | 'denied';

export interface PermissionRequest {
  id: UUID;
  teacher_id: UUID;
  teacher_name: string;
  child_id: UUID;
  child_name: string;
  scope: PermissionScope;
  reason: string;
  status: PermissionStatus;
  requested_at: ISODate;
  resolved_at: ISODate | null;
  resolved_by: UUID | null;
  resolved_by_name: string | null;
  resolved_note: string | null;
}

export interface LinkedUserRow {
  id: UUID;
  name: string;
  email: string;
  phone: string | null;
}

export interface School {
  id: UUID;
  name: string;
  created_at: ISODate;
}

export interface User {
  id: UUID;
  school_id: UUID;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
  created_at: ISODate;
}

export interface AdminUserRow extends User {
  linked_child_ids: UUID[];
  linked_child_names: string[];
  two_factor_enabled: boolean;
  two_factor_email: string | null;
}

export interface HelperChatMessageInput {
  content: string;
  private_from_parents?: boolean;
}

export interface Child {
  id: UUID;
  school_id: UUID;
  psychologist_id: UUID;
  display_name: string;
  grade: number;
  date_of_birth: ISODate;
  notes: string;
  is_sensitive: boolean;
  created_at: ISODate;
  username?: string | null;
  preferred_lang?: string | null;
  two_factor_enabled?: boolean;
  two_factor_email?: string | null;
}

export interface TranscriptLine {
  speaker: Speaker;
  text: string;
  ts: ISODate;
}

export interface SessionMetrics {
  response_latency_avg_ms: number;
  talk_time_ratio: number;
  word_count: number;
  unique_words: number;
  sentiment_score: number;
}

export interface Session {
  id: UUID;
  child_id: UUID;
  scenario: ScenarioType;
  started_at: ISODate;
  ended_at: ISODate;
  duration_sec: number;
  scenario_success: boolean;
  completed: boolean;
  metrics: SessionMetrics;
  transcript: TranscriptLine[];
  ai_character_name: string;
  notes: string;
}

export type EscalationAction =
  | 'contacted_parent'
  | 'contacted_school'
  | 'contacted_emergency'
  | 'addressed_in_session'
  | 'scheduled_followup'
  | 'no_action_needed';

export interface Alert {
  id: UUID;
  child_id: UUID;
  session_id: UUID | null;
  priority: AlertPriority;
  type: AlertType;
  excerpt: string;
  context: string;
  created_at: ISODate;
  acknowledged_at: ISODate | null;
  acknowledged_by: UUID | null;
  action_taken: EscalationAction | null;
  action_note: string | null;
}

export interface ServerIngestPayload {
  child_id: UUID;
  session_id: UUID;
  scenario: ScenarioType;
  started_at: ISODate;
  ended_at: ISODate;
  scenario_success: boolean;
  metrics: SessionMetrics;
  transcript: TranscriptLine[];
  alerts: Array<Omit<Alert, 'id' | 'child_id' | 'session_id' | 'created_at' | 'acknowledged_at' | 'acknowledged_by'>>;
  ai_character_name: string;
}

export interface ChildSummary extends Child {
  psychologist_name: string;
  unread_alerts: number;
  unread_high: number;
  unread_medium: number;
  unread_low: number;
  total_high: number;
  total_medium: number;
  total_low: number;
  last_session_at: ISODate | null;
  sessions_14d: number;
  risk_score: number;
  risk_reasons: string[];
}

export interface ScenarioBreakdown {
  scenario: ScenarioType;
  attempts: number;
  successes: number;
  success_rate: number;
}

export interface ProgressPoint {
  date: ISODate;
  response_latency_avg_ms: number;
  talk_time_ratio: number;
  scenario_success_rate: number;
  sentiment_score: number;
}

export type ContactMethod = 'phone' | 'sms' | 'email' | 'in_person' | 'video' | 'other';

export interface ScenarioQueueItem {
  id: UUID;
  child_id: UUID;
  scenario: ScenarioType;
  assigned_by: UUID;
  assigned_by_name: string;
  assigned_at: ISODate;
  consumed_at: ISODate | null;
  notes: string;
}

export interface ParentContact {
  id: UUID;
  child_id: UUID;
  logged_by: UUID;
  logged_by_name: string;
  contacted_at: ISODate;
  method: ContactMethod;
  person: string;
  topic: string;
  outcome: string;
  notes: string;
  created_at: ISODate;
}

export interface AuditEntry {
  id: UUID;
  user_id: UUID | null;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id: UUID | null;
  child_id: UUID | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: ISODate;
}

export interface RiskSnapshotPoint {
  date: ISODate;
  risk_score: number;
  unread_high: number;
  unread_medium: number;
  unread_low: number;
  sentiment_avg: number | null;
}

export interface TranscriptMatch {
  session_id: UUID;
  scenario: ScenarioType;
  started_at: ISODate;
  snippets: Array<{ speaker: Speaker; text: string; ts: ISODate }>;
}

export interface AuthUser {
  id: UUID;
  email: string;
  name: string;
  role: Role;
  school_id: UUID;
  school_name: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AssistantRequest {
  messages: ChatMessage[];
  child_id?: UUID;
}

export interface AssistantResponse {
  reply: string;
}

// ---------- Child companion app ----------

export type MissionDifficulty = 'easy' | 'medium' | 'hard';

export interface ChildAuthUser {
  id: UUID;
  display_name: string;
  grade: number;
  school_id: UUID;
  preferred_lang: string;
}

export interface ChildLoginResponse {
  token: string;
  child: ChildAuthUser;
  expires_in: number;
}

export interface RecapGoodPart {
  key: string;
  params?: Record<string, string | number>;
}

export interface VRRecapHighlight {
  session_id: UUID;
  scenario: ScenarioType;
  date: ISODate;
  ai_character_name: string;
  good_parts: RecapGoodPart[];
  ai_quote: string | null;
}

export interface ChildRecap {
  child: ChildAuthUser;
  streak_days: number;
  total_sessions: number;
  total_missions_done: number;
  highlights: VRRecapHighlight[];
}

export interface ChildMission {
  id: UUID;
  title: string;
  description: string;
  source_scenario: ScenarioType | null;
  difficulty: MissionDifficulty;
  xp: number;
  assigned_at: ISODate;
  due_date: ISODate | null;
  completed_at: ISODate | null;
  child_reflection: string | null;
}

export interface ChildMissionWithMeta extends ChildMission {
  assigned_by: UUID | null;
  assigned_by_name: string | null;
  source: 'auto' | 'psychologist' | 'parent_request';
  private_from_parents: boolean;
}

export interface NewMissionInput {
  title: string;
  description: string;
  difficulty: MissionDifficulty;
  xp: number;
  due_date?: ISODate | null;
}

export type MissionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface MissionRequest {
  id: UUID;
  child_id: UUID;
  child_name: string;
  parent_id: UUID;
  parent_name: string;
  title: string;
  description: string;
  difficulty: MissionDifficulty;
  xp: number;
  status: MissionRequestStatus;
  psych_note: string | null;
  decided_by: UUID | null;
  decided_by_name: string | null;
  decided_at: ISODate | null;
  resulting_mission_id: UUID | null;
  created_at: ISODate;
  requester_role: 'parent' | 'teacher';
}

export type ScenarioRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ScenarioQueueRequest {
  id: UUID;
  child_id: UUID;
  child_name: string;
  requester_id: UUID;
  requester_name: string;
  requester_role: 'parent' | 'teacher';
  scenario: ScenarioType;
  notes: string;
  status: ScenarioRequestStatus;
  decided_by: UUID | null;
  decided_by_name: string | null;
  decided_at: ISODate | null;
  decision_note: string | null;
  resulting_queue_id: UUID | null;
  created_at: ISODate;
}

export type ChildAppEventType =
  | 'login'
  | 'mission_completed'
  | 'mission_uncompleted'
  | 'helper_chat'
  | 'recap_viewed';

export interface ChildAppEvent {
  id: UUID;
  child_id: UUID;
  type: ChildAppEventType;
  payload: Record<string, unknown> | null;
  created_at: ISODate;
}

export interface CompanionActivitySummary {
  last_login_at: ISODate | null;
  total_logins: number;
  missions_completed: number;
  missions_open: number;
  helper_messages_30d: number;
  recent_completed_missions: Array<{
    id: UUID;
    title: string;
    completed_at: ISODate;
    child_reflection: string | null;
    xp: number;
  }>;
  recent_helper_messages: Array<{
    id: UUID;
    role: 'child' | 'helper';
    content: string;
    created_at: ISODate;
  }>;
  recent_events: ChildAppEvent[];
}

export type SafetySeverity = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface HelperMessageFlags {
  severity: SafetySeverity;
  categories: string[];
  phrases: string[];
}

export interface HelperChatMessage {
  id: UUID;
  role: 'child' | 'helper';
  content: string;
  flags: HelperMessageFlags | null;
  created_at: ISODate;
}

export interface HelperChatSession {
  started_at: ISODate;
  ended_at: ISODate;
  flags: { severity: SafetySeverity; categories: string[] };
  messages: HelperChatMessage[];
}

export interface HelperChatLog {
  child_name: string;
  sessions: HelperChatSession[];
}
