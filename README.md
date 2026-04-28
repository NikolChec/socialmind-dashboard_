# SocialMind — Clinician App (MVP)

Psychologist-facing dashboard for the SocialMind VR program. Monitors children's social-skills training sessions, surfaces safety alerts, and includes a local AI assistant.

**Scope:** This is the companion app only. The VR + Convai + moderation server are separate systems. This MVP ships with **mocked** session data that matches the contract the real moderation server will use.

## Stack

- **Backend:** Node.js + Express + TypeScript + SQLite (`better-sqlite3`) + JWT auth
- **Frontend:** React + Vite + TypeScript + Tailwind + Recharts + React Router
- **AI assistant:** Ollama (local LLM, default `llama3.1:8b`)
- **Shared types:** workspace package used by backend, frontend, and seed

## Folder layout

```
.
├── shared/      # TS types used everywhere (Session, Child, Alert, etc.)
├── backend/     # Express API (port 4000)
├── frontend/    # React app (port 5173)
├── seeds/       # Script that generates realistic mock data
└── socialmind.db  # created on first run
```

## Quick start

```bash
# 1. install deps (workspaces)
npm install

# 2. generate mock data
npm run seed

# 3. (one-time, in a separate terminal) install Ollama + pull model
#    https://ollama.com — once installed:
ollama pull aya-expanse:8b   # multilingual (EN/HE/RU), recommended default
# OR for English-only setups:
# ollama pull llama3.1:8b
ollama serve   # keep running; defaults to http://localhost:11434

# 4. run backend + frontend
npm run dev
# → backend  http://localhost:4000
# → frontend http://localhost:5173
```

## Demo accounts

All passwords: `password123`

| Email | Role |
|---|---|
| `admin@herzl.school` | School admin |
| `ron@herzl.school` | Psychologist |
| `tamar@herzl.school` | Psychologist |
| `avi@herzl.school` | Psychologist |

## Features

- **Dashboard** — caseload stats, recent open alerts, quick child links.
- **Children list** — searchable, shows open-alert counts and last-session times.
- **Child detail** — progress chart (4 toggle-able metrics), session list + transcript viewer, alert history, focused AI assistant.
- **Alert inbox** — all flagged moments, sorted by priority (high/medium/low). High-priority items get visual emphasis. Reviewable with one click.
- **AI assistant** — ask natural-language questions about a child or your whole caseload; runs locally via Ollama.
- **Role-based access** — psychologists see only their assigned children; school admins see everything in their school.

## Mock server contract (ingest endpoint)

The real moderation server will eventually POST to this endpoint when a VR session ends:

```
POST /api/ingest/session
Header: x-ingest-key: <INGEST_KEY>
```

Payload shape is defined in [`shared/src/index.ts`](shared/src/index.ts) as `ServerIngestPayload`:

```ts
{
  child_id: string;
  session_id: string;
  scenario: ScenarioType;
  started_at: ISODate;
  ended_at: ISODate;
  scenario_success: boolean;
  metrics: {
    response_latency_avg_ms: number;   // proxy for hesitation/anxiety
    talk_time_ratio: number;           // child speech / total (0-1)
    word_count: number;
    unique_words: number;
    sentiment_score: number;           // -1..1
  };
  transcript: Array<{ speaker: 'ai'|'child'; text: string; ts: ISODate }>;
  alerts: Array<{                       // moderation findings
    priority: 'high'|'medium'|'low';
    type: AlertType;
    excerpt: string;
    context: string;
  }>;
  ai_character_name: string;
}
```

**Progress metrics are computed in the backend** from the raw session data — see [`backend/src/routes/children.ts`](backend/src/routes/children.ts) `/:id/progress`. Currently: daily averages of latency, talk ratio, scenario success rate, sentiment.

## Environment variables (optional)

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Backend port |
| `JWT_SECRET` | `dev-secret-change-me` | **Change in production** |
| `INGEST_KEY` | `dev-ingest-key` | Header secret for `/api/ingest/session` |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `aya-expanse:8b` | Default chat model. Use a multilingual model (aya-expanse, qwen2.5) if you serve non-English users |
| `OLLAMA_CHILD_MODEL` | (same as `OLLAMA_MODEL`) | Override the model used specifically by the child app's Helper chat |
| `DB_PATH` | `./socialmind.db` | SQLite file |

## What's stubbed vs real

| Thing | Status |
|---|---|
| Auth (JWT) | Real |
| Children / sessions / alerts API | Real |
| Progress graph | Real (computed from sessions) |
| Alert inbox | Real |
| AI assistant | Real (needs Ollama running) |
| Ingest endpoint for future VR server | Real contract — ready for the real server |
| **SMS / push notifications** | **Stubbed** — only in-app for now; wire to Twilio/FCM later |
| **Session data** | **Mocked** via seed script |
| **Real moderation server** | **Not built yet** |

## Notes on the future VR side

When the Convai + moderation server lands, it should:
1. Assign `session_id` at session start.
2. Moderate each child utterance → emit `alert` entries with priority + type.
3. Compute session metrics + `scenario_success`.
4. POST the full payload to `POST /api/ingest/session` with `x-ingest-key`.

No app-side code changes required — only config.

## Next steps (post-MVP)

- SMS/push integration for high-priority alerts (Twilio + FCM).
- Parent role + child self-view (planned for phase 2).
- Scheduling/notes per child per session.
- Mobile wrappers (Expo or React Native) — the app was designed with this in mind.
- Desktop wrapper via Tauri — no frontend changes needed.
- Multi-school tenancy admin UI.
