# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What SocialMind is

A school-facing platform where kids practice social skills in VR scenarios and continue in a phone companion app with a helper chat. **This repo is the staff dashboard** (admin / psychologist / teacher / parent web app) plus the Express backend they all share. The kid's VR headset talks to the same backend through `/api/convai`; the phone companion app lives in a separate workspace (`SOCIALMIND-CHILD_APP`, not in this repo) but logs in against `/api/child/*` here.

Live dashboard: https://dashboard.social-mind.org

## Workspaces

Monorepo via npm workspaces, declared in the root `package.json`:

- `shared/` — `@socialmind/shared`. Pure TS types/constants. Both backend and frontend alias-import this directly from source (`../shared/src/index.ts`) via tsconfig paths + Vite alias — no build step is needed during dev.
- `backend/` — `@socialmind/backend`. Express + better-sqlite3 + JWT. Single SQLite file at `socialmind.db` in the repo root.
- `frontend/` — `@socialmind/frontend`. React 18 + Vite + Tailwind + i18next (en/he/ru). Also ships as an Electron desktop app for the dashboard.
- `seeds/` — `@socialmind/seeds`. CLI scripts that build/reset the dev SQLite DB with demo data.
- `SOCIALMIND-CHILD_APP` — declared as a workspace but lives outside this repo. Only relevant when running `npm run dev:all` or `npm run dev:child` (will fail if the directory isn't present).

## Common commands

Run from the repo root unless noted.

```bash
# One-shot setup that installs Homebrew/Ollama if missing, pulls the aya-expanse:8b model,
# seeds the DB if absent, kills anything on :4000, and starts the backend in the background.
./start-socialmind.sh
./stop-socialmind.sh

# Standard dev — backend + dashboard concurrently
npm run dev                # backend (:4000) + frontend (:5173)
npm run dev:all            # + child app (:5174) — needs SOCIALMIND-CHILD_APP workspace present
npm run dev:backend        # backend only (tsx watch)
npm run dev:frontend       # frontend only (vite)

# DB
npm run seed                          # build socialmind.db with demo school/users/children/sessions/alerts
npm run seed:clean -w seeds           # WIPE EVERYTHING and create ONE admin from $ADMIN_EMAIL/$ADMIN_PASSWORD/$ADMIN_NAME
                                      # (defaults baked into reset-clean.ts) — does NOT reseed demo data

# Build everything (shared → backend → frontend → child)
npm run build

# Electron desktop dashboard
npm run electron:dev -w frontend       # dev shell
npm run electron:build -w frontend     # signed .app for macOS (release/mac-arm64/)
```

There is **no test suite** and **no linter** wired up. Don't invent commands; if you need to verify a change, run `tsc -b` inside the relevant workspace or hit the API with `curl`.

## Default credentials (dev only — from `seeds/seed.ts`)

- Dashboard users (admin / psych / teacher / parent): password `password123`. Login accepts email **or** plain name (e.g. `Admin`).
- Child companion logins: password `child123`.
- Seed prints the full account list at the end of `npm run seed`.

## Architecture — what to know before editing

### Backend layout

`backend/src/index.ts` is the only entry. It calls `initSchema()` (idempotent SQLite migrations — see below), then mounts routers under `/api/<name>`. Every router lives in `backend/src/routes/` and is named for its mount point. Cross-cutting logic lives in `backend/src/services/`.

The backend is a **single Express process backed by one SQLite file**. There is no queue, no Redis, no separate worker. Real-time fan-out for the dashboard is in-process SSE (`services/events.ts` + `routes/stream.ts`).

### Schema is code, not migrations

`backend/src/db/schema.ts` runs on every boot. It uses `CREATE TABLE IF NOT EXISTS` for new tables and a `columnExists()` / `tableExists()` helper to gate `ALTER TABLE ADD COLUMN` calls for evolutions. **There is no migration tool.** To change the schema:

1. Add `CREATE TABLE IF NOT EXISTS …` for new tables in the main `db.exec` block.
2. For new columns on existing tables, add another `if (!columnExists(...)) db.exec('ALTER TABLE … ADD COLUMN …')` block further down. Order matters — later blocks can rely on earlier ones.
3. Backfill via plain SQL in the same function if needed (existing pattern: backfilling `child_psychologists` from the legacy `children.psychologist_id`).
4. Update `seeds/seed.ts` so a fresh DB matches the post-migration shape.

### Roles, access, and the "shared child" model

Roles are `school_admin | psychologist | parent | teacher` (defined in `shared/src/index.ts`). A child can have multiple psychologists, multiple parents, and multiple teachers — relationships live in the join tables `child_psychologists`, `child_parents`, `child_teachers`. `children.psychologist_id` is the legacy "primary" pointer kept for backwards compatibility; the join tables are the source of truth.

Always go through `userCanAccessChild(userId, childId, role)` in `backend/src/middleware/auth.ts` rather than open-coding access checks. Teacher access is further gated by `teacherHasPermission(teacherId, childId, scope)` — teachers must have an approved row in `permission_requests` for the relevant scope (`helper_chats | alerts | sessions | missions | full`). Psychologists approve those requests in the dashboard. `canSeePrivateFromParents(role)` controls whether content the child marked private from parents is visible (psych + admin only).

### Auth

Email/username + bcrypt password → JWT (8h TTL, `Bearer` header). 2FA is per-user, enabled by the admin in `/admin`; when on, `/api/auth/login` returns `requires_2fa: true` + an `otp_token`, and the client posts to `/api/auth/verify-otp` with the 6-digit code emailed via SMTP (`services/otp.ts` + `services/email.ts`). There's no "trusted device" bypass — every login goes through 2FA if it's enabled.

Account lockout is in `routes/auth.ts`: 5 failed attempts in 15 minutes → 30-minute lock (relaxed in dev to 25 attempts / 2 min). `JWT_SECRET` defaults to `dev-secret-change-me`; the process refuses to start in production if that default is still in place.

### Safety pipeline (the part that's load-bearing)

The clinical value of the platform comes from auto-flagging concerning things kids say to the helper or to VR characters. Pipeline is documented in `backend/docs/SAFETY_AUTO_FLAG_SPEC.md` — **read it before touching `services/safety.ts` or `services/safety_learn.ts`**. Three layers, evaluated in order, highest severity wins:

1. **Static regex bank** (`services/safety.ts`) — universal patterns across EN/HE/RU.
2. **Literal anchors** — saved synchronously when a psychologist labels a message (whole message + 2/3-word windows on non-stopword anchors). Guarantees verbatim repeats match immediately.
3. **LLM paraphrases** — extracted async via local Ollama (`aya-expanse:8b`) and stored per-school in `safety_learned_patterns`. Generated phrases are scoped to the school that produced the label — never global.

Severity ladder: `safe | low | medium | high | critical`. `critical` and `high` trigger alerts; the rest are logged. Same pipeline applies to the helper chat (`routes/child.ts`) and to VR turns coming through `routes/convai.ts`.

### ConvAI bridge (`routes/convai.ts`)

This route exposes an **OpenAI-Chat-Completions–compatible** streaming endpoint that the ElevenLabs ConvAI character calls as its "Custom LLM Endpoint." It is **not** a naive proxy — every request:

1. Authenticates via `X-Convai-Key` matching `CONVAI_API_KEY`.
2. Safety-checks the kid's last user message; on critical/high, logs an alert and returns a safe placeholder reply instead of forwarding to the LLM.
3. PII-redacts the conversation to opaque ids (`services/redaction.ts`) before sending to Ollama.
4. Streams from Ollama, buffers to sentence boundaries, safety-checks each emitted sentence.
5. Restores opaque ids → real names **before** the chunk reaches ConvAI for TTS.
6. Persists anonymized turns to `vr_turns`.

The in-memory `sessionMaps` (opaque-id ↔ real-name) lives only in process memory. That's intentional: PII never persists.

### LLM dependency

The backend calls a **local Ollama at `http://localhost:11434`** for the assistant, the child helper, ConvAI replies, and the safety pattern extractor. Default model is `aya-expanse:8b` (multilingual; strong on Hebrew/Russian). Override with `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_CHILD_MODEL`, `OLLAMA_VR_MODEL`. The launchers will install/pull Ollama + the model on first run.

### Frontend

`frontend/src/App.tsx` is the route map. `lib/auth.tsx` holds the `AuthProvider` + token storage (`localStorage` key `socialmind.token`). All HTTP goes through `lib/api.ts`, which targets `/api/*` (proxied to `:4000` by Vite in dev) or `VITE_API_BASE` in builds — Electron's production build sets it to `http://localhost:4000` so the desktop app talks to a local backend.

i18n strings live in `frontend/src/i18n/{en,he,ru}.json`. When adding user-visible copy, add keys to **all three** files; missing keys silently fall back to the key string.

The dashboard subscribes to real-time alerts via SSE: it `POST`s `/api/stream/ticket` (auth'd) to get a one-shot ticket, then opens an `EventSource` on `/api/stream/alerts?ticket=…` (EventSource can't send custom headers, hence the ticket pattern).

### Electron packaging

The dashboard ships as a Mac app via `electron-builder` (`frontend/electron-builder.json`). `frontend/electron/main.cjs` is the Electron entry. The `.app` bundles the Vite production build and points at a local backend. Launchers in `launchers/` are `.app` bundles + shell scripts (`_bootstrap.sh`, `run-dashboard.sh`, `run-child.sh`) that boot Homebrew/Ollama/the backend and then `open` the Electron app. Don't conflate the launcher app bundles (just shell wrappers) with the actual Electron-built dashboard app (in `frontend/release/mac-arm64/` after `electron:build`).

### Deploy

`deploy/` holds the production layout: nginx in front of PM2-managed `backend/dist/index.js` (`pm2.config.cjs`), `server-setup.sh` to provision an Ubuntu box, `upload-to-server.sh` to push a tarball. Nothing in this directory is exercised by local dev; treat it as the prod runbook.

## Environment variables

Read at runtime from `process.env`. Backend uses:

- `PORT` (default 4000), `NODE_ENV`, `ALLOWED_ORIGINS` (comma-separated; dev accepts any origin)
- `JWT_SECRET` — required in production
- `DB_PATH` (default: `socialmind.db` in repo root)
- `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_CHILD_MODEL`, `OLLAMA_VR_MODEL`
- `CONVAI_API_KEY` — required for `/api/convai/*`; if unset, those routes return 503
- `INGEST_KEY` — shared secret for the VR headset's `/api/ingest` POSTs (sent as the `x-ingest-key` header; defaults to `dev-ingest-key` if unset)
- `SMTP_*` — for 2FA emails; falls back to console-log stub when missing
- `TWILIO_*`, `FCM_SERVER_KEY` — optional SMS/push; stubbed when missing (logs `[socialmind] notifications in STUB mode` at boot)

Frontend build-time: `VITE_API_BASE`.

## Conventions worth keeping

- ESM everywhere (`"type": "module"`). Backend imports use `.js` extensions even when the source is `.ts` (TS resolves them; required for ESM runtime).
- `zod` for request validation in every route handler before touching the DB. Don't trust `req.body`.
- Audit every state change via `auditFor(req)(…)` from `services/audit.ts` — the `/audit` page reads this directly.
- Don't add a separate migration system; follow the `columnExists` / `tableExists` pattern in `schema.ts`.
- When you change a `shared/` type, both frontend and backend rebuild automatically since they import from source — no `npm run build -w shared` needed during dev.
