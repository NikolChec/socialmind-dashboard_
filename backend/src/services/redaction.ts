// PII pseudonymization for VR conversations.
// In-memory per-session map: real name <-> opaque id. The map lives only in process memory;
// what's persisted (audit logs, vr_turns table) only ever sees the opaque ids.
//
// Two directions:
//   redactInput(text, sessionMap)  — strip names/ages/phones BEFORE sending to LLM
//   restoreOutput(text, sessionMap) — substitute opaque ids back to real names BEFORE TTS,
//                                     so the character speaks naturally to the kid.

import crypto from 'node:crypto';

export type SessionRedactionMap = {
  // real name (lowercased) -> opaque id, e.g. "dana" -> "id_a8f2c1"
  byName: Map<string, string>;
  // reverse, e.g. "id_a8f2c1" -> "Dana" (preserves original casing for TTS)
  byId: Map<string, string>;
};

export function newRedactionMap(): SessionRedactionMap {
  return { byName: new Map(), byId: new Map() };
}

function newOpaqueId(): string {
  return 'id_' + crypto.randomBytes(3).toString('hex');
}

// Register a real name and return its opaque id (creates new id on first sight).
export function registerName(map: SessionRedactionMap, name: string): string {
  const key = name.trim().toLowerCase();
  const existing = map.byName.get(key);
  if (existing) return existing;
  const id = newOpaqueId();
  map.byName.set(key, id);
  map.byId.set(id, name.trim()); // keep original casing for restoreOutput
  return id;
}

// Heuristic: words that look like proper names (capitalized in English, or
// follow Hebrew/Russian patterns we know about). Conservative — false negatives
// are fine, false positives (over-redacting) is worse for conversation quality.
const NAME_HINTS = [
  // "I'm <Name>" / "my name is <Name>" / "this is <Name>" — English
  /\b(?:i'?m|i am|my name is|this is|call me)\s+([A-Z][a-zA-Z'-]{1,29})\b/g,
  // "Меня зовут <Имя>" / "Я <Имя>" — Russian
  /(?:меня\s+зовут|я\s+это|я)\s+([А-ЯЁ][а-яё-]{1,29})/giu,
  // "קוראים לי <שם>" / "אני <שם>" — Hebrew
  /(?:קוראים\s+לי|שמי|אני)\s+([֐-׿]{2,30})/gu,
];

const AGE_PATTERNS = [
  /\b(\d{1,2})\s*(?:y\.?o\.?|years?\s+old)\b/gi,
  /\b(?:אני\s+בן|אני\s+בת)\s+(\d{1,2})\b/gu,
  /\bмне\s+(\d{1,2})\s*(?:лет|года|год)?\b/giu,
];

const PHONE_PATTERN = /\b(?:\+?972[\s-]?)?0?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b/g;

const ADDRESS_PATTERN = /\b\d{1,3}\s+\w+\s+(?:street|st|road|rd|avenue|ave|רחוב|улица)\b/gi;

// Replace identifying tokens in `text` with opaque ids / placeholders.
// Names are tracked across the session (so the SAME name maps to the SAME id every turn).
export function redactInput(text: string, map: SessionRedactionMap): string {
  let out = text;

  // 1. Names — register and replace with id_xxxxxx
  for (const rx of NAME_HINTS) {
    out = out.replace(rx, (full, name) => {
      const id = registerName(map, name);
      return full.replace(name, id);
    });
  }
  // Also catch any remaining mention of names already registered
  for (const [lcName, id] of map.byName) {
    const realName = map.byId.get(id) ?? lcName;
    const rx = new RegExp(`\\b${escapeRegExp(realName)}\\b`, 'gi');
    out = out.replace(rx, id);
  }

  // 2. Ages — replace with [age]
  for (const rx of AGE_PATTERNS) out = out.replace(rx, '[age]');

  // 3. Phones, addresses — replace with placeholders
  out = out.replace(PHONE_PATTERN, '[phone]');
  out = out.replace(ADDRESS_PATTERN, '[address]');

  return out;
}

// Replace opaque ids back to real names so the AI character can address the kid naturally.
// Only used for output that goes to TTS — never used for output that goes to logs.
export function restoreOutput(text: string, map: SessionRedactionMap): string {
  if (map.byId.size === 0) return text;
  let out = text;
  for (const [id, realName] of map.byId) {
    out = out.replace(new RegExp(`\\b${id}\\b`, 'g'), realName);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
