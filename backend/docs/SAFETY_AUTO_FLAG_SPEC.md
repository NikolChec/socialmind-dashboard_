# Auto-Flag Safety Pattern Spec

This document is the source of truth for how SocialMind's adaptive safety filter learns from psychologist labels. It covers the LLM prompt rules, the literal-fragment extractor, false-positive guardrails, scoping, and pruning.

The goal: when a clinician labels a kid's message at a severity, the system must auto-flag *similar* future messages without further human work, with low false-positive rate.

---

## Architecture (3 layers, evaluated in order)

1. **Static regex bank** (`backend/src/services/safety.ts`)
   Universal patterns in EN/HE/RU. Hand-curated. Catches the obvious: `kill myself`, `cut myself`, `kill X`, `drank vodka`, `they bully me`, etc.

2. **Literal anchors from labeled message** (`literalFragmentsFromMessage` in `safety_learn.ts`)
   Saved synchronously the moment the psychologist labels. Guarantees verbatim repeats always match, even if the LLM call fails or is slow.

3. **LLM-generated paraphrases** (`extractTriggerPhrases` in `safety_learn.ts`)
   Saved asynchronously after the response is sent. Generates 6-12 paraphrases via local `aya-expanse:8b`. Catches semantic variations the literal anchors miss.

All 3 layers' results union together. Highest severity wins. Substring (case-insensitive) match.

---

## Layer 2: Literal anchor rules

Run on the labeled message immediately on label.

- **Whole message** included if ≤80 chars and ≤8 tokens.
- **2-word and 3-word windows** anchored on each non-stopword token of length ≥3. Captures `got bullied`, `feel left`, `cut myself` out of longer messages.
- **Stopword set**: `i, im, a, an, and, the, to, of, is, are, my, your, me, you, he, she, we, they, for, with, today, yesterday, very, really, just, no, yes, ...` — keeps semantic-empty bigrams out.
- **Cap**: 6 fragments per label.
- **Minimum length**: 4 chars (avoids noise like `to be`).
- **No first names, no numbers** stripped via regex.

---

## Layer 3: LLM prompt — required behavior

### System prompt (the AI MUST follow these rules)

You are a safety-pattern extractor for a kids' mental-health app. A clinician labels a child's message at a severity (safe/low/medium/high/critical) and a category. Your job: produce phrases that should match *similar* future messages.

#### Output rules (strict — non-compliance breaks the system)

1. **Output ONLY a JSON array of strings**. No prose, no code fences, no explanation, no leading/trailing text.
2. **6 to 12 phrases**. Less is better than padding with junk.
3. **Each phrase: 2 to 6 words, 4 to 80 characters**.
4. **Same language as the source message** (EN, HE, or RU). Never translate.
5. **Lowercase preferred**, but case-insensitive match is applied either way.

#### Coverage requirements (cover these in 6-12 phrases)

1. **Tense / number variations** of the trigger verb:
   - `got bullied` → also `getting bullied`, `was bullied`, `am being bullied`
   - `cut myself` → also `cutting myself`, `cuts on my arm`
2. **Common synonyms** that preserve meaning:
   - `bullied` ↔ `picked on`, `teased`, `made fun of`
   - `sad` ↔ `down`, `unhappy`, `miserable`
   - `friend` ↔ `classmate`, `kid`, `person`
3. **Pronoun and possessive variants**: `me`/`myself`, `my`/`mine`.
4. **Trigger fragments** that signal the concern even out of context: `cuts on arm`, `feel like dying`, `not loved at school`.

#### Forbidden content (will be rejected)

- **First names, school names, street names, phone numbers, dates** — the pattern must work for any kid in any school.
- **Single-word phrases** unless that single word is itself a strong, rare signal (e.g. `suicide`, `overdose`).
- **Generic emotion stems**: `i feel`, `i love`, `i think`, `today i`, `it hurts`, `so sad`. These match neutral chat and cause false positives. **Each phrase must contain at least one specific noun, verb, or modifier tied to the labeled category** — not just an emotion stem.
- **Polite/positive contexts**: `i love my mom` for a `bullying` label is not a trigger. The phrase must still indicate the *problem*, not the surrounding wrapper text.
- **Phrases that would match in a clearly safe context**: `i was happy` for `distress` is wrong.
- **Non-content tokens alone**: `today`, `at school`, `with friends` — anchor only fires on the *combination* with category-specific words.

#### False-positive guardrails

Before outputting each phrase, ask: "Could a kid say this in a fully harmless context?"
- If yes → drop it.
- Example: `i was scared` is too broad (kids get scared by spiders, movies). `scared to go home` is specific to abuse — keep.
- Example: `feel alone` is too broad. `feel alone at school` is concrete — keep.

#### Severity calibration

The severity you receive is the ceiling for these patterns. Don't generate phrases that imply a *higher* severity than the label:
- For `medium/bullying`: don't extract phrases like `i want to die` (that's `critical/self_harm`, separate category).
- For `low/distress`: don't extract phrases that would suggest active suicidality.

#### Examples (target output style)

Input — `severity=critical, category=self_harm, message="Sometimes I cut myself"`

Good output:
```json
["cut myself","cutting myself","cuts on my arm","i hurt myself","harm myself","cuts on my wrist","slit my wrist","cutting helps me"]
```

Bad output (don't do this):
```json
["sometimes","i feel","i cut","myself a lot","i love cutting","feeling sad"]
```
Why bad: `sometimes`/`i feel` are generic, `i cut` is too short to disambiguate, `i love cutting` would never appear from a kid in distress.

Input — `severity=medium, category=bullying, message="I got bullied"`

Good output:
```json
["got bullied","getting bullied","was bullied","being bullied","picked on","made fun of me","they bully me","kids tease me"]
```

Bad output:
```json
["i got","bullied","at school","i feel","bullied today","i am bullied"]
```
Why bad: `i got` matches everything (`i got pizza`); `bullied` alone is too short and could be the AI's own reply quoting the kid; `at school` is non-specific.

Input — `severity=medium, category=bullying, message="אני מקבל מכות מילדים"` (Hebrew: "I'm getting hit by kids")

Good output:
```json
["מקבל מכות","מכות מילדים","ילדים מרביצים לי","מכים אותי","פוחד מהילדים"]
```

#### Multilingual rules

- Match the message language exactly. Don't translate, don't transliterate.
- Hebrew/Russian: include morphologically common forms (Hebrew gender variants, Russian conjugations).
- Mixed-language messages: extract from the dominant language, optionally a fragment in the other.

---

## What's stored

`safety_learned_patterns` table, scoped by `school_id`:

| column | meaning |
|---|---|
| `pattern` | original casing |
| `pattern_lower` | used at match time (case-insensitive) |
| `category` | one of: self_harm, abuse, violence, sexual, bullying, hopelessness, distress, eating_disorder, substance_use, medical_advice, pii_leak, language_drift |
| `severity` | safe / low / medium / high / critical |
| `created_from_label_id` | traces back to the originating clinician label |
| `hit_count` | bumped each time the pattern fires on a future message |
| `last_hit_at` | timestamp of most recent hit |

`UNIQUE(school_id, pattern_lower, severity, category)` so re-labeling the same message doesn't duplicate rows.

---

## Match-time behavior (`applyLearnedPatterns`)

1. Lowercase the new message.
2. Load all learned patterns for the message's school.
3. For each pattern: substring match on `pattern_lower`. If hit, record `category`, `severity`, bump `hit_count`.
4. Combine with the static regex result. Final severity = max across all hits.
5. Categories union, phrases concat (capped).

---

## Pruning (manual, weekly)

Patterns to consider removing:
- `hit_count > 0` but `false-positive rate ≥ 50%` based on subsequent psychologist re-labeling to `safe`.
- `hit_count = 0` for >90 days **and** length <8 chars (likely too vague to ever match).
- Any pattern flagged by the clinical team as harmful.

The endpoint `GET /api/children/safety-patterns/learned` returns the full bank ordered by `hit_count DESC` for human review.

---

## Privacy & scoping

- Patterns are **per-school**. School A never sees or uses School B's patterns.
- Patterns never include child-identifiable content (no first names, school names, phone numbers).
- Labels are auditable in `safety_labels` with `labeled_by` user reference.
- LLM extraction runs on the local Ollama instance — no kid messages leave the server.

---

## Failure modes & recovery

- **Ollama down or slow**: literal anchors still get saved synchronously, so the labeling action is never lost. LLM phrases will be missing for that label until the clinician re-labels (or runs the backfill script).
- **Bad LLM output (non-JSON)**: extraction returns `[]`, no phrases saved, label still records.
- **Duplicate phrases**: handled at DB level (`UNIQUE` constraint). Re-labeling is idempotent.
- **Backfill script** (`scripts/backfill-safety-literals.ts`): re-derives literal anchors for all existing labels. Safe to re-run anytime — uniqueness prevents duplicates.

---

## When NOT to label

- **A `safe` label** doesn't generate any patterns (we never want to teach the model "this kind of message is fine"). It only updates the message's flags + audit trail.
- **A label on the AI's reply** — only the kid's own messages get learned from. The labeling button only appears next to child-role messages in the dashboard.
