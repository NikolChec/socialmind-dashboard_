// Adaptive layer on top of the static regex bank in safety.ts.
// When a psychologist labels a helper message, we ask the LLM to extract 2-4 short trigger
// phrases that should fire on similar messages in the future. Phrases are stored per-school
// (a school's clinical team owns the policy for its kids) and ANDed with the static bank
// at runtime.
import crypto from 'node:crypto';
import { db } from '../db/schema.js';
import { chatWithOllama } from './ollama.js';
import type { SafetyCategory, SafetyResult, SafetySeverity } from './safety.js';

const SEV_ORDER: Record<SafetySeverity, number> = { safe: 0, low: 1, medium: 2, high: 3, critical: 4 };

interface LearnedRow {
  id: string;
  pattern: string;
  pattern_lower: string;
  category: string;
  severity: SafetySeverity;
  match_kind: 'phrase' | 'stem';
}

// Word-aware stem match. Returns true if any token in the message starts with `stem`
// AND that token is no more than 4 chars longer than the stem — so stem "bull" catches
// "bully", "bullied", "bulliex" but NOT "bullhorn" (8 chars — over the cap).
function tokenStartsWithStem(token: string, stem: string): boolean {
  if (!token.startsWith(stem)) return false;
  if (token.length > stem.length + 4) return false;
  return true;
}

// Run the static regex bank result through the school's learned patterns and return the merged
// result (highest severity wins, categories/phrases unioned). Also bumps hit_count for
// patterns that fired.
export function applyLearnedPatterns(
  schoolId: string,
  text: string,
  base: SafetyResult,
): SafetyResult {
  const lower = text.toLowerCase();
  const tokens = tokenize(lower);
  const rows = db
    .prepare(
      `SELECT id, pattern, pattern_lower, category, severity, match_kind
       FROM safety_learned_patterns WHERE school_id = ?`
    )
    .all(schoolId) as LearnedRow[];

  const hits: Array<{ id: string; phrase: string; cat: SafetyCategory; sev: SafetySeverity }> = [];
  for (const r of rows) {
    if (r.pattern_lower.length < 2) continue;
    let matched = false;
    if (r.match_kind === 'stem') {
      if (r.pattern_lower.length < 4) continue; // sanity: never match a stem shorter than 4
      matched = tokens.some((t) => tokenStartsWithStem(t, r.pattern_lower));
    } else {
      matched = lower.includes(r.pattern_lower);
    }
    if (matched) {
      hits.push({ id: r.id, phrase: r.pattern, cat: r.category as SafetyCategory, sev: r.severity });
    }
  }

  if (hits.length === 0) return base;

  // Tally hit_count for telemetry / pattern pruning later.
  const now = new Date().toISOString();
  const bump = db.prepare(`UPDATE safety_learned_patterns SET hit_count = hit_count + 1, last_hit_at = ? WHERE id = ?`);
  for (const h of hits) bump.run(now, h.id);

  const allMatched = [
    { sev: base.severity, cat: 'distress' as SafetyCategory, phrase: '' },
    ...hits.map((h) => ({ sev: h.sev, cat: h.cat, phrase: h.phrase })),
  ];
  const top = allMatched.reduce((a, b) => (SEV_ORDER[a.sev] >= SEV_ORDER[b.sev] ? a : b));
  return {
    severity: top.sev,
    categories: Array.from(new Set([...base.categories, ...hits.map((h) => h.cat)])),
    matchedPhrases: [...base.matchedPhrases, ...hits.map((h) => h.phrase)],
  };
}

// Ask the LLM to extract trigger phrases AND paraphrases from a labelled message. Best-effort:
// if the model returns garbage we just store no phrases (the label itself still records the override).
//
// We ask for variations because substring matching is dumb — "feeling left out" matches but
// "feel left out" doesn't unless we explicitly stored both. Generating 6-12 phrases at label
// time costs ~1-2s on the local LLM but spares us a 2nd LLM call on every future kid message.
export async function extractTriggerPhrases(
  messageContent: string,
  category: string,
  severity: SafetySeverity,
): Promise<string[]> {
  if (severity === 'safe') return []; // nothing to learn from "this is fine"
  // Spec at backend/docs/SAFETY_AUTO_FLAG_SPEC.md.
  const sys = [
    'You are a safety-pattern extractor for a kids mental-health app.',
    'A clinician labelled a child message with a severity and a category.',
    'Your job: produce trigger phrases that should match SIMILAR future messages from any kid.',
    '',
    'OUTPUT (strict — non-compliance breaks the system):',
    '- Output ONLY a JSON array of strings. No prose, no code fences, no leading or trailing text.',
    '- 6 to 12 phrases. Less is better than padding with junk.',
    '- Each phrase: 2 to 6 words, 4 to 80 characters, lowercase preferred.',
    '- Same language as the source message (English, Hebrew, or Russian). Do not translate.',
    '',
    'COVERAGE — across the 6-12 phrases include:',
    '- Tense and number variations of the trigger verb (got/getting/was bullied; cut/cutting/cuts).',
    '- Common synonyms that preserve meaning (bullied ~ picked on, teased, made fun of).',
    '- Pronoun and possessive variants (me/myself, my/mine).',
    '- Trigger fragments that signal the concern out of context (cuts on arm, feel like dying).',
    '',
    'FORBIDDEN — never include:',
    '- First names, school names, street names, phone numbers, dates, or any unique identifier.',
    '- Single-word phrases unless that single word is itself a strong rare signal (suicide, overdose).',
    '- Generic emotion stems alone: "i feel", "i love", "i think", "today i", "it hurts", "so sad", "i am sad".',
    '  Each phrase MUST contain at least one specific noun, verb, or modifier tied to the labelled category.',
    '- Phrases that would match in a clearly harmless context (e.g. "i was scared" matches "scared of spiders" — drop it; "scared to go home" is specific — keep).',
    '- Phrases that imply a HIGHER severity than the label (do not extract suicidal phrases for a "medium/distress" label).',
    '',
    'BEFORE outputting each phrase, ask: "Could a kid say this in a fully harmless context?" If yes, drop it.',
    '',
    'EXAMPLES of desired output:',
    '- severity=critical, category=self_harm, message="Sometimes I cut myself"',
    '  → ["cut myself","cutting myself","cuts on my arm","i hurt myself","harm myself","slit my wrist","cuts on my wrist","cutting helps me"]',
    '- severity=medium, category=bullying, message="I got bullied"',
    '  → ["got bullied","getting bullied","was bullied","being bullied","picked on","made fun of me","they bully me","kids tease me"]',
    '',
    'BAD examples (do not produce these):',
    '- ["i feel","today i","at school","i love","sometimes","my friend"] — all too generic, would false-positive.',
    '- ["bullied"] alone — single word.',
    '- ["i got"] — matches "i got pizza".',
  ].join('\n');
  const user = `Severity: ${severity}\nCategory: ${category}\nMessage: """${messageContent}"""\n\nReturn a JSON array of 6-12 trigger phrases (including paraphrases). JSON only:`;

  let raw: string;
  try {
    raw = await chatWithOllama(
      [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      { temperature: 0.2 }
    );
  } catch {
    return [];
  }

  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const v of arr) {
      if (typeof v !== 'string') continue;
      const trimmed = v.trim();
      if (trimmed.length < 4 || trimmed.length > 80) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      // Reject obvious false-positive stems and single tokens.
      if (GENERIC_PHRASE_DENYLIST.has(key)) continue;
      const tokens = tokenize(key);
      if (tokens.length < 2) continue;
      // Require at least one non-stopword content token of length ≥ 4.
      if (!tokens.some((tok) => !STOPWORDS_EN.has(tok) && tok.length >= 4)) continue;
      seen.add(key);
      cleaned.push(trimmed);
      if (cleaned.length >= 12) break;
    }
    return cleaned;
  } catch {
    return [];
  }
}

// Pull literal anchor fragments straight from the labelled message — guarantees future
// verbatim repeats always match, even if the LLM generates only paraphrases. Strips
// punctuation/numbers, drops stopwords, returns the most distinctive 2-3 word windows
// plus the whole message if short enough.
const STOPWORDS_EN = new Set(['i','i\'m','im','a','an','and','or','but','the','to','of','in','on','at','is','are','was','were','be','been','being','it','this','that','my','your','our','their','me','you','he','she','we','they','him','her','them','for','with','as','so','if','do','does','did','have','has','had','will','would','should','could','can','just','very','really','some','any','all','no','yes','today','yesterday','love','like','want','need','feel','think','know','say','tell']);

// Phrases that match neutral/positive contexts and would cause false positives if learned.
// Drawn from observed false-flags (e.g. "i love" matching "i love pizza" after a bullying label).
// Keep this list tight — it's a small denylist of phrases that are too generic to be useful triggers.
const GENERIC_PHRASE_DENYLIST = new Set([
  'i love', 'love my', 'i like', 'i want', 'i need', 'i feel', 'i think',
  'i know', 'i say', 'i told', 'i told my', 'i have', 'i had', 'i did',
  'so much', 'very much', 'a lot', 'so sad', 'feel sad', 'so happy',
  'today i', 'yesterday i', 'i went', 'i was',
  'at school', 'in class', 'at home', 'with friends', 'my friend',
  'my mom', 'my dad', 'my brother', 'my sister', 'my parent',
  'it hurts', 'hurts me', 'help me', 'i\'m sad', 'im sad',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function literalFragmentsFromMessage(text: string): string[] {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length === 0) return [];

  const tokens = tokenize(trimmed);
  const out = new Set<string>();

  // Whole message if short enough — catches the exact repeat that triggered this label.
  if (trimmed.length <= 80 && tokens.length <= 8) {
    out.add(trimmed);
  }

  // 2- and 3-word windows around any non-stopword content token. Catches "got bullied"
  // out of "I got bullied today, again" and "feeling left out" out of longer messages.
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    if (a.length < 3 || STOPWORDS_EN.has(a)) continue;
    if (i + 1 < tokens.length) {
      const b = tokens[i + 1];
      out.add(`${a} ${b}`);
      if (i + 2 < tokens.length) out.add(`${a} ${b} ${tokens[i + 2]}`);
    }
    if (i - 1 >= 0) out.add(`${tokens[i - 1]} ${a}`);
  }

  return Array.from(out)
    .filter((p) => p.length >= 4 && p.length <= 80)
    .filter((p) => !GENERIC_PHRASE_DENYLIST.has(p))
    .slice(0, 6);
}

// Word stems with common English suffixes stripped. Used to derive root forms like
// "bull" from "bullied"/"bully"/"bullies", "harm" from "harming", "cutt" from "cutting".
// Hebrew/Russian morphology is much richer; for those languages we just lowercase and
// truncate to 5 chars (heuristic — works for most stems we see in kid messages).
const ENGLISH_SUFFIXES = ['ies', 'ied', 'ing', 'ers', 'ed', 'es', 'er', 'ly', 'ys', 's', 'y'];

function stemWord(w: string): string {
  const lower = w.toLowerCase();
  if (lower.length < 4) return lower;
  if (/^[֐-׿Ѐ-ӿ]/.test(lower)) {
    // Hebrew or Cyrillic — heuristic prefix only
    return lower.slice(0, Math.min(lower.length, 5));
  }
  for (const suf of ENGLISH_SUFFIXES) {
    if (lower.length - suf.length >= 3 && lower.endsWith(suf)) {
      return lower.slice(0, lower.length - suf.length);
    }
  }
  return lower;
}

// Stems we never want to learn from — too generic, would false-positive on neutral chat.
const GENERIC_STEM_DENYLIST = new Set([
  'love', 'lov', 'like', 'lik', 'want', 'need', 'feel', 'felt',
  'have', 'had', 'know', 'knew', 'think', 'thoug', 'said', 'tell',
  'today', 'toda', 'tomorrow', 'school', 'schoo', 'class', 'home',
  'play', 'work', 'time', 'nice', 'good', 'bad', 'happy', 'sad',
  'sometim', 'often', 'never', 'always', 'maybe',
  // Reflexives / pronouns — no signal on their own.
  'myself', 'yourself', 'himself', 'herself', 'themselves', 'ourselves', 'itself',
  'someon', 'anyon', 'everyon', 'everybo',
  // Discourse markers and time / quantity words.
  'really', 'just', 'still', 'usual', 'normal', 'often',
  'thing', 'something', 'anything', 'everything', 'nothing',
  // Random gibberish from earlier seed/test messages
  'ksgsgx',
]);

// Pull single-word stems from a labelled message — distinctive content words only.
// These get saved with match_kind='stem' and matched word-aware at runtime, which
// gives typo + verb-form tolerance (e.g. "bull" catches bully/bullies/bullied/bulliex).
export function stemTriggersFromMessage(text: string): string[] {
  const tokens = tokenize(text);
  const out = new Set<string>();
  for (const tok of tokens) {
    if (tok.length < 5) continue; // root must be derivable & long enough to be specific
    if (STOPWORDS_EN.has(tok)) continue;
    const stem = stemWord(tok);
    if (stem.length < 4) continue;
    if (GENERIC_STEM_DENYLIST.has(stem)) continue;
    out.add(stem);
  }
  return Array.from(out).slice(0, 4);
}

// Persist learned phrases for a school. Uniqueness is enforced at DB level so re-labelling
// the same kind of message doesn't multiply rows. Returns count inserted.
// `match_kind` defaults to 'phrase' (substring match); pass 'stem' for word-prefix match.
export function saveLearnedPatterns(opts: {
  schoolId: string;
  labelId: string;
  category: string;
  severity: SafetySeverity;
  phrases: string[];
  language: string | null;
  matchKind?: 'phrase' | 'stem';
}): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO safety_learned_patterns
       (id, school_id, pattern, pattern_lower, category, severity, language, created_from_label_id, hit_count, last_hit_at, created_at, match_kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
  );
  const now = new Date().toISOString();
  const kind = opts.matchKind ?? 'phrase';
  let added = 0;
  for (const p of opts.phrases) {
    const id = crypto.randomUUID();
    const r = insert.run(id, opts.schoolId, p, p.toLowerCase(), opts.category, opts.severity, opts.language, opts.labelId, now, kind);
    if (r.changes > 0) added++;
  }
  return added;
}
