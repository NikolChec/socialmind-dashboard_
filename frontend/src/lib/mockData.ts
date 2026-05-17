// Hackathon demo data. No backend required — everything is in memory.
// Mutating helpers (ack, create, delete, etc.) update the `mockState` object so
// the UI feels responsive when judges click around.

import type {
  AuthUser,
  Child,
  ChildSummary,
  Session,
  Alert,
  ProgressPoint,
  ScenarioBreakdown,
  EscalationAction,
  ScenarioQueueItem,
  ParentContact,
  AuditEntry,
  RiskSnapshotPoint,
  AdminUserRow,
  Role,
  CompanionActivitySummary,
  HelperChatLog,
  ChildMissionWithMeta,
  MissionRequest,
  ScenarioQueueRequest,
  ScenarioType,
  MissionDifficulty,
  ContactMethod,
} from '@socialmind/shared';

// ───────── time helpers ─────────
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const hoursAgo = (n: number) => iso(NOW - n * 3_600_000);
const daysAgo = (n: number) => iso(NOW - n * 86_400_000);

// ───────── school + users ─────────
export const SCHOOL_ID = 'school-herzl';
export const SCHOOL_NAME = 'Herzl Elementary';

export const ADMIN_ID = 'user-admin';
export const COUNSELOR_ID = 'user-counselor';
export const TEACHER1_ID = 'user-teacher-1';
export const TEACHER2_ID = 'user-teacher-2';
export const PARENT1_ID = 'user-parent-1';
export const PARENT2_ID = 'user-parent-2';
export const PARENT3_ID = 'user-parent-3';
export const PARENT4_ID = 'user-parent-4';

interface DemoAccount {
  user: AuthUser;
  password: string;
  label: string;
}

export const DEMO_ACCOUNTS: Record<string, DemoAccount> = {
  'admin@demo.com': {
    password: 'demo123',
    label: 'Admin',
    user: {
      id: ADMIN_ID,
      email: 'admin@demo.com',
      name: 'Vlad Fridman',
      role: 'school_admin',
      school_id: SCHOOL_ID,
      school_name: SCHOOL_NAME,
    },
  },
  'counselor@demo.com': {
    password: 'demo123',
    label: 'Counselor',
    user: {
      id: COUNSELOR_ID,
      email: 'counselor@demo.com',
      name: 'Dr. Sarah Klein',
      role: 'psychologist',
      school_id: SCHOOL_ID,
      school_name: SCHOOL_NAME,
    },
  },
  'teacher@demo.com': {
    password: 'demo123',
    label: 'Teacher',
    user: {
      id: TEACHER1_ID,
      email: 'teacher@demo.com',
      name: 'Mr. David Cohen',
      role: 'teacher',
      school_id: SCHOOL_ID,
      school_name: SCHOOL_NAME,
    },
  },
};

export const DEMO_CREDENTIALS_LIST = Object.entries(DEMO_ACCOUNTS).map(([email, a]) => ({
  email,
  password: a.password,
  label: a.label,
  role: a.user.role,
}));

// All users (for the admin user-management panel)
const allUsers: AdminUserRow[] = [
  {
    id: ADMIN_ID, school_id: SCHOOL_ID,
    email: 'admin@demo.com', name: 'Vlad Fridman', role: 'school_admin',
    phone: '+972-50-1000001', created_at: daysAgo(90),
    linked_child_ids: [], linked_child_names: [],
    two_factor_enabled: true, two_factor_email: 'admin@demo.com',
  },
  {
    id: COUNSELOR_ID, school_id: SCHOOL_ID,
    email: 'counselor@demo.com', name: 'Dr. Sarah Klein', role: 'psychologist',
    phone: '+972-50-1000002', created_at: daysAgo(85),
    linked_child_ids: [], linked_child_names: [],
    two_factor_enabled: true, two_factor_email: 'counselor@demo.com',
  },
  {
    id: TEACHER1_ID, school_id: SCHOOL_ID,
    email: 'teacher@demo.com', name: 'Mr. David Cohen', role: 'teacher',
    phone: '+972-50-1000003', created_at: daysAgo(80),
    linked_child_ids: [], linked_child_names: [],
    two_factor_enabled: false, two_factor_email: null,
  },
  {
    id: TEACHER2_ID, school_id: SCHOOL_ID,
    email: 'teacher2@demo.com', name: 'Ms. Rachel Adler', role: 'teacher',
    phone: '+972-50-1000004', created_at: daysAgo(80),
    linked_child_ids: [], linked_child_names: [],
    two_factor_enabled: false, two_factor_email: null,
  },
  {
    id: PARENT1_ID, school_id: SCHOOL_ID,
    email: 'parent.yoav@demo.com', name: "Sarah (Yoav's mother)", role: 'parent',
    phone: '+972-50-2000001', created_at: daysAgo(75),
    linked_child_ids: [], linked_child_names: [],
    two_factor_enabled: false, two_factor_email: null,
  },
  {
    id: PARENT2_ID, school_id: SCHOOL_ID,
    email: 'parent.dana@demo.com', name: "Miriam (Dana's mother)", role: 'parent',
    phone: '+972-50-2000002', created_at: daysAgo(75),
    linked_child_ids: [], linked_child_names: [],
    two_factor_enabled: false, two_factor_email: null,
  },
  {
    id: PARENT3_ID, school_id: SCHOOL_ID,
    email: 'parent.maya@demo.com', name: "Eli (Maya's father)", role: 'parent',
    phone: '+972-50-2000003', created_at: daysAgo(70),
    linked_child_ids: [], linked_child_names: [],
    two_factor_enabled: false, two_factor_email: null,
  },
  {
    id: PARENT4_ID, school_id: SCHOOL_ID,
    email: 'parent.daniel@demo.com', name: "Ronit (Daniel's mother)", role: 'parent',
    phone: '+972-50-2000004', created_at: daysAgo(70),
    linked_child_ids: [], linked_child_names: [],
    two_factor_enabled: false, two_factor_email: null,
  },
];

// ───────── children ─────────
interface KidSeed {
  id: string;
  name: string;
  grade: number;
  dob: string;
  username: string;
  is_sensitive: boolean;
  preferred_lang: 'en' | 'he' | 'ru';
  notes: string;
}

const kidSeeds: KidSeed[] = [
  { id: 'child-yoav',   name: 'Yoav Cohen',      grade: 5, dob: '2014-03-12', username: 'yoav',   is_sensitive: true,  preferred_lang: 'he', notes: 'Working on assertiveness after recess incidents.' },
  { id: 'child-dana',   name: 'Dana Levi',       grade: 6, dob: '2013-07-22', username: 'dana',   is_sensitive: false, preferred_lang: 'he', notes: 'Anxiety around class presentations.' },
  { id: 'child-noa',    name: 'Noa Shapira',     grade: 4, dob: '2015-11-04', username: 'noa',    is_sensitive: false, preferred_lang: 'en', notes: 'New to the school this term.' },
  { id: 'child-ariel',  name: 'Ariel Mizrahi',   grade: 7, dob: '2012-05-18', username: 'ariel',  is_sensitive: false, preferred_lang: 'en', notes: '' },
  { id: 'child-tamar',  name: 'Tamar Ben-Ari',   grade: 3, dob: '2016-09-30', username: 'tamar',  is_sensitive: false, preferred_lang: 'he', notes: 'Occasional language slips.' },
  { id: 'child-daniel', name: 'Daniel Roth',     grade: 8, dob: '2011-01-14', username: 'daniel', is_sensitive: true,  preferred_lang: 'en', notes: 'Active treatment; weekly sessions.' },
  { id: 'child-maya',   name: 'Maya Friedman',   grade: 5, dob: '2014-08-08', username: 'maya',   is_sensitive: false, preferred_lang: 'en', notes: 'Recent change in mood; monitor.' },
  { id: 'child-itai',   name: 'Itai Goldberg',   grade: 6, dob: '2013-12-25', username: 'itai',   is_sensitive: false, preferred_lang: 'ru', notes: '' },
];

const baseChildren: Child[] = kidSeeds.map((s) => ({
  id: s.id,
  school_id: SCHOOL_ID,
  psychologist_id: COUNSELOR_ID,
  display_name: s.name,
  grade: s.grade,
  date_of_birth: s.dob,
  notes: s.notes,
  is_sensitive: s.is_sensitive,
  created_at: daysAgo(60),
  username: s.username,
  preferred_lang: s.preferred_lang,
  two_factor_enabled: false,
  two_factor_email: null,
}));

// Per-child rollup stats. Wired into ChildSummary below.
const childStats: Record<string, {
  unread_high: number; unread_medium: number; unread_low: number;
  total_high: number; total_medium: number; total_low: number;
  last_session_hours_ago: number | null; sessions_14d: number;
  risk_score: number; risk_reasons: string[];
}> = {
  'child-yoav':   { unread_high: 1, unread_medium: 0, unread_low: 0, total_high: 2, total_medium: 1, total_low: 0, last_session_hours_ago: 4,   sessions_14d: 5, risk_score: 78, risk_reasons: ['Recent high-priority bullying alert', 'Sentiment trending down 3 days'] },
  'child-dana':   { unread_high: 0, unread_medium: 0, unread_low: 0, total_high: 0, total_medium: 1, total_low: 1, last_session_hours_ago: 26,  sessions_14d: 4, risk_score: 32, risk_reasons: ['Steady progress', 'Anxiety stable'] },
  'child-noa':    { unread_high: 0, unread_medium: 0, unread_low: 0, total_high: 0, total_medium: 0, total_low: 0, last_session_hours_ago: 50,  sessions_14d: 3, risk_score: 12, risk_reasons: [] },
  'child-ariel':  { unread_high: 0, unread_medium: 0, unread_low: 1, total_high: 0, total_medium: 0, total_low: 2, last_session_hours_ago: 72,  sessions_14d: 2, risk_score: 18, risk_reasons: ['Minor language drift'] },
  'child-tamar':  { unread_high: 0, unread_medium: 0, unread_low: 0, total_high: 0, total_medium: 0, total_low: 1, last_session_hours_ago: 120, sessions_14d: 2, risk_score: 15, risk_reasons: [] },
  'child-daniel': { unread_high: 0, unread_medium: 0, unread_low: 0, total_high: 1, total_medium: 0, total_low: 0, last_session_hours_ago: 18,  sessions_14d: 6, risk_score: 65, risk_reasons: ['Self-harm ideation 3 days ago — resolved', 'Active treatment plan'] },
  'child-maya':   { unread_high: 0, unread_medium: 1, unread_low: 0, total_high: 0, total_medium: 2, total_low: 0, last_session_hours_ago: 22,  sessions_14d: 4, risk_score: 55, risk_reasons: ['Distress signals in helper chat', 'Mood change last 7 days'] },
  'child-itai':   { unread_high: 0, unread_medium: 0, unread_low: 0, total_high: 0, total_medium: 0, total_low: 0, last_session_hours_ago: 8,   sessions_14d: 3, risk_score: 22, risk_reasons: [] },
};

function summaryFor(c: Child): ChildSummary {
  const s = childStats[c.id];
  return {
    ...c,
    psychologist_name: 'Dr. Sarah Klein',
    unread_alerts: s.unread_high + s.unread_medium + s.unread_low,
    unread_high: s.unread_high,
    unread_medium: s.unread_medium,
    unread_low: s.unread_low,
    total_high: s.total_high,
    total_medium: s.total_medium,
    total_low: s.total_low,
    last_session_at: s.last_session_hours_ago === null ? null : hoursAgo(s.last_session_hours_ago),
    sessions_14d: s.sessions_14d,
    risk_score: s.risk_score,
    risk_reasons: s.risk_reasons,
  };
}

// ───────── sessions + transcripts ─────────
type Turn = { speaker: 'ai' | 'child'; text: string; offsetSec: number };

function makeSession(args: {
  id: string;
  child_id: string;
  scenario: ScenarioType;
  ai_character_name: string;
  startedHoursAgo: number;
  durationSec: number;
  success: boolean;
  transcript: Turn[];
  notes?: string;
}): Session {
  const startMs = NOW - args.startedHoursAgo * 3_600_000;
  return {
    id: args.id,
    child_id: args.child_id,
    scenario: args.scenario,
    started_at: iso(startMs),
    ended_at: iso(startMs + args.durationSec * 1000),
    duration_sec: args.durationSec,
    scenario_success: args.success,
    completed: true,
    metrics: {
      response_latency_avg_ms: 1200 + Math.floor(Math.random() * 1500),
      talk_time_ratio: 0.35 + Math.random() * 0.3,
      word_count: args.transcript.reduce((sum, t) => sum + t.text.split(/\s+/).length, 0),
      unique_words: 40 + Math.floor(Math.random() * 30),
      sentiment_score: args.success ? 0.3 + Math.random() * 0.4 : -0.4 + Math.random() * 0.4,
    },
    transcript: args.transcript.map((t) => ({
      speaker: t.speaker,
      text: t.text,
      ts: iso(startMs + t.offsetSec * 1000),
    })),
    ai_character_name: args.ai_character_name,
    notes: args.notes ?? '',
  };
}

const sessionsByChild: Record<string, Session[]> = {
  'child-yoav': [
    makeSession({
      id: 'sess-yoav-1', child_id: 'child-yoav', scenario: 'joining_group_conversation',
      ai_character_name: 'Maya', startedHoursAgo: 4, durationSec: 240, success: false,
      transcript: [
        { speaker: 'ai',    text: "Hey! We were just talking about the science fair. Want to join?", offsetSec: 0 },
        { speaker: 'child', text: "Um. I don't know.", offsetSec: 6 },
        { speaker: 'ai',    text: "What's your favorite part of science?", offsetSec: 11 },
        { speaker: 'child', text: "I don't really like it.", offsetSec: 17 },
        { speaker: 'ai',    text: "That's okay! What do you like?", offsetSec: 22 },
        { speaker: 'child', text: "I don't know. Forget it.", offsetSec: 28 },
      ],
      notes: 'Disengaged early — possibly tied to recess incident reported same morning.',
    }),
    makeSession({
      id: 'sess-yoav-2', child_id: 'child-yoav', scenario: 'asking_teacher_for_help',
      ai_character_name: 'Ms. Cohen', startedHoursAgo: 30, durationSec: 320, success: true,
      transcript: [
        { speaker: 'child', text: "Excuse me, can I ask you something?", offsetSec: 0 },
        { speaker: 'ai',    text: "Of course, Yoav. What's on your mind?", offsetSec: 4 },
        { speaker: 'child', text: "I don't understand the math homework.", offsetSec: 10 },
        { speaker: 'ai',    text: "Which part is tricky?", offsetSec: 14 },
        { speaker: 'child', text: "The fractions. I keep getting them wrong.", offsetSec: 19 },
        { speaker: 'ai',    text: "Let's look together after class. Sound good?", offsetSec: 25 },
        { speaker: 'child', text: "Yes, thank you.", offsetSec: 31 },
      ],
    }),
  ],
  'child-dana': [
    makeSession({
      id: 'sess-dana-1', child_id: 'child-dana', scenario: 'presenting_in_class',
      ai_character_name: 'Class', startedHoursAgo: 26, durationSec: 420, success: true,
      transcript: [
        { speaker: 'child', text: "Hi everyone. Today I want to talk about... about whales.", offsetSec: 0 },
        { speaker: 'ai',    text: "(Class listens attentively)", offsetSec: 8 },
        { speaker: 'child', text: "They are mammals, not fish. The blue whale is the biggest animal on Earth.", offsetSec: 14 },
        { speaker: 'ai',    text: "(A student raises their hand) How big exactly?", offsetSec: 24 },
        { speaker: 'child', text: "Up to thirty meters. That's longer than two buses!", offsetSec: 30 },
        { speaker: 'ai',    text: "(Class claps)", offsetSec: 38 },
      ],
      notes: 'Strong delivery. First time she made eye contact with the virtual class.',
    }),
  ],
  'child-maya': [
    makeSession({
      id: 'sess-maya-1', child_id: 'child-maya', scenario: 'handling_disagreement',
      ai_character_name: 'Liam', startedHoursAgo: 22, durationSec: 280, success: false,
      transcript: [
        { speaker: 'ai',    text: "I think we should do the project on space.", offsetSec: 0 },
        { speaker: 'child', text: "I wanted to do animals.", offsetSec: 5 },
        { speaker: 'ai',    text: "But space is way cooler!", offsetSec: 9 },
        { speaker: 'child', text: "Fine. Whatever. I don't care anymore.", offsetSec: 14 },
        { speaker: 'ai',    text: "Are you upset?", offsetSec: 19 },
        { speaker: 'child', text: "No. Just do what you want.", offsetSec: 23 },
      ],
      notes: 'Avoidance pattern — gave up rather than negotiating.',
    }),
  ],
  'child-daniel': [
    makeSession({
      id: 'sess-daniel-1', child_id: 'child-daniel', scenario: 'refusing_peer_pressure',
      ai_character_name: 'Jordan', startedHoursAgo: 18, durationSec: 360, success: true,
      transcript: [
        { speaker: 'ai',    text: "Everyone's going. You should come too.", offsetSec: 0 },
        { speaker: 'child', text: "I told my mom I'd be home by six.", offsetSec: 5 },
        { speaker: 'ai',    text: "She won't even know. Come on.", offsetSec: 10 },
        { speaker: 'child', text: "No. I'm not lying to her.", offsetSec: 15 },
        { speaker: 'ai',    text: "You're so boring lately.", offsetSec: 19 },
        { speaker: 'child', text: "Maybe. But I'm going home.", offsetSec: 23 },
      ],
      notes: 'Held his ground. Big improvement from last month.',
    }),
  ],
  'child-noa': [
    makeSession({
      id: 'sess-noa-1', child_id: 'child-noa', scenario: 'introducing_yourself',
      ai_character_name: 'New classmate', startedHoursAgo: 50, durationSec: 180, success: true,
      transcript: [
        { speaker: 'child', text: "Hi, I'm Noa. I just moved here.", offsetSec: 0 },
        { speaker: 'ai',    text: "Welcome! Where did you move from?", offsetSec: 4 },
        { speaker: 'child', text: "From Haifa. Do you like reading?", offsetSec: 9 },
        { speaker: 'ai',    text: "I love it! What's your favorite book?", offsetSec: 14 },
      ],
    }),
  ],
  'child-itai': [
    makeSession({
      id: 'sess-itai-1', child_id: 'child-itai', scenario: 'ordering_in_public',
      ai_character_name: 'Cashier', startedHoursAgo: 8, durationSec: 140, success: true,
      transcript: [
        { speaker: 'ai',    text: 'Здравствуй! Что будешь?', offsetSec: 0 },
        { speaker: 'child', text: 'Можно бутерброд и сок, пожалуйста.', offsetSec: 5 },
        { speaker: 'ai',    text: 'Какой сок?', offsetSec: 9 },
        { speaker: 'child', text: 'Яблочный, спасибо.', offsetSec: 12 },
      ],
    }),
  ],
  'child-ariel': [], 'child-tamar': [],
};

// ───────── alerts ─────────
const alertsList: Array<Alert & { child_name: string }> = [
  {
    id: 'alert-yoav-bully', child_id: 'child-yoav', session_id: 'sess-yoav-1',
    priority: 'high', type: 'bullying',
    excerpt: 'they keep pushing me at recess and no one helps',
    context: 'Helper chat — Yoav described repeated physical incidents at recess. Mentioned three classmates by name.',
    created_at: hoursAgo(3),
    acknowledged_at: null, acknowledged_by: null,
    action_taken: null, action_note: null,
    child_name: 'Yoav Cohen',
  },
  {
    id: 'alert-maya-distress', child_id: 'child-maya', session_id: null,
    priority: 'medium', type: 'emotional_distress',
    excerpt: 'i just feel sad all the time and nothing helps',
    context: "Helper chat — Maya raised low mood over two consecutive evenings. No active risk language.",
    created_at: hoursAgo(20),
    acknowledged_at: null, acknowledged_by: null,
    action_taken: null, action_note: null,
    child_name: 'Maya Friedman',
  },
  {
    id: 'alert-daniel-self', child_id: 'child-daniel', session_id: null,
    priority: 'high', type: 'self_harm',
    excerpt: 'sometimes i just want to disappear',
    context: 'Helper chat — flagged by adaptive safety filter (paraphrase of clinician-labeled phrase from prior session).',
    created_at: daysAgo(3),
    acknowledged_at: daysAgo(3),
    acknowledged_by: COUNSELOR_ID,
    action_taken: 'contacted_parent',
    action_note: 'Called Ronit same evening. Scheduled emergency session next morning. Safety plan in place.',
    child_name: 'Daniel Roth',
  },
  {
    id: 'alert-tamar-lang', child_id: 'child-tamar', session_id: null,
    priority: 'low', type: 'unusual_language',
    excerpt: 'mild profanity in helper chat (one incident)',
    context: 'Adaptive filter — single occurrence; consistent with age-typical testing.',
    created_at: daysAgo(5),
    acknowledged_at: daysAgo(5),
    acknowledged_by: COUNSELOR_ID,
    action_taken: 'no_action_needed',
    action_note: 'Discussed in routine session. No further intervention.',
    child_name: 'Tamar Ben-Ari',
  },
];

// ───────── progress points (14 days per child) ─────────
function buildProgress(childId: string): ProgressPoint[] {
  // Seed each child's curve deterministically off the id length so charts are stable across reloads.
  const seed = childId.length;
  const points: ProgressPoint[] = [];
  for (let d = 13; d >= 0; d--) {
    const t = (13 - d) / 13;
    const base = (seed * 13 + d * 7) % 100;
    points.push({
      date: daysAgo(d).slice(0, 10),
      response_latency_avg_ms: 2500 - t * 800 + (base % 200),
      talk_time_ratio: 0.3 + t * 0.25 + (base % 10) / 100,
      scenario_success_rate: Math.min(0.9, 0.4 + t * 0.4 + (base % 8) / 100),
      sentiment_score: -0.2 + t * 0.5 + (base % 12) / 100,
    });
  }
  return points;
}

// ───────── risk snapshots (14 days per child) ─────────
function buildRiskHistory(childId: string): RiskSnapshotPoint[] {
  const targetRisk = childStats[childId]?.risk_score ?? 20;
  const points: RiskSnapshotPoint[] = [];
  for (let d = 13; d >= 0; d--) {
    const t = (13 - d) / 13;
    const noise = ((d * 11) % 7) - 3;
    points.push({
      date: daysAgo(d).slice(0, 10),
      risk_score: Math.max(0, Math.round(targetRisk * t + noise)),
      unread_high: d < 3 && targetRisk > 60 ? 1 : 0,
      unread_medium: d < 5 && targetRisk > 40 ? 1 : 0,
      unread_low: 0,
      sentiment_avg: -0.1 + t * 0.3 + (noise / 30),
    });
  }
  return points;
}

// ───────── scenario breakdown per child ─────────
function buildScenarioBreakdown(childId: string): ScenarioBreakdown[] {
  const sessions = sessionsByChild[childId] ?? [];
  const byScenario = new Map<ScenarioType, { attempts: number; successes: number }>();
  for (const s of sessions) {
    const r = byScenario.get(s.scenario) ?? { attempts: 0, successes: 0 };
    r.attempts += 1;
    if (s.scenario_success) r.successes += 1;
    byScenario.set(s.scenario, r);
  }
  return Array.from(byScenario.entries()).map(([scenario, r]) => ({
    scenario, attempts: r.attempts, successes: r.successes,
    success_rate: r.attempts === 0 ? 0 : r.successes / r.attempts,
  }));
}

// ───────── helper chats (the kid ↔ helper companion app) ─────────
const helperChatsByChild: Record<string, HelperChatLog> = {
  'child-yoav': {
    child_name: 'Yoav Cohen',
    sessions: [
      {
        started_at: hoursAgo(3.5),
        ended_at: hoursAgo(3.3),
        flags: { severity: 'high', categories: ['bullying'] },
        messages: [
          { id: 'hm-y-1', role: 'child',  content: 'they keep pushing me at recess and no one helps', flags: { severity: 'high', categories: ['bullying'], phrases: ['keep pushing me at recess'] }, created_at: hoursAgo(3.5) },
          { id: 'hm-y-2', role: 'helper', content: "I'm really sorry that's happening. It's not okay. Have you been able to tell anyone at school?", flags: null, created_at: hoursAgo(3.49) },
          { id: 'hm-y-3', role: 'child',  content: "i don't want to be a snitch", flags: null, created_at: hoursAgo(3.48) },
          { id: 'hm-y-4', role: 'helper', content: 'Telling a trusted adult is asking for help, not snitching. Want to talk through who you could tell?', flags: null, created_at: hoursAgo(3.47) },
        ],
      },
    ],
  },
  'child-maya': {
    child_name: 'Maya Friedman',
    sessions: [
      {
        started_at: hoursAgo(21),
        ended_at: hoursAgo(20.7),
        flags: { severity: 'medium', categories: ['distress'] },
        messages: [
          { id: 'hm-m-1', role: 'child',  content: 'i just feel sad all the time and nothing helps', flags: { severity: 'medium', categories: ['distress'], phrases: ['feel sad all the time'] }, created_at: hoursAgo(21) },
          { id: 'hm-m-2', role: 'helper', content: "That sounds really heavy. Has it been like this for a few days, or longer?", flags: null, created_at: hoursAgo(20.99) },
          { id: 'hm-m-3', role: 'child',  content: 'about a week i think', flags: null, created_at: hoursAgo(20.98) },
          { id: 'hm-m-4', role: 'helper', content: "Thank you for telling me. It really helps to share that. I think Dr. Klein should know too — would that be okay?", flags: null, created_at: hoursAgo(20.97) },
          { id: 'hm-m-5', role: 'child',  content: 'i guess', flags: null, created_at: hoursAgo(20.96) },
        ],
      },
    ],
  },
};

// ───────── missions ─────────
const missionsByChild: Record<string, ChildMissionWithMeta[]> = {
  'child-yoav': [
    {
      id: 'mis-y-1', title: 'Talk to one new classmate at lunch',
      description: 'Pick someone you usually don\'t sit with. Ask them one thing about their weekend.',
      source_scenario: 'joining_group_conversation', difficulty: 'medium', xp: 20,
      assigned_at: daysAgo(2), due_date: daysAgo(-3), completed_at: null,
      child_reflection: null,
      assigned_by: COUNSELOR_ID, assigned_by_name: 'Dr. Sarah Klein',
      source: 'psychologist', private_from_parents: false,
    },
    {
      id: 'mis-y-2', title: 'Tell a teacher when something feels unfair',
      description: 'If something happens at recess that bothers you, tell Mr. Cohen the same day.',
      source_scenario: 'asking_teacher_for_help', difficulty: 'hard', xp: 30,
      assigned_at: daysAgo(5), due_date: null, completed_at: daysAgo(1),
      child_reflection: 'I told him about the pushing thing. He said he\'d watch out.',
      assigned_by: COUNSELOR_ID, assigned_by_name: 'Dr. Sarah Klein',
      source: 'psychologist', private_from_parents: false,
    },
  ],
  'child-daniel': [
    {
      id: 'mis-d-1', title: 'Daily mood check-in',
      description: 'Open the app once a day and tell the helper how you\'re feeling, even if it\'s just one word.',
      source_scenario: null, difficulty: 'easy', xp: 10,
      assigned_at: daysAgo(7), due_date: null, completed_at: null,
      child_reflection: null,
      assigned_by: COUNSELOR_ID, assigned_by_name: 'Dr. Sarah Klein',
      source: 'psychologist', private_from_parents: true,
    },
  ],
};

// ───────── mission requests (parents/teachers asking for missions) ─────────
const missionRequestsByChild: Record<string, MissionRequest[]> = {
  'child-yoav': [
    {
      id: 'mreq-y-1', child_id: 'child-yoav', child_name: 'Yoav Cohen',
      parent_id: PARENT1_ID, parent_name: "Sarah (Yoav's mother)",
      title: 'Practice asking for help at home too',
      description: 'I\'d like a mission encouraging him to ask me when he\'s stuck on homework, not just at school.',
      difficulty: 'easy', xp: 15, status: 'pending',
      psych_note: null, decided_by: null, decided_by_name: null, decided_at: null,
      resulting_mission_id: null, created_at: hoursAgo(8), requester_role: 'parent',
    },
  ],
  'child-maya': [
    {
      id: 'mreq-m-1', child_id: 'child-maya', child_name: 'Maya Friedman',
      parent_id: TEACHER1_ID, parent_name: 'Mr. David Cohen',
      title: 'One positive thing per day',
      description: 'Have her note one good thing each day in the app. Trying to break the negative loop.',
      difficulty: 'easy', xp: 15, status: 'approved',
      psych_note: 'Good idea — aligns with current treatment.',
      decided_by: COUNSELOR_ID, decided_by_name: 'Dr. Sarah Klein', decided_at: daysAgo(1),
      resulting_mission_id: 'mis-m-1', created_at: daysAgo(2), requester_role: 'teacher',
    },
  ],
};

// ───────── scenario queue (kid's next VR scenarios) ─────────
const scenarioQueueByChild: Record<string, ScenarioQueueItem[]> = {
  'child-yoav': [
    {
      id: 'sq-y-1', child_id: 'child-yoav', scenario: 'handling_disagreement',
      assigned_by: COUNSELOR_ID, assigned_by_name: 'Dr. Sarah Klein',
      assigned_at: hoursAgo(2), consumed_at: null,
      notes: 'Focus on staying engaged when the other side pushes back.',
    },
  ],
};

const scenarioRequestsByChild: Record<string, ScenarioQueueRequest[]> = {
  'child-dana': [
    {
      id: 'sreq-d-1', child_id: 'child-dana', child_name: 'Dana Levi',
      requester_id: TEACHER2_ID, requester_name: 'Ms. Rachel Adler', requester_role: 'teacher',
      scenario: 'presenting_in_class', notes: 'She has a real presentation next Monday — please queue this for her.',
      status: 'pending',
      decided_by: null, decided_by_name: null, decided_at: null, decision_note: null,
      resulting_queue_id: null, created_at: hoursAgo(5),
    },
  ],
};

// ───────── parent contacts ─────────
const contactsByChild: Record<string, ParentContact[]> = {
  'child-daniel': [
    {
      id: 'pc-d-1', child_id: 'child-daniel',
      logged_by: COUNSELOR_ID, logged_by_name: 'Dr. Sarah Klein',
      contacted_at: daysAgo(3), method: 'phone',
      person: "Ronit (Daniel's mother)",
      topic: 'Self-harm ideation flagged in helper chat',
      outcome: 'Mother aware, on her way home. Emergency session next morning agreed.',
      notes: 'Safety plan reviewed. Removed access to sharp objects per protocol.',
      created_at: daysAgo(3),
    },
  ],
  'child-yoav': [
    {
      id: 'pc-y-1', child_id: 'child-yoav',
      logged_by: COUNSELOR_ID, logged_by_name: 'Dr. Sarah Klein',
      contacted_at: hoursAgo(2.5), method: 'phone',
      person: "Sarah (Yoav's mother)",
      topic: 'Bullying alert at recess',
      outcome: 'Mother informed. Coordinating with vice principal tomorrow morning.',
      notes: '',
      created_at: hoursAgo(2.5),
    },
  ],
};

// ───────── companion activity per child ─────────
function buildCompanionActivity(childId: string): CompanionActivitySummary {
  const completed = (missionsByChild[childId] ?? []).filter((m) => m.completed_at);
  const open = (missionsByChild[childId] ?? []).filter((m) => !m.completed_at);
  const helperMsgs = (helperChatsByChild[childId]?.sessions ?? []).flatMap((s) => s.messages);
  return {
    last_login_at: hoursAgo(childId === 'child-yoav' ? 3 : 12),
    total_logins: 14,
    missions_completed: completed.length,
    missions_open: open.length,
    helper_messages_30d: helperMsgs.length,
    recent_completed_missions: completed.slice(0, 3).map((m) => ({
      id: m.id, title: m.title, completed_at: m.completed_at!,
      child_reflection: m.child_reflection, xp: m.xp,
    })),
    recent_helper_messages: helperMsgs.slice(-4).map((m) => ({
      id: m.id, role: m.role, content: m.content, created_at: m.created_at,
    })),
    recent_events: [],
  };
}

// ───────── audit entries ─────────
const auditEntries: AuditEntry[] = [
  { id: 'aud-1', user_id: COUNSELOR_ID, user_name: 'Dr. Sarah Klein', action: 'alert_acknowledged', resource_type: 'alert', resource_id: 'alert-daniel-self', child_id: 'child-daniel', metadata: { action_taken: 'contacted_parent' }, ip: '10.0.0.1', user_agent: 'Mozilla/5.0', created_at: daysAgo(3) },
  { id: 'aud-2', user_id: COUNSELOR_ID, user_name: 'Dr. Sarah Klein', action: 'login_success', resource_type: 'auth', resource_id: COUNSELOR_ID, child_id: null, metadata: null, ip: '10.0.0.1', user_agent: 'Mozilla/5.0', created_at: hoursAgo(1) },
  { id: 'aud-3', user_id: COUNSELOR_ID, user_name: 'Dr. Sarah Klein', action: 'mission_created', resource_type: 'mission', resource_id: 'mis-y-1', child_id: 'child-yoav', metadata: { title: 'Talk to one new classmate at lunch' }, ip: '10.0.0.1', user_agent: 'Mozilla/5.0', created_at: daysAgo(2) },
  { id: 'aud-4', user_id: TEACHER1_ID, user_name: 'Mr. David Cohen', action: 'mission_request_submitted', resource_type: 'mission_request', resource_id: 'mreq-m-1', child_id: 'child-maya', metadata: null, ip: '10.0.0.2', user_agent: 'Mozilla/5.0', created_at: daysAgo(2) },
  { id: 'aud-5', user_id: ADMIN_ID, user_name: 'Vlad Fridman', action: 'user_2fa_enabled', resource_type: 'user', resource_id: COUNSELOR_ID, child_id: null, metadata: null, ip: '10.0.0.3', user_agent: 'Mozilla/5.0', created_at: daysAgo(10) },
  { id: 'aud-6', user_id: COUNSELOR_ID, user_name: 'Dr. Sarah Klein', action: 'parent_contact_logged', resource_type: 'parent_contact', resource_id: 'pc-y-1', child_id: 'child-yoav', metadata: { method: 'phone' }, ip: '10.0.0.1', user_agent: 'Mozilla/5.0', created_at: hoursAgo(2.5) },
];

// ───────── permission requests (teacher → admin) ─────────
type PermReqStatus = 'pending' | 'approved' | 'denied';
type PermReqScope = 'helper_chats' | 'alerts' | 'sessions' | 'missions' | 'full';
interface PermReq {
  id: string; teacher_id: string; teacher_name: string;
  child_id: string; child_name: string;
  scope: PermReqScope; reason: string;
  status: PermReqStatus;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_note: string | null;
}

const permissionRequests: PermReq[] = [
  {
    id: 'pr-1', teacher_id: TEACHER1_ID, teacher_name: 'Mr. David Cohen',
    child_id: 'child-yoav', child_name: 'Yoav Cohen',
    scope: 'helper_chats', reason: 'I want to follow up on the recess situation more closely.',
    status: 'pending',
    requested_at: hoursAgo(6),
    resolved_at: null, resolved_by: null, resolved_by_name: null, resolved_note: null,
  },
  {
    id: 'pr-2', teacher_id: TEACHER2_ID, teacher_name: 'Ms. Rachel Adler',
    child_id: 'child-dana', child_name: 'Dana Levi',
    scope: 'sessions', reason: 'Need context on her presentation practice.',
    status: 'approved',
    requested_at: daysAgo(3),
    resolved_at: daysAgo(2), resolved_by: COUNSELOR_ID, resolved_by_name: 'Dr. Sarah Klein',
    resolved_note: 'Approved for the duration of this term.',
  },
];

// ───────── child↔user links (admin panel) ─────────
const childParents: Record<string, string[]> = {
  'child-yoav': [PARENT1_ID], 'child-dana': [PARENT2_ID],
  'child-maya': [PARENT3_ID], 'child-daniel': [PARENT4_ID],
};
const childTeachers: Record<string, string[]> = {
  'child-yoav': [TEACHER1_ID], 'child-dana': [TEACHER2_ID],
  'child-maya': [TEACHER1_ID], 'child-noa': [TEACHER1_ID],
};
const childPsychs: Record<string, string[]> = Object.fromEntries(
  kidSeeds.map((k) => [k.id, [COUNSELOR_ID]]),
);

// ───────── mutable state ─────────
// Anything that pages can change at runtime lives here. Pages re-render off api responses,
// so updating these objects + returning them is enough to make the UI feel real.
export const mockState = {
  users: [...allUsers],
  children: [...baseChildren],
  alerts: [...alertsList],
  sessions: { ...sessionsByChild },
  missions: { ...missionsByChild },
  missionRequests: { ...missionRequestsByChild },
  scenarioQueue: { ...scenarioQueueByChild },
  scenarioRequests: { ...scenarioRequestsByChild },
  contacts: { ...contactsByChild },
  helperChats: { ...helperChatsByChild },
  audit: [...auditEntries],
  permissionRequests: [...permissionRequests],
  childParents: { ...childParents },
  childTeachers: { ...childTeachers },
  childPsychs: { ...childPsychs },
};

// ───────── derivation helpers (used by api.ts) ─────────
export const getChildSummaries = (): ChildSummary[] =>
  mockState.children.map(summaryFor);

export const getChildById = (id: string): (Child & { psychologist_name: string }) | null => {
  const c = mockState.children.find((c) => c.id === id);
  if (!c) return null;
  return { ...c, psychologist_name: 'Dr. Sarah Klein' };
};

export const getSessions = (childId: string): Session[] =>
  mockState.sessions[childId] ?? [];

export const getProgress = (childId: string): ProgressPoint[] =>
  buildProgress(childId);

export const getRiskHistory = (childId: string): RiskSnapshotPoint[] =>
  buildRiskHistory(childId);

export const getScenarioBreakdown = (childId: string): ScenarioBreakdown[] =>
  buildScenarioBreakdown(childId);

export const getChildAlerts = (childId: string): Alert[] =>
  mockState.alerts
    .filter((a) => a.child_id === childId)
    .map(({ child_name: _ignored, ...rest }) => rest);

export const getAllAlerts = (onlyUnack: boolean): Array<Alert & { child_name: string }> =>
  mockState.alerts.filter((a) => !onlyUnack || a.acknowledged_at === null);

export const getCompanionActivity = (childId: string): CompanionActivitySummary =>
  buildCompanionActivity(childId);

export const getHelperChats = (childId: string): HelperChatLog =>
  mockState.helperChats[childId] ?? { child_name: getChildById(childId)?.display_name ?? '', sessions: [] };

export const getMissions = (childId: string): ChildMissionWithMeta[] =>
  mockState.missions[childId] ?? [];

export const getMissionRequests = (childId: string): MissionRequest[] =>
  mockState.missionRequests[childId] ?? [];

export const getScenarioQueue = (childId: string): ScenarioQueueItem[] =>
  mockState.scenarioQueue[childId] ?? [];

export const getScenarioRequests = (childId: string): ScenarioQueueRequest[] =>
  mockState.scenarioRequests[childId] ?? [];

export const getContacts = (childId: string): ParentContact[] =>
  mockState.contacts[childId] ?? [];

export const getAudit = (opts: { mine?: boolean; child_id?: string; limit?: number }): AuditEntry[] => {
  let xs = mockState.audit;
  if (opts.child_id) xs = xs.filter((a) => a.child_id === opts.child_id);
  return xs.slice(0, opts.limit ?? 200);
};

export const getPriorityDistribution = () =>
  mockState.children.map((c) => {
    const s = childStats[c.id];
    return {
      child_id: c.id,
      child_name: c.display_name,
      grade: c.grade,
      unread_high: s.unread_high,
      unread_medium: s.unread_medium,
      unread_low: s.unread_low,
      total_high: s.total_high,
      total_medium: s.total_medium,
      total_low: s.total_low,
      total_alerts: s.total_high + s.total_medium + s.total_low,
    };
  });

// ───────── mutations ─────────
export function ackAlert(id: string, body: { action_taken?: EscalationAction; action_note?: string }) {
  const a = mockState.alerts.find((a) => a.id === id);
  if (!a) return;
  a.acknowledged_at = new Date().toISOString();
  a.acknowledged_by = COUNSELOR_ID;
  a.action_taken = body.action_taken ?? null;
  a.action_note = body.action_note ?? null;
  pushAudit({ action: 'alert_acknowledged', resource_type: 'alert', resource_id: id, child_id: a.child_id });
}

export function setSensitivity(childId: string, is_sensitive: boolean) {
  const c = mockState.children.find((c) => c.id === childId);
  if (c) c.is_sensitive = is_sensitive;
}

export function updateSessionNotes(childId: string, sessionId: string, notes: string) {
  const s = mockState.sessions[childId]?.find((s) => s.id === sessionId);
  if (s) s.notes = notes;
}

export function addMission(childId: string, body: { title: string; description: string; difficulty: MissionDifficulty; xp: number; due_date?: string | null }) {
  const id = `mis-${childId}-${Date.now()}`;
  const list = mockState.missions[childId] ?? (mockState.missions[childId] = []);
  list.unshift({
    id, title: body.title, description: body.description,
    source_scenario: null, difficulty: body.difficulty, xp: body.xp,
    assigned_at: new Date().toISOString(), due_date: body.due_date ?? null,
    completed_at: null, child_reflection: null,
    assigned_by: COUNSELOR_ID, assigned_by_name: 'Dr. Sarah Klein',
    source: 'psychologist', private_from_parents: false,
  });
  pushAudit({ action: 'mission_created', resource_type: 'mission', resource_id: id, child_id: childId, metadata: { title: body.title } });
  return id;
}

export function deleteMission(childId: string, missionId: string) {
  const list = mockState.missions[childId];
  if (!list) return;
  mockState.missions[childId] = list.filter((m) => m.id !== missionId);
}

export function addContact(childId: string, body: { contacted_at: string; method: ContactMethod; person: string; topic: string; outcome?: string; notes?: string }) {
  const id = `pc-${childId}-${Date.now()}`;
  const list = mockState.contacts[childId] ?? (mockState.contacts[childId] = []);
  list.unshift({
    id, child_id: childId,
    logged_by: COUNSELOR_ID, logged_by_name: 'Dr. Sarah Klein',
    contacted_at: body.contacted_at, method: body.method,
    person: body.person, topic: body.topic,
    outcome: body.outcome ?? '', notes: body.notes ?? '',
    created_at: new Date().toISOString(),
  });
  return id;
}

export function removeContact(childId: string, contactId: string) {
  const list = mockState.contacts[childId];
  if (!list) return;
  mockState.contacts[childId] = list.filter((c) => c.id !== contactId);
}

export function addQueueItem(childId: string, scenario: ScenarioType, notes?: string) {
  const id = `sq-${childId}-${Date.now()}`;
  const list = mockState.scenarioQueue[childId] ?? (mockState.scenarioQueue[childId] = []);
  list.unshift({
    id, child_id: childId, scenario,
    assigned_by: COUNSELOR_ID, assigned_by_name: 'Dr. Sarah Klein',
    assigned_at: new Date().toISOString(), consumed_at: null,
    notes: notes ?? '',
  });
  return id;
}

export function removeQueueItem(childId: string, itemId: string) {
  const list = mockState.scenarioQueue[childId];
  if (!list) return;
  mockState.scenarioQueue[childId] = list.filter((i) => i.id !== itemId);
}

export function pushAudit(e: { action: string; resource_type: string; resource_id: string | null; child_id?: string | null; metadata?: Record<string, unknown> | null }) {
  mockState.audit.unshift({
    id: `aud-${Date.now()}`,
    user_id: COUNSELOR_ID, user_name: 'Dr. Sarah Klein',
    action: e.action, resource_type: e.resource_type, resource_id: e.resource_id,
    child_id: e.child_id ?? null, metadata: e.metadata ?? null,
    ip: null, user_agent: null,
    created_at: new Date().toISOString(),
  });
}

// ───────── auth ─────────
export function loginWithDemoCreds(email: string, password: string): { token: string; user: AuthUser; expires_in: number } | 'invalid' {
  const acct = DEMO_ACCOUNTS[email.toLowerCase()];
  if (!acct || password !== acct.password) return 'invalid';
  return { token: `demo-${acct.user.role}-${acct.user.id}`, user: acct.user, expires_in: 28_800 };
}

export function userFromToken(token: string): AuthUser | null {
  for (const acct of Object.values(DEMO_ACCOUNTS)) {
    if (token.startsWith(`demo-${acct.user.role}-${acct.user.id}`)) return acct.user;
  }
  return null;
}

// ───────── admin user CRUD (light) ─────────
export function findUser(id: string): AdminUserRow | undefined {
  return mockState.users.find((u) => u.id === id);
}
export function listUsers(role?: Role): AdminUserRow[] {
  // Decorate linked_child_* per role for the admin panel.
  return mockState.users
    .filter((u) => !role || u.role === role)
    .map((u) => {
      let linkedIds: string[] = [];
      if (u.role === 'parent') linkedIds = Object.entries(mockState.childParents).filter(([, ps]) => ps.includes(u.id)).map(([cid]) => cid);
      else if (u.role === 'teacher') linkedIds = Object.entries(mockState.childTeachers).filter(([, ts]) => ts.includes(u.id)).map(([cid]) => cid);
      else if (u.role === 'psychologist') linkedIds = Object.entries(mockState.childPsychs).filter(([, ps]) => ps.includes(u.id)).map(([cid]) => cid);
      const linkedNames = linkedIds.map((cid) => mockState.children.find((c) => c.id === cid)?.display_name ?? '').filter(Boolean);
      return { ...u, linked_child_ids: linkedIds, linked_child_names: linkedNames };
    });
}

export function createUser(body: { email: string; name: string; role: Role; password: string; phone?: string; child_ids?: string[] }): string {
  const id = `user-${Date.now()}`;
  mockState.users.push({
    id, school_id: SCHOOL_ID,
    email: body.email, name: body.name, role: body.role,
    phone: body.phone ?? null, created_at: new Date().toISOString(),
    linked_child_ids: body.child_ids ?? [], linked_child_names: [],
    two_factor_enabled: false, two_factor_email: null,
  });
  if (body.child_ids) {
    for (const cid of body.child_ids) {
      if (body.role === 'parent') (mockState.childParents[cid] ??= []).push(id);
      if (body.role === 'teacher') (mockState.childTeachers[cid] ??= []).push(id);
      if (body.role === 'psychologist') (mockState.childPsychs[cid] ??= []).push(id);
    }
  }
  return id;
}

export function deleteUser(id: string) {
  mockState.users = mockState.users.filter((u) => u.id !== id);
  for (const map of [mockState.childParents, mockState.childTeachers, mockState.childPsychs]) {
    for (const cid of Object.keys(map)) map[cid] = map[cid].filter((x) => x !== id);
  }
}

export function updateUser(id: string, body: { name?: string; email?: string; phone?: string | null; password?: string }) {
  const u = mockState.users.find((u) => u.id === id);
  if (!u) return;
  if (body.name !== undefined) u.name = body.name;
  if (body.email !== undefined) u.email = body.email;
  if (body.phone !== undefined) u.phone = body.phone;
}

export function setUserTwoFactor(id: string, enabled: boolean, email: string | null) {
  const u = mockState.users.find((u) => u.id === id);
  if (!u) return;
  u.two_factor_enabled = enabled;
  u.two_factor_email = email;
}

export function createChild(body: { display_name: string; grade: number; date_of_birth: string; username: string; psychologist_id: string; preferred_lang?: 'en' | 'he' | 'ru'; notes?: string }): { id: string; username: string } {
  const id = `child-${Date.now()}`;
  mockState.children.push({
    id, school_id: SCHOOL_ID,
    psychologist_id: body.psychologist_id,
    display_name: body.display_name,
    grade: body.grade,
    date_of_birth: body.date_of_birth,
    notes: body.notes ?? '',
    is_sensitive: false,
    created_at: new Date().toISOString(),
    username: body.username, preferred_lang: body.preferred_lang ?? 'en',
    two_factor_enabled: false, two_factor_email: null,
  });
  childStats[id] = { unread_high: 0, unread_medium: 0, unread_low: 0, total_high: 0, total_medium: 0, total_low: 0, last_session_hours_ago: null, sessions_14d: 0, risk_score: 10, risk_reasons: [] };
  mockState.childPsychs[id] = [body.psychologist_id];
  return { id, username: body.username };
}

export function deleteChild(id: string) {
  mockState.children = mockState.children.filter((c) => c.id !== id);
  delete mockState.sessions[id];
  delete mockState.missions[id];
  delete mockState.helperChats[id];
  delete mockState.contacts[id];
  delete mockState.scenarioQueue[id];
  delete mockState.scenarioRequests[id];
  delete mockState.missionRequests[id];
  delete mockState.childParents[id];
  delete mockState.childTeachers[id];
  delete mockState.childPsychs[id];
  mockState.alerts = mockState.alerts.filter((a) => a.child_id !== id);
}

export function listChildLinks(childId: string, kind: 'parents' | 'teachers' | 'psychologists') {
  const map = kind === 'parents' ? mockState.childParents : kind === 'teachers' ? mockState.childTeachers : mockState.childPsychs;
  const ids = map[childId] ?? [];
  return ids
    .map((id) => mockState.users.find((u) => u.id === id))
    .filter((u): u is AdminUserRow => !!u)
    .map((u, i) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, is_primary: i === 0 ? 1 : 0 }));
}

export function linkChildUser(childId: string, userId: string, kind: 'parents' | 'teachers' | 'psychologists') {
  const map = kind === 'parents' ? mockState.childParents : kind === 'teachers' ? mockState.childTeachers : mockState.childPsychs;
  (map[childId] ??= []).push(userId);
}

export function unlinkChildUser(childId: string, userId: string, kind: 'parents' | 'teachers' | 'psychologists') {
  const map = kind === 'parents' ? mockState.childParents : kind === 'teachers' ? mockState.childTeachers : mockState.childPsychs;
  if (map[childId]) map[childId] = map[childId].filter((x) => x !== userId);
}

export function listPermissionRequests(status?: 'pending' | 'approved' | 'denied') {
  return mockState.permissionRequests.filter((r) => !status || r.status === status);
}

export function resolvePermissionRequest(id: string, status: 'approved' | 'denied', note?: string) {
  const r = mockState.permissionRequests.find((r) => r.id === id);
  if (!r) return;
  r.status = status;
  r.resolved_at = new Date().toISOString();
  r.resolved_by = COUNSELOR_ID;
  r.resolved_by_name = 'Dr. Sarah Klein';
  r.resolved_note = note ?? null;
}

export function submitMissionRequest(childId: string, body: { title: string; description: string; difficulty?: MissionDifficulty; xp?: number }) {
  const id = `mreq-${Date.now()}`;
  const list = mockState.missionRequests[childId] ?? (mockState.missionRequests[childId] = []);
  const child = mockState.children.find((c) => c.id === childId);
  list.unshift({
    id, child_id: childId, child_name: child?.display_name ?? '',
    parent_id: PARENT1_ID, parent_name: 'Demo Parent',
    title: body.title, description: body.description,
    difficulty: body.difficulty ?? 'medium', xp: body.xp ?? 15,
    status: 'pending',
    psych_note: null, decided_by: null, decided_by_name: null, decided_at: null,
    resulting_mission_id: null, created_at: new Date().toISOString(),
    requester_role: 'parent',
  });
  return id;
}

export function decideMissionRequest(childId: string, reqId: string, approve: boolean, note?: string) {
  const r = mockState.missionRequests[childId]?.find((r) => r.id === reqId);
  if (!r) return null;
  r.status = approve ? 'approved' : 'rejected';
  r.psych_note = note ?? null;
  r.decided_at = new Date().toISOString();
  r.decided_by = COUNSELOR_ID;
  r.decided_by_name = 'Dr. Sarah Klein';
  if (approve) {
    const mid = addMission(childId, { title: r.title, description: r.description, difficulty: r.difficulty, xp: r.xp });
    r.resulting_mission_id = mid;
    return mid;
  }
  return null;
}

export function submitScenarioRequest(childId: string, scenario: ScenarioType, notes?: string) {
  const id = `sreq-${Date.now()}`;
  const list = mockState.scenarioRequests[childId] ?? (mockState.scenarioRequests[childId] = []);
  const child = mockState.children.find((c) => c.id === childId);
  list.unshift({
    id, child_id: childId, child_name: child?.display_name ?? '',
    requester_id: TEACHER1_ID, requester_name: 'Demo Teacher', requester_role: 'teacher',
    scenario, notes: notes ?? '', status: 'pending',
    decided_by: null, decided_by_name: null, decided_at: null, decision_note: null,
    resulting_queue_id: null, created_at: new Date().toISOString(),
  });
  return id;
}

export function decideScenarioRequest(childId: string, reqId: string, approve: boolean, note?: string) {
  const r = mockState.scenarioRequests[childId]?.find((r) => r.id === reqId);
  if (!r) return null;
  r.status = approve ? 'approved' : 'rejected';
  r.decision_note = note ?? null;
  r.decided_at = new Date().toISOString();
  r.decided_by = COUNSELOR_ID;
  r.decided_by_name = 'Dr. Sarah Klein';
  if (approve) {
    const qid = addQueueItem(childId, r.scenario, r.notes);
    r.resulting_queue_id = qid;
    return qid;
  }
  return null;
}

export function guardiansFor(childId: string) {
  const out: Array<{ id: string; name: string; email: string; phone: string | null; rel: 'parent' | 'psychologist' | 'teacher' }> = [];
  for (const pid of mockState.childParents[childId] ?? []) {
    const u = mockState.users.find((u) => u.id === pid);
    if (u) out.push({ id: u.id, name: u.name, email: u.email, phone: u.phone, rel: 'parent' });
  }
  for (const tid of mockState.childTeachers[childId] ?? []) {
    const u = mockState.users.find((u) => u.id === tid);
    if (u) out.push({ id: u.id, name: u.name, email: u.email, phone: u.phone, rel: 'teacher' });
  }
  for (const pid of mockState.childPsychs[childId] ?? []) {
    const u = mockState.users.find((u) => u.id === pid);
    if (u) out.push({ id: u.id, name: u.name, email: u.email, phone: u.phone, rel: 'psychologist' });
  }
  return out;
}
