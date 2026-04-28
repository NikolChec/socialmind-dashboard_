import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from '../db/schema.js';
import { signChildToken, requireChildAuth, CHILD_JWT_TTL_SECONDS } from '../middleware/child_auth.js';
import { chatWithOllama, helperModelName } from '../services/ollama.js';
import type {
  ChatMessage,
  ChildAuthUser,
  ChildAppEventType,
  ChildMission,
  ChildRecap,
  MissionDifficulty,
  RecapGoodPart,
  ScenarioType,
  TranscriptLine,
  VRRecapHighlight,
} from '@socialmind/shared';

export const childRouter = Router();

const isDev = process.env.NODE_ENV !== 'production';
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: isDev ? 60 : 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

interface ChildRow {
  id: string;
  school_id: string;
  display_name: string;
  grade: number;
  username: string | null;
  password_hash: string | null;
  preferred_lang: string;
}

function logEvent(child_id: string, type: ChildAppEventType, payload?: Record<string, unknown>) {
  db.prepare(
    `INSERT INTO child_app_events (id, child_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    child_id,
    type,
    payload ? JSON.stringify(payload) : null,
    new Date().toISOString()
  );
}

function loadChild(child_id: string): ChildAuthUser | null {
  const row = db
    .prepare(
      `SELECT id, school_id, display_name, grade, COALESCE(preferred_lang,'en') AS preferred_lang
       FROM children WHERE id = ?`
    )
    .get(child_id) as Omit<ChildAuthUser, 'preferred_lang'> & { preferred_lang: string } | undefined;
  return row ?? null;
}

// ---------- Auth ----------

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

childRouter.post('/auth/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const { username, password } = parsed.data;
  const row = db
    .prepare(
      `SELECT id, school_id, display_name, grade, username, password_hash, COALESCE(preferred_lang,'en') AS preferred_lang
       FROM children WHERE lower(username) = lower(?)`
    )
    .get(username) as ChildRow | undefined;

  if (!row || !row.password_hash || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const token = signChildToken({ child_id: row.id, school_id: row.school_id });
  const child: ChildAuthUser = {
    id: row.id,
    display_name: row.display_name,
    grade: row.grade,
    school_id: row.school_id,
    preferred_lang: row.preferred_lang,
  };

  logEvent(row.id, 'login');
  res.json({ token, child, expires_in: CHILD_JWT_TTL_SECONDS });
});

childRouter.get('/me', requireChildAuth, (req, res) => {
  const c = loadChild(req.child!.child_id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  res.json(c);
});

childRouter.post('/auth/lang', requireChildAuth, (req, res) => {
  const lang = String((req.body as { lang?: string }).lang || '').slice(0, 8);
  if (!/^[a-z]{2,8}$/.test(lang)) return res.status(400).json({ error: 'invalid_lang' });
  db.prepare(`UPDATE children SET preferred_lang = ? WHERE id = ?`).run(lang, req.child!.child_id);
  res.json({ ok: true });
});

// ---------- Recap ----------

interface SessionRow {
  id: string;
  scenario: ScenarioType;
  started_at: string;
  ai_character_name: string;
  metrics_json: string;
  transcript_json: string;
  scenario_success: number;
}

function highlightFromSession(s: SessionRow): VRRecapHighlight {
  const metrics = JSON.parse(s.metrics_json) as {
    sentiment_score: number;
    talk_time_ratio: number;
    response_latency_avg_ms: number;
  };
  const transcript = JSON.parse(s.transcript_json) as TranscriptLine[];
  const aiLines = transcript.filter((t) => t.speaker === 'ai');
  const childLines = transcript.filter((t) => t.speaker === 'child');

  const good: RecapGoodPart[] = [];
  if (s.scenario_success) good.push({ key: 'completed_scenario' });
  if (metrics.talk_time_ratio > 0.35) good.push({ key: 'spoke_clearly' });
  if (metrics.sentiment_score > 0.2) good.push({ key: 'stayed_positive' });
  if (metrics.response_latency_avg_ms < 4500) good.push({ key: 'responded_quickly' });
  if (childLines.length >= 3) good.push({ key: 'took_turns', params: { n: childLines.length } });
  if (good.length === 0) good.push({ key: 'showed_up' });

  const aiQuote = aiLines[aiLines.length - 1]?.text ?? null;

  return {
    session_id: s.id,
    scenario: s.scenario,
    date: s.started_at,
    ai_character_name: s.ai_character_name,
    good_parts: good.slice(0, 3),
    ai_quote: aiQuote,
  };
}

childRouter.get('/recap', requireChildAuth, (req, res) => {
  const child_id = req.child!.child_id;
  const c = loadChild(child_id);
  if (!c) return res.status(404).json({ error: 'not_found' });

  const sessions = db
    .prepare(
      `SELECT id, scenario, started_at, ai_character_name, metrics_json, transcript_json, scenario_success
       FROM sessions WHERE child_id = ? ORDER BY started_at DESC LIMIT 5`
    )
    .all(child_id) as SessionRow[];

  const totalSessions = (db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE child_id = ?`).get(child_id) as { n: number }).n;
  const missionsDone = (db.prepare(`SELECT COUNT(*) AS n FROM child_missions WHERE child_id = ? AND completed_at IS NOT NULL`).get(child_id) as { n: number }).n;

  const loginDays = db
    .prepare(
      `SELECT DISTINCT date(created_at) AS d FROM child_app_events
       WHERE child_id = ? AND type = 'login'
       ORDER BY d DESC LIMIT 30`
    )
    .all(child_id) as Array<{ d: string }>;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < loginDays.length; i++) {
    const expected = new Date(today);
    expected.setDate(today.getDate() - i);
    if (loginDays[i].d === expected.toISOString().slice(0, 10)) streak++;
    else break;
  }

  logEvent(child_id, 'recap_viewed');

  const out: ChildRecap = {
    child: c,
    streak_days: streak,
    total_sessions: totalSessions,
    total_missions_done: missionsDone,
    highlights: sessions.map(highlightFromSession),
  };
  res.json(out);
});

// ---------- Missions ----------

const SCENARIO_TO_MISSION: Partial<Record<ScenarioType, { title: string; description: string; difficulty: MissionDifficulty; xp: number }>> = {
  joining_group_conversation: {
    title: 'Say hi to one new person today',
    description: 'Just like you practiced in VR — try it once in real life. A classmate, a neighbor, anyone.',
    difficulty: 'easy',
    xp: 10,
  },
  asking_teacher_for_help: {
    title: 'Ask a teacher one question in class',
    description: "Doesn't matter if it's small — practice the moment of raising your hand.",
    difficulty: 'medium',
    xp: 20,
  },
  introducing_yourself: {
    title: 'Introduce yourself to someone new',
    description: 'Name and one fact about you. That\'s the whole mission.',
    difficulty: 'medium',
    xp: 15,
  },
  handling_disagreement: {
    title: 'Share a different opinion calmly',
    description: 'When someone says something you don\'t agree with, try: "I see it a bit differently — can I share?"',
    difficulty: 'hard',
    xp: 25,
  },
  ordering_in_public: {
    title: 'Order something yourself',
    description: 'Cafeteria, kiosk, store — order without asking someone else to do it for you.',
    difficulty: 'easy',
    xp: 10,
  },
  presenting_in_class: {
    title: 'Volunteer to share an answer once',
    description: 'Raise your hand once today, even for an easy question. Practice the feeling.',
    difficulty: 'medium',
    xp: 20,
  },
  refusing_peer_pressure: {
    title: 'Practice saying "no thanks"',
    description: 'A small friendly "no" to something you don\'t want to do. You don\'t have to explain.',
    difficulty: 'medium',
    xp: 20,
  },
};

function ensureTodaysMissions(child_id: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const openToday = db
    .prepare(
      `SELECT COUNT(*) AS n FROM child_missions
       WHERE child_id = ? AND assigned_at >= ? AND completed_at IS NULL`
    )
    .get(child_id, todayIso) as { n: number };
  if (openToday.n > 0) return;

  const recent = db
    .prepare(
      `SELECT DISTINCT scenario, id AS session_id FROM sessions
       WHERE child_id = ? ORDER BY started_at DESC LIMIT 6`
    )
    .all(child_id) as Array<{ scenario: ScenarioType; session_id: string }>;

  const seen = new Set<string>();
  const picks = recent
    .filter((r) => SCENARIO_TO_MISSION[r.scenario] && !seen.has(r.scenario) && (seen.add(r.scenario), true))
    .slice(0, 3);

  const insert = db.prepare(
    `INSERT INTO child_missions (id, child_id, title, description, source_scenario, source_session_id, difficulty, xp, assigned_at, due_date, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  );
  const due = new Date();
  due.setHours(23, 59, 59, 999);
  for (const r of picks) {
    const tpl = SCENARIO_TO_MISSION[r.scenario]!;
    insert.run(
      crypto.randomUUID(),
      child_id,
      tpl.title,
      tpl.description,
      r.scenario,
      r.session_id,
      tpl.difficulty,
      tpl.xp,
      new Date().toISOString(),
      due.toISOString()
    );
  }
}

interface MissionRow {
  id: string;
  title: string;
  description: string;
  source_scenario: ScenarioType | null;
  difficulty: MissionDifficulty;
  xp: number;
  assigned_at: string;
  due_date: string | null;
  completed_at: string | null;
  child_reflection: string | null;
}

childRouter.get('/missions', requireChildAuth, (req, res) => {
  const child_id = req.child!.child_id;
  ensureTodaysMissions(child_id);

  const rows = db
    .prepare(
      `SELECT id, title, description, source_scenario, difficulty, xp, assigned_at, due_date, completed_at, child_reflection
       FROM child_missions WHERE child_id = ?
       ORDER BY (completed_at IS NOT NULL) ASC, assigned_at DESC LIMIT 20`
    )
    .all(child_id) as MissionRow[];

  const out: ChildMission[] = rows.map((r) => ({ ...r }));
  res.json(out);
});

const completeSchema = z.object({
  reflection: z.string().max(500).optional(),
});

childRouter.post('/missions/:id/complete', requireChildAuth, (req, res) => {
  const child_id = req.child!.child_id;
  const { id } = req.params;
  const parsed = completeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const row = db
    .prepare(`SELECT title, completed_at FROM child_missions WHERE id = ? AND child_id = ?`)
    .get(id, child_id) as { title: string; completed_at: string | null } | undefined;
  if (!row) return res.status(404).json({ error: 'not_found' });

  const reflection = parsed.data.reflection ?? null;
  if (row.completed_at) {
    db.prepare(`UPDATE child_missions SET completed_at = NULL, child_reflection = NULL WHERE id = ?`).run(id);
    logEvent(child_id, 'mission_uncompleted', { mission_id: id, title: row.title });
  } else {
    db.prepare(`UPDATE child_missions SET completed_at = ?, child_reflection = ? WHERE id = ?`)
      .run(new Date().toISOString(), reflection, id);
    logEvent(child_id, 'mission_completed', { mission_id: id, title: row.title, reflection });
  }
  res.json({ ok: true });
});

// ---------- Helper chat ----------

const helperSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1).max(2000),
    })
  ).min(1).max(40),
  lang: z.string().max(8).optional(),
});

function helperSystemPrompt(child: ChildAuthUser, lang: string, strict = false): string {
  const langName =
    lang === 'he' ? 'Hebrew (עברית)' :
    lang === 'ru' ? 'Russian (Русский)' :
    'English';

  const directive =
    lang === 'he' ? 'אתה חייב לענות אך ורק בעברית. אסור להשתמש באף מילה באנגלית או רוסית. אם תרצה לכתוב מילה לועזית — תרגם אותה לעברית.' :
    lang === 'ru' ? 'Ты ОБЯЗАН отвечать ТОЛЬКО на русском языке. ЗАПРЕЩЕНО использовать английские или ивритские слова. Если хочешь написать иностранное слово — переведи его на русский.' :
    'You must reply ONLY in English.';

  const examples =
    lang === 'ru'
      ? [
          ``,
          `Examples (study these carefully):`,
          ``,
          `USER: "Как меньше нервничать?"`,
          `WRONG (mixes English): "Дана, когда я чувствую nervность, делаю deep breath. Try it today!"`,
          `RIGHT (pure Russian): "Дана, попробуй простой приём: вдох на 4 счёта, выдох на 6. Сделай прямо сейчас — помогает успокоиться за минуту."`,
          ``,
          `USER: "Как начать разговор?"`,
          `WRONG: "Можно начать с small talk — например, спросить про weekend."`,
          `RIGHT: "Простой способ — короткий комментарий о том, что вокруг. Например: «Эта очередь бесконечная, да?». Скажи одну фразу — и хватит."`,
        ].join('\n')
      : lang === 'he'
        ? [
            ``,
            `Examples (study these carefully):`,
            ``,
            `USER: "איך מתחילים שיחה?"`,
            `WRONG (mixes English): "אפשר להתחיל עם small talk — לשאול על ה-weekend או משהו כזה."`,
            `RIGHT (pure Hebrew): "פתיחה פשוטה: הערה קצרה על משהו סביבכם. למשל «התור הזה אינסופי, נכון?». משפט אחד — וזהו."`,
            ``,
            `USER: "מה לעשות אם אני קופא בכיתה?"`,
            `WRONG: "תנסה breathing exercise — זה עוזר ל-anxiety."`,
            `RIGHT: "תנסה תרגיל פשוט: שאיפה ל-4 שניות, נשיפה ל-6. אם מרגישים שקופאים — עוצרים, נושמים, ואומרים «רגע, אני חושב». זה לגמרי בסדר."`,
          ].join('\n')
        : '';

  return [
    `You are "Helper", a warm, friendly chat companion for ${child.display_name}, a student in grade ${child.grade}.`,
    `${child.display_name} is using SocialMind, a program that helps young people practice social situations.`,
    ``,
    `=== LANGUAGE — ABSOLUTE RULE ===`,
    `You MUST reply ONLY in ${langName}.`,
    directive,
    `Even if previous messages in this conversation were in another language, your next reply must be entirely in ${langName}.`,
    `DO NOT mix languages. DO NOT switch mid-sentence. DO NOT include the original language in parentheses. DO NOT use English words inside ${langName} sentences (no "Try it today!", no "small talk", no "deep breath" — translate everything).`,
    strict ? `Your previous reply was rejected because it mixed languages. Try again — write 100% in ${langName}, no exceptions.` : '',
    examples,
    ``,
    `Tone & rules:`,
    `- Sound like a kind, encouraging friend — not a therapist or a robot. Short sentences. No bullet lists unless really needed.`,
    `- Keep replies under 80 words.`,
    `- Never give medical or psychiatric advice. If the child mentions self-harm, hurting others, or a crisis, gently tell them to talk to a trusted adult right now — their psychologist, parent, or teacher.`,
    `- Don't lecture. Don't say "as an AI". Don't moralize.`,
    `- When the child asks "how do I do X", give one tiny, doable first step they could try today.`,
    `- It's okay to be playful and use the child's name occasionally.`,
  ].filter(Boolean).join('\n');
}

// Returns true if the reply is dominated by the wrong script for the target language.
function isLanguageMixed(reply: string, lang: string): boolean {
  const text = reply.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (text.length < 6) return false;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const hebrew = (text.match(/[֐-׿]/g) ?? []).length;
  const total = latin + cyrillic + hebrew;
  if (total === 0) return false;

  if (lang === 'ru') {
    // Russian reply should be overwhelmingly Cyrillic; >15% Latin letters = drift.
    return latin / total > 0.15 || cyrillic / total < 0.6;
  }
  if (lang === 'he') {
    return latin / total > 0.15 || hebrew / total < 0.6;
  }
  // English: too much non-Latin = drift (rare)
  return (cyrillic + hebrew) / total > 0.2;
}

childRouter.post('/helper/chat', requireChildAuth, async (req, res) => {
  const parsed = helperSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const child_id = req.child!.child_id;
  const child = loadChild(child_id);
  if (!child) return res.status(404).json({ error: 'not_found' });

  const data = parsed.data;
  const lang = data.lang || child.preferred_lang || 'en';
  const reminder = lang === 'he'
    ? '[הנחיה: ענה אך ורק בעברית. אסור מילים באנגלית.]'
    : lang === 'ru'
      ? '[Инструкция: отвечай ТОЛЬКО на русском. Никаких английских слов.]'
      : '[Instruction: reply only in English.]';
  const childForPrompt = child;

  function buildMessages(strict: boolean): ChatMessage[] {
    const msgs = data.messages.map((m) => ({ ...m }));
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        msgs[i].content = `${msgs[i].content}\n\n${reminder}`;
        break;
      }
    }
    return [{ role: 'system', content: helperSystemPrompt(childForPrompt, lang, strict) }, ...msgs];
  }

  const lastUser = [...data.messages].reverse().find((m) => m.role === 'user');
  if (lastUser) {
    db.prepare(
      `INSERT INTO child_helper_messages (id, child_id, role, content, created_at) VALUES (?, ?, 'child', ?, ?)`
    ).run(crypto.randomUUID(), child_id, lastUser.content, new Date().toISOString());
  }

  try {
    let reply = await chatWithOllama(buildMessages(false), { model: helperModelName, temperature: 0.4 });
    if (isLanguageMixed(reply, lang)) {
      // One retry with the strict-mode prompt added.
      reply = await chatWithOllama(buildMessages(true), { model: helperModelName, temperature: 0.2 });
    }
    db.prepare(
      `INSERT INTO child_helper_messages (id, child_id, role, content, created_at) VALUES (?, ?, 'helper', ?, ?)`
    ).run(crypto.randomUUID(), child_id, reply, new Date().toISOString());
    logEvent(child_id, 'helper_chat', { user_text_preview: lastUser?.content.slice(0, 80) ?? '' });
    res.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    res.status(502).json({
      error: 'helper_unavailable',
      detail: msg,
      hint: 'Is Ollama running? Start with: ollama serve',
    });
  }
});

childRouter.get('/helper/history', requireChildAuth, (req, res) => {
  const child_id = req.child!.child_id;
  const rows = db
    .prepare(
      `SELECT id, role, content, created_at FROM child_helper_messages
       WHERE child_id = ? ORDER BY created_at ASC LIMIT 100`
    )
    .all(child_id) as Array<{ id: string; role: 'child' | 'helper'; content: string; created_at: string }>;
  res.json(rows);
});
