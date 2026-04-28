import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initSchema } from './db/schema.js';
import { authRouter } from './routes/auth.js';
import { childrenRouter } from './routes/children.js';
import { alertsRouter } from './routes/alerts.js';
import { analyticsRouter } from './routes/analytics.js';
import { assistantRouter } from './routes/assistant.js';
import { ingestRouter } from './routes/ingest.js';
import { queueRouter } from './routes/queue.js';
import { contactsRouter } from './routes/contacts.js';
import { auditRouter } from './routes/audit.js';
import { reportsRouter } from './routes/reports.js';
import { streamRouter } from './routes/stream.js';
import { adminRouter } from './routes/admin.js';
import { childRouter } from './routes/child.js';
import { isStubbed } from './services/notifications.js';

initSchema();

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Dev mode: permissive — accept any origin so demos via ngrok / LAN / etc. work out of the box.
    if (isDev) return cb(null, true);
    return cb(new Error(`origin_not_allowed: ${origin}`));
  },
  credentials: true,
  maxAge: 600,
}));

app.use(helmet({
  contentSecurityPolicy: false, // API-only service; Vite serves frontend in dev
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(express.json({ limit: '4mb' }));

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
app.use('/api/', globalLimiter);

const reportLimiter = rateLimit({
  windowMs: 60_000, max: 10,
  keyGenerator: (req) => req.headers.authorization ?? req.ip ?? 'anon',
  message: { error: 'too_many_reports' },
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/children', childrenRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/queue', queueRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/reports', reportLimiter, reportsRouter);
app.use('/api/stream', streamRouter);
app.use('/api/admin', adminRouter);
app.use('/api/child', childRouter);

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`[socialmind] backend listening on http://localhost:${PORT}`);
  console.log(`[socialmind] allowed origins: ${allowedOrigins.join(', ')}`);
  if (isStubbed()) {
    console.log('[socialmind] notifications in STUB mode — SMS/Push will log to console.');
  }
});
