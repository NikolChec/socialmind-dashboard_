import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AlertType, ScenarioType, Speaker, TranscriptLine } from '@socialmind/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'socialmind.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
    email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('school_admin','psychologist','parent')),
    password_hash TEXT NOT NULL, phone TEXT, fcm_token TEXT,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    last_failed_login TEXT, locked_until TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS children (
    id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
    psychologist_id TEXT NOT NULL REFERENCES users(id),
    display_name TEXT NOT NULL, grade INTEGER NOT NULL,
    date_of_birth TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
    is_sensitive INTEGER NOT NULL DEFAULT 0,
    username TEXT, password_hash TEXT,
    preferred_lang TEXT NOT NULL DEFAULT 'en',
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_children_username ON children(username) WHERE username IS NOT NULL;
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id),
    scenario TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT NOT NULL,
    duration_sec INTEGER NOT NULL, scenario_success INTEGER NOT NULL, completed INTEGER NOT NULL,
    metrics_json TEXT NOT NULL, transcript_json TEXT NOT NULL, ai_character_name TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id),
    session_id TEXT REFERENCES sessions(id),
    priority TEXT NOT NULL CHECK(priority IN ('high','medium','low')),
    type TEXT NOT NULL, excerpt TEXT NOT NULL, context TEXT NOT NULL,
    created_at TEXT NOT NULL, acknowledged_at TEXT, acknowledged_by TEXT REFERENCES users(id),
    action_taken TEXT, action_note TEXT
  );
  CREATE TABLE IF NOT EXISTS scenario_queue (
    id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id),
    scenario TEXT NOT NULL, assigned_by TEXT NOT NULL REFERENCES users(id),
    assigned_at TEXT NOT NULL, consumed_at TEXT, notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS parent_contacts (
    id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id),
    logged_by TEXT NOT NULL REFERENCES users(id), contacted_at TEXT NOT NULL,
    method TEXT NOT NULL, person TEXT NOT NULL, topic TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS child_parents (
    child_id TEXT NOT NULL REFERENCES children(id),
    parent_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (child_id, parent_id)
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id),
    user_name TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT NOT NULL,
    resource_id TEXT, child_id TEXT REFERENCES children(id),
    metadata_json TEXT, ip TEXT, user_agent TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sse_tickets (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL, used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS risk_snapshots (
    id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id),
    snapshot_date TEXT NOT NULL, risk_score INTEGER NOT NULL,
    unread_high INTEGER NOT NULL DEFAULT 0, unread_medium INTEGER NOT NULL DEFAULT 0,
    unread_low INTEGER NOT NULL DEFAULT 0, sentiment_avg REAL,
    UNIQUE (child_id, snapshot_date)
  );
  CREATE TABLE IF NOT EXISTS child_missions (
    id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id),
    title TEXT NOT NULL, description TEXT NOT NULL,
    source_scenario TEXT, source_session_id TEXT REFERENCES sessions(id),
    difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
    xp INTEGER NOT NULL DEFAULT 10,
    assigned_at TEXT NOT NULL, due_date TEXT,
    completed_at TEXT, child_reflection TEXT
  );
  CREATE TABLE IF NOT EXISTS child_app_events (
    id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id),
    type TEXT NOT NULL, payload_json TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS child_helper_messages (
    id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id),
    role TEXT NOT NULL CHECK(role IN ('child','helper')),
    content TEXT NOT NULL, created_at TEXT NOT NULL
  );
`);

console.log('Clearing existing data...');
db.exec(`
  DELETE FROM child_helper_messages;
  DELETE FROM child_app_events;
  DELETE FROM child_missions;
  DELETE FROM sse_tickets;
  DELETE FROM audit_log;
  DELETE FROM risk_snapshots;
  DELETE FROM scenario_queue;
  DELETE FROM parent_contacts;
  DELETE FROM child_parents;
  DELETE FROM alerts;
  DELETE FROM sessions;
  DELETE FROM children;
  DELETE FROM users;
  DELETE FROM schools;
`);

const uuid = () => crypto.randomUUID();
const now = new Date();
const iso = (d: Date) => d.toISOString();
const daysAgo = (d: number, hoursAgo = 0) => {
  const t = new Date(now);
  t.setDate(t.getDate() - d);
  t.setHours(t.getHours() - hoursAgo);
  return t;
};
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];

const schoolId = uuid();
const schoolName = 'Herzl Secondary School';
db.prepare(`INSERT INTO schools (id, name, created_at) VALUES (?, ?, ?)`).run(
  schoolId,
  schoolName,
  iso(daysAgo(120))
);

const pwHash = bcrypt.hashSync('password123', 10);

const adminId = uuid();
db.prepare(
  `INSERT INTO users (id, school_id, email, name, role, password_hash, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).run(adminId, schoolId, 'admin@herzl.school', 'Yael Shapiro', 'school_admin', pwHash, '+972-50-1000001', iso(daysAgo(120)));

const psychologists = [
  { name: 'Dr. Ron Levi', email: 'ron@herzl.school', phone: '+972-50-2000001' },
  { name: 'Dr. Tamar Cohen', email: 'tamar@herzl.school', phone: '+972-50-2000002' },
  { name: 'Dr. Avi Peretz', email: 'avi@herzl.school', phone: '+972-50-2000003' },
].map((p) => ({ ...p, id: uuid() }));

for (const p of psychologists) {
  db.prepare(
    `INSERT INTO users (id, school_id, email, name, role, password_hash, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(p.id, schoolId, p.email, p.name, 'psychologist', pwHash, p.phone, iso(daysAgo(100)));
}

const firstNames = ['Dana', 'Eitan', 'Noa', 'Yoav', 'Maya', 'Ari', 'Shira', 'Omer', 'Lior', 'Tal', 'Roni', 'Gal', 'Ben', 'Ella', 'Nadav', 'Hila', 'Idan', 'Yuval'];
const lastNames = ['Katz', 'Bar', 'Mizrahi', 'Golan', 'Ohayon', 'Azulay', 'Harel', 'Friedman', 'Ashkenazi', 'Shemesh'];
const scenarios: ScenarioType[] = [
  'asking_teacher_for_help',
  'joining_group_conversation',
  'handling_disagreement',
  'ordering_in_public',
  'introducing_yourself',
  'presenting_in_class',
  'refusing_peer_pressure',
];
const aiCharacters = ['Ms. Levine (Teacher)', 'Coach Ben', 'New Classmate Rotem', 'Librarian Mrs. Azar', 'Group of Peers'];

const highRiskPhrases: Array<{ type: AlertType; excerpt: string }> = [
  { type: 'suicide_ideation', excerpt: 'I want to kill myself' },
  { type: 'self_harm', excerpt: 'sometimes I cut myself so I feel something' },
  { type: 'abuse', excerpt: 'my uncle hits me when no one is looking' },
];
const midRiskPhrases: Array<{ type: AlertType; excerpt: string }> = [
  { type: 'severe_anxiety', excerpt: 'I feel like I cannot breathe when I go to school' },
  { type: 'bullying', excerpt: 'they laugh at me every lunch break' },
  { type: 'emotional_distress', excerpt: 'nobody at home really listens to me' },
];
const lowRiskPhrases: Array<{ type: AlertType; excerpt: string }> = [
  { type: 'unusual_language', excerpt: "I don't want to talk today" },
  { type: 'other', excerpt: 'I had a weird dream about school last night' },
];

function makeTranscript(scenario: ScenarioType, aiName: string, startedAt: Date, childSkill: number): {
  lines: TranscriptLine[];
  metrics: { response_latency_avg_ms: number; talk_time_ratio: number; word_count: number; unique_words: number; sentiment_score: number };
} {
  const openings: Record<ScenarioType, string[]> = {
    asking_teacher_for_help: ['Hi, do you have a minute?', 'Is this a good time to ask something?'],
    joining_group_conversation: ['Hey, what are you guys talking about?', 'Mind if I join?'],
    handling_disagreement: ['I see it differently, can I explain?', "I don't agree — here's why."],
    ordering_in_public: ['Hi, can I get a menu please?', "I'd like to order, please."],
    introducing_yourself: ["Hi, I'm new here.", "Hey — I don't think we've met."],
    presenting_in_class: ['Good morning everyone.', "Hi, today I'll present..."],
    refusing_peer_pressure: ["No thanks, I'm good.", "I'd rather not, sorry."],
    asking_for_a_date: ['Would you want to get coffee sometime?', 'Are you free Saturday?'],
  };

  const childPool = childSkill > 0.6
    ? ['Yes, I would like that.', 'Sure, that sounds good.', 'Thank you for explaining.', "That makes sense, I'll try it.", 'I appreciate your help.']
    : childSkill > 0.3
      ? ['Um, I guess.', 'Yeah... okay.', "I'm not sure.", 'Maybe?', 'I think so.']
      : ["I don't know.", '...', 'Maybe.', "I can't.", 'Sorry.'];

  const aiTurns = [`${pick(openings[scenario])}`, 'Can you tell me a bit more?', 'How does that make you feel?', 'What would you like to try next time?'];

  const lines: TranscriptLine[] = [];
  let t = new Date(startedAt);
  for (let i = 0; i < 4; i++) {
    lines.push({ speaker: 'ai' as Speaker, text: aiTurns[i], ts: iso(t) });
    t = new Date(t.getTime() + randInt(3, 8) * 1000);
    lines.push({ speaker: 'child' as Speaker, text: pick(childPool), ts: iso(t) });
    t = new Date(t.getTime() + randInt(2, 10) * 1000);
  }

  const childText = lines.filter((l) => l.speaker === 'child').map((l) => l.text).join(' ');
  const words = childText.split(/\s+/).filter(Boolean);
  const unique = new Set(words.map((w) => w.toLowerCase()));
  const latency = Math.round(rand(4000, 8500) - childSkill * 3500);
  const talkRatio = +(0.15 + childSkill * 0.4).toFixed(3);
  const sentiment = +(-0.3 + childSkill * 0.9 + rand(-0.15, 0.15)).toFixed(3);

  return {
    lines,
    metrics: {
      response_latency_avg_ms: Math.max(600, latency),
      talk_time_ratio: talkRatio,
      word_count: words.length,
      unique_words: unique.size,
      sentiment_score: Math.max(-1, Math.min(1, sentiment)),
    },
  };
}

const childrenData = [
  { first: 'Dana', grade: 9, trend: 'improving', notes: 'Social anxiety, avoidant at start. Strong with 1:1 conversations.' },
  { first: 'Eitan', grade: 11, trend: 'plateau', notes: 'Selective mutism history. Makes progress but regresses in group scenarios.' },
  { first: 'Noa', grade: 8, trend: 'improving', notes: 'New to the country. Hebrew is second language. Confidence-building focus.' },
  { first: 'Yoav', grade: 12, trend: 'at_risk', notes: 'Recent family separation. Mood monitoring requested by parents.' },
  { first: 'Maya', grade: 10, trend: 'improving', notes: 'Presentation anxiety. Targeting public speaking scenarios.' },
  { first: 'Ari', grade: 7, trend: 'plateau', notes: 'ADHD + peer conflict. Focus scenarios: disagreement handling.' },
  { first: 'Shira', grade: 9, trend: 'improving', notes: 'Previously withdrawn. Family supportive.' },
  { first: 'Omer', grade: 11, trend: 'at_risk', notes: 'Flagged by homeroom teacher for bullying-related concerns.' },
  { first: 'Lior', grade: 8, trend: 'improving', notes: 'Sibling of former participant. Self-referred.' },
];

type Trend = 'improving' | 'plateau' | 'at_risk';
const insertChild = db.prepare(
  `INSERT INTO children (id, school_id, psychologist_id, display_name, grade, date_of_birth, notes, username, password_hash, preferred_lang, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const childPwHash = bcrypt.hashSync('child123', 10);
const insertSession = db.prepare(
  `INSERT INTO sessions (id, child_id, scenario, started_at, ended_at, duration_sec, scenario_success, completed, metrics_json, transcript_json, ai_character_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertAlert = db.prepare(
  `INSERT INTO alerts (id, child_id, session_id, priority, type, excerpt, context, created_at, acknowledged_at, acknowledged_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

for (const [idx, c] of childrenData.entries()) {
  const childId = uuid();
  const psych = psychologists[idx % psychologists.length];
  const birthYear = new Date().getFullYear() - (6 + c.grade);
  const dob = `${birthYear}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
  const displayName = `${c.first} ${pick(lastNames)}`;
  const username = c.first.toLowerCase();
  insertChild.run(
    childId, schoolId, psych.id, displayName, c.grade, dob, c.notes,
    username, childPwHash, 'en', iso(daysAgo(90))
  );

  const sessionCount = randInt(12, 22);
  for (let i = 0; i < sessionCount; i++) {
    const sessionDaysAgo = Math.round(((sessionCount - i) / sessionCount) * 80);
    const started = daysAgo(sessionDaysAgo, randInt(0, 6));

    const progressFactor = i / Math.max(1, sessionCount - 1);
    const baseSkill =
      c.trend === 'improving' ? 0.2 + progressFactor * 0.6 :
      c.trend === 'plateau' ? 0.35 + rand(-0.1, 0.1) :
      /* at_risk */ 0.45 - progressFactor * 0.25 + rand(-0.1, 0.1);
    const childSkill = Math.max(0.05, Math.min(0.95, baseSkill + rand(-0.1, 0.1)));

    const scenario = pick(scenarios);
    const aiName = pick(aiCharacters);
    const { lines, metrics } = makeTranscript(scenario, aiName, started, childSkill);
    const duration = randInt(300, 900);
    const ended = new Date(started.getTime() + duration * 1000);
    const success = childSkill > 0.4 && Math.random() < childSkill + 0.1;

    const sessionId = uuid();
    insertSession.run(
      sessionId, childId, scenario, iso(started), iso(ended), duration,
      success ? 1 : 0, 1, JSON.stringify(metrics), JSON.stringify(lines), aiName
    );

    if (c.trend === 'at_risk' && Math.random() < 0.35) {
      const highRoll = Math.random();
      if (highRoll < 0.2) {
        const p = pick(highRiskPhrases);
        insertAlert.run(uuid(), childId, sessionId, 'high', p.type, p.excerpt,
          `Said during scenario "${scenario}" with character "${aiName}".`,
          iso(ended), null, null);
      } else if (highRoll < 0.6) {
        const p = pick(midRiskPhrases);
        insertAlert.run(uuid(), childId, sessionId, 'medium', p.type, p.excerpt,
          `Said during scenario "${scenario}".`, iso(ended), null, null);
      } else {
        const p = pick(lowRiskPhrases);
        const ackAt = Math.random() < 0.5 ? iso(new Date(ended.getTime() + 3600 * 1000)) : null;
        insertAlert.run(uuid(), childId, sessionId, 'low', p.type, p.excerpt,
          `Mild signal — context: "${scenario}".`, iso(ended), ackAt, ackAt ? psych.id : null);
      }
    } else if (Math.random() < 0.12) {
      const p = pick(lowRiskPhrases);
      const ackAt = Math.random() < 0.7 ? iso(new Date(ended.getTime() + 3600 * 1000)) : null;
      insertAlert.run(uuid(), childId, sessionId, 'low', p.type, p.excerpt,
        `Minor signal during "${scenario}".`, iso(ended), ackAt, ackAt ? psych.id : null);
    }
  }
}

const contactTopics = [
  'Weekly check-in', 'Concerning language in session', 'Request to review progress',
  'Scheduling next meeting', 'Discussion of home environment', 'Follow-up on incident',
];
const contactOutcomes = [
  'Parent is aware and supportive', 'Agreed to follow up next week', 'No concerns reported',
  'Will coordinate with homeroom teacher', 'Scheduled joint meeting', 'Escalated to administration',
];
const persons = ['Mother', 'Father', 'Guardian', 'Homeroom teacher', 'Aunt'];
const methods = ['phone', 'sms', 'email', 'in_person', 'video', 'other'] as const;
const insertContact = db.prepare(
  `INSERT INTO parent_contacts (id, child_id, logged_by, contacted_at, method, person, topic, outcome, notes, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertQueue = db.prepare(
  `INSERT INTO scenario_queue (id, child_id, scenario, assigned_by, assigned_at, notes) VALUES (?, ?, ?, ?, ?, ?)`
);
const insertSnapshot = db.prepare(
  `INSERT OR REPLACE INTO risk_snapshots (id, child_id, snapshot_date, risk_score, unread_high, unread_medium, unread_low, sentiment_avg)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const allChildren = db.prepare(`SELECT id, psychologist_id FROM children`).all() as Array<{ id: string; psychologist_id: string }>;
for (const c of allChildren) {
  const contactCount = randInt(0, 4);
  for (let i = 0; i < contactCount; i++) {
    const contacted = daysAgo(randInt(1, 70));
    insertContact.run(
      uuid(), c.id, c.psychologist_id, iso(contacted),
      pick([...methods]), pick(persons), pick(contactTopics),
      pick(contactOutcomes), '', iso(contacted)
    );
  }
  const queueCount = randInt(0, 3);
  for (let i = 0; i < queueCount; i++) {
    insertQueue.run(uuid(), c.id, pick(scenarios), c.psychologist_id, iso(daysAgo(randInt(0, 5))), '');
  }
}

// Weekly risk snapshots, last 12 weeks, computed from historical session/alert data
for (let weeksBack = 12; weeksBack >= 0; weeksBack--) {
  const asOf = daysAgo(weeksBack * 7);
  const asOfIso = iso(asOf);
  for (const c of allChildren) {
    const row = db
      .prepare(
        `SELECT
          SUM(CASE WHEN priority='high' AND (acknowledged_at IS NULL OR acknowledged_at > ?) AND created_at <= ? THEN 1 ELSE 0 END) AS uh,
          SUM(CASE WHEN priority='medium' AND (acknowledged_at IS NULL OR acknowledged_at > ?) AND created_at <= ? THEN 1 ELSE 0 END) AS um,
          SUM(CASE WHEN priority='low' AND (acknowledged_at IS NULL OR acknowledged_at > ?) AND created_at <= ? THEN 1 ELSE 0 END) AS ul
         FROM alerts WHERE child_id = ?`
      )
      .get(asOfIso, asOfIso, asOfIso, asOfIso, asOfIso, asOfIso, c.id) as { uh: number | null; um: number | null; ul: number | null };
    const uh = row.uh ?? 0;
    const um = row.um ?? 0;
    const ul = row.ul ?? 0;

    const recent = db
      .prepare(
        `SELECT metrics_json FROM sessions WHERE child_id = ? AND started_at <= ? ORDER BY started_at DESC LIMIT 6`
      )
      .all(c.id, asOfIso) as Array<{ metrics_json: string }>;
    const sents = recent.map((r) => JSON.parse(r.metrics_json).sentiment_score as number);
    const avgAll = sents.length ? sents.reduce((a, b) => a + b, 0) / sents.length : null;
    const newer = sents.slice(0, 3);
    const older = sents.slice(3, 6);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const drop = older.length && newer.length ? Math.max(0, avg(older) - avg(newer)) : 0;

    const last = db.prepare(`SELECT started_at FROM sessions WHERE child_id = ? AND started_at <= ? ORDER BY started_at DESC LIMIT 1`).get(c.id, asOfIso) as { started_at: string } | undefined;
    let score = 0;
    score += Math.min(40, uh * 20);
    score += Math.min(20, um * 5);
    score += Math.min(20, drop * 40);
    if (!last) {
      score += 15;
    } else {
      const daysSince = (asOf.getTime() - new Date(last.started_at).getTime()) / (24 * 3600 * 1000);
      if (daysSince > 14) score += 20;
      else if (daysSince > 7) score += 10;
    }
    score = Math.min(100, Math.round(score));
    insertSnapshot.run(uuid(), c.id, asOfIso.slice(0, 10), score, uh, um, ul, avgAll);
  }
}

// Sample child-app activity for the first 3 children so the psychologist's
// "Companion app activity" panel has something to show out of the box.
const sampleMissions: Array<{ title: string; description: string; scenario: string; difficulty: 'easy'|'medium'|'hard'; xp: number }> = [
  { title: 'Say hi to one new person today', description: 'Practiced in VR — try it once in real life.', scenario: 'joining_group_conversation', difficulty: 'easy', xp: 10 },
  { title: 'Ask a teacher one question in class', description: "Doesn't matter if it's small — practice raising your hand.", scenario: 'asking_teacher_for_help', difficulty: 'medium', xp: 20 },
  { title: 'Order something yourself', description: 'Cafeteria, kiosk, store — order without asking someone else.', scenario: 'ordering_in_public', difficulty: 'easy', xp: 10 },
  { title: 'Volunteer to share an answer once', description: 'Raise your hand once today, even for an easy question.', scenario: 'presenting_in_class', difficulty: 'medium', xp: 20 },
];
const sampleReflections = [
  'Did it! Felt weird for a sec but okay.',
  'Was nervous but the person was nice.',
  null,
  'Smaller than I thought it would be.',
  null,
];
const sampleHelperConvos = [
  { child: "How do I start a conversation when I don't know anyone?", helper: "A safe opener: a small comment about what's around you. 'This line is forever, huh?' Pick one person, one short line. That's the whole mission today." },
  { child: 'I always freeze when called on in class.', helper: "Totally normal. Try this: when you feel the freeze, breathe in for 4, out for 6. Then say 'can I have a sec?' That buys time and is 100% okay." },
  { child: 'I want to make a new friend but I don\'t know how', helper: 'Friendships start tiny — sit one seat closer to someone you like, say hi twice this week, ask one question. Small + repeated wins.' },
];

const insertMission = db.prepare(
  `INSERT INTO child_missions (id, child_id, title, description, source_scenario, difficulty, xp, assigned_at, due_date, completed_at, child_reflection)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertEvent = db.prepare(
  `INSERT INTO child_app_events (id, child_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`
);
const insertHelperMsg = db.prepare(
  `INSERT INTO child_helper_messages (id, child_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`
);

const seededChildren = db.prepare(`SELECT id FROM children ORDER BY created_at DESC LIMIT 3`).all() as Array<{ id: string }>;
for (const sc of seededChildren) {
  for (let i = 0; i < sampleMissions.length; i++) {
    const m = sampleMissions[i];
    const assignedAt = daysAgo(randInt(1, 8), randInt(0, 8));
    const isDone = i < 3;
    const completedAt = isDone ? new Date(assignedAt.getTime() + randInt(2, 14) * 60 * 60 * 1000) : null;
    insertMission.run(
      uuid(), sc.id, m.title, m.description, m.scenario, m.difficulty, m.xp,
      iso(assignedAt),
      iso(new Date(assignedAt.getTime() + 24 * 60 * 60 * 1000)),
      completedAt ? iso(completedAt) : null,
      isDone ? sampleReflections[i] ?? null : null
    );
    if (completedAt) {
      insertEvent.run(uuid(), sc.id, 'mission_completed', JSON.stringify({ title: m.title }), iso(completedAt));
    }
  }
  for (let d = 1; d <= 5; d++) {
    insertEvent.run(uuid(), sc.id, 'login', null, iso(daysAgo(d, randInt(0, 4))));
  }
  for (const conv of sampleHelperConvos) {
    const t1 = daysAgo(randInt(1, 6), randInt(0, 8));
    const t2 = new Date(t1.getTime() + 4_000);
    insertHelperMsg.run(uuid(), sc.id, 'child', conv.child, iso(t1));
    insertHelperMsg.run(uuid(), sc.id, 'helper', conv.helper, iso(t2));
    insertEvent.run(uuid(), sc.id, 'helper_chat', JSON.stringify({ user_text_preview: conv.child.slice(0, 80) }), iso(t1));
  }
}

// Mark the "at-risk" children as sensitive (crisis protocol in effect)
db.prepare(`UPDATE children SET is_sensitive = 1 WHERE display_name LIKE '%Yoav%' OR display_name LIKE '%Omer%'`).run();

// Seed parent accounts linked to specific children
const yoav = db.prepare(`SELECT id FROM children WHERE display_name LIKE '%Yoav%'`).get() as { id: string } | undefined;
const dana = db.prepare(`SELECT id FROM children WHERE display_name LIKE '%Dana%'`).get() as { id: string } | undefined;

const parentsSeed = [
  { email: 'parent.yoav@herzl.school', name: 'Sarah (Yoav\'s mother)', phone: '+972-50-3000001', child_id: yoav?.id },
  { email: 'parent.dana@herzl.school', name: 'Miriam (Dana\'s mother)', phone: '+972-50-3000002', child_id: dana?.id },
];

for (const p of parentsSeed) {
  if (!p.child_id) continue;
  const parentId = uuid();
  db.prepare(
    `INSERT INTO users (id, school_id, email, name, role, password_hash, phone, created_at) VALUES (?, ?, ?, ?, 'parent', ?, ?, ?)`
  ).run(parentId, schoolId, p.email, p.name, pwHash, p.phone, iso(daysAgo(30)));
  db.prepare(
    `INSERT INTO child_parents (child_id, parent_id, created_at) VALUES (?, ?, ?)`
  ).run(p.child_id, parentId, iso(daysAgo(30)));
}

// --------------------------------------------------------------------
// Simple demo accounts (friendly emails for quick sign-in)
// --------------------------------------------------------------------
const demoAdminId = uuid();
db.prepare(
  `INSERT INTO users (id, school_id, email, name, role, password_hash, phone, created_at)
   VALUES (?, ?, ?, ?, 'school_admin', ?, ?, ?)`
).run(demoAdminId, schoolId, 'Admin@SocialMind.org', 'School Administrator', pwHash, '+972-50-9000001', iso(daysAgo(1)));

const demoPsychId = uuid();
db.prepare(
  `INSERT INTO users (id, school_id, email, name, role, password_hash, phone, created_at)
   VALUES (?, ?, ?, ?, 'psychologist', ?, ?, ?)`
).run(demoPsychId, schoolId, 'Psychologist@gmail.com', 'Dr. Demo Psychologist', pwHash, '+972-50-9000002', iso(daysAgo(1)));

// Re-assign Yoav + Dana + Maya to the demo psychologist so login shows rich clinical data
db.prepare(
  `UPDATE children SET psychologist_id = ? WHERE display_name LIKE '%Yoav%' OR display_name LIKE '%Dana%' OR display_name LIKE '%Maya%'`
).run(demoPsychId);

const demoParentId = uuid();
db.prepare(
  `INSERT INTO users (id, school_id, email, name, role, password_hash, phone, created_at)
   VALUES (?, ?, ?, ?, 'parent', ?, ?, ?)`
).run(demoParentId, schoolId, 'Parent@gmail.com', 'Demo Parent', pwHash, '+972-50-9000003', iso(daysAgo(1)));

// Link demo parent to Yoav (the at-risk/sensitive child — shows a rich parent view)
if (yoav) {
  db.prepare(
    `INSERT INTO child_parents (child_id, parent_id, created_at) VALUES (?, ?, ?)`
  ).run(yoav.id, demoParentId, iso(daysAgo(1)));
}

const counts = {
  schools: db.prepare(`SELECT COUNT(*) AS n FROM schools`).get() as { n: number },
  users: db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number },
  children: db.prepare(`SELECT COUNT(*) AS n FROM children`).get() as { n: number },
  sessions: db.prepare(`SELECT COUNT(*) AS n FROM sessions`).get() as { n: number },
  alerts: db.prepare(`SELECT COUNT(*) AS n FROM alerts`).get() as { n: number },
  contacts: db.prepare(`SELECT COUNT(*) AS n FROM parent_contacts`).get() as { n: number },
  queue: db.prepare(`SELECT COUNT(*) AS n FROM scenario_queue`).get() as { n: number },
  snapshots: db.prepare(`SELECT COUNT(*) AS n FROM risk_snapshots`).get() as { n: number },
};

console.log('Seed complete:');
console.log(`  schools:   ${counts.schools.n}`);
console.log(`  users:     ${counts.users.n}`);
console.log(`  children:  ${counts.children.n}`);
console.log(`  sessions:  ${counts.sessions.n}`);
console.log(`  alerts:    ${counts.alerts.n}`);
console.log(`  contacts:  ${counts.contacts.n}`);
console.log(`  queued:    ${counts.queue.n}`);
console.log(`  snapshots: ${counts.snapshots.n}`);
console.log('');
console.log('Child-app login (all password: child123):');
const seededUsers = db.prepare(`SELECT username, display_name FROM children WHERE username IS NOT NULL ORDER BY display_name`).all() as Array<{ username: string; display_name: string }>;
for (const u of seededUsers) console.log(`    ${u.username.padEnd(12)}(${u.display_name})`);
console.log('');
console.log('Dashboard login (all password: password123):');
console.log('');
console.log('  Simple demo accounts:');
console.log('    Admin@SocialMind.org    (school admin)');
console.log('    Psychologist@gmail.com  (psychologist — sees Yoav, Dana, Maya)');
console.log('    Parent@gmail.com        (parent — sees Yoav)');
console.log('');
console.log('  Original school accounts:');
console.log('    admin@herzl.school       (school admin)');
for (const p of psychologists) console.log(`    ${p.email.padEnd(25)}(psychologist)`);
for (const p of parentsSeed) console.log(`    ${p.email.padEnd(25)}(parent — ${p.name})`);
