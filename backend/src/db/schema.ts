import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../socialmind.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function columnExists(table: string, col: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === col);
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('school_admin','psychologist','parent')),
      password_hash TEXT NOT NULL,
      phone TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      psychologist_id TEXT NOT NULL REFERENCES users(id),
      display_name TEXT NOT NULL,
      grade INTEGER NOT NULL,
      date_of_birth TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      scenario TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_sec INTEGER NOT NULL,
      scenario_success INTEGER NOT NULL,
      completed INTEGER NOT NULL,
      metrics_json TEXT NOT NULL,
      transcript_json TEXT NOT NULL,
      ai_character_name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_child ON sessions(child_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      session_id TEXT REFERENCES sessions(id),
      priority TEXT NOT NULL CHECK(priority IN ('high','medium','low')),
      type TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      context TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged_at TEXT,
      acknowledged_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_child ON alerts(child_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_unack ON alerts(acknowledged_at, priority, created_at DESC);
  `);

  if (!columnExists('sessions', 'notes')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN notes TEXT NOT NULL DEFAULT ''`);
  }
  if (!columnExists('alerts', 'action_taken')) {
    db.exec(`ALTER TABLE alerts ADD COLUMN action_taken TEXT`);
  }
  if (!columnExists('alerts', 'action_note')) {
    db.exec(`ALTER TABLE alerts ADD COLUMN action_note TEXT`);
  }
  if (!columnExists('users', 'fcm_token')) {
    db.exec(`ALTER TABLE users ADD COLUMN fcm_token TEXT`);
  }
  if (!columnExists('users', 'failed_login_attempts')) {
    db.exec(`ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnExists('users', 'last_failed_login')) {
    db.exec(`ALTER TABLE users ADD COLUMN last_failed_login TEXT`);
  }
  if (!columnExists('users', 'locked_until')) {
    db.exec(`ALTER TABLE users ADD COLUMN locked_until TEXT`);
  }
  if (!columnExists('children', 'is_sensitive')) {
    db.exec(`ALTER TABLE children ADD COLUMN is_sensitive INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnExists('children', 'username')) {
    db.exec(`ALTER TABLE children ADD COLUMN username TEXT`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_children_username ON children(username) WHERE username IS NOT NULL`);
  }
  if (!columnExists('children', 'password_hash')) {
    db.exec(`ALTER TABLE children ADD COLUMN password_hash TEXT`);
  }
  if (!columnExists('children', 'preferred_lang')) {
    db.exec(`ALTER TABLE children ADD COLUMN preferred_lang TEXT NOT NULL DEFAULT 'en'`);
  }
  if (!columnExists('audit_log', 'ip')) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN ip TEXT`);
  }
  if (!columnExists('audit_log', 'user_agent')) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN user_agent TEXT`);
  }

  // Migrate users.role CHECK constraint if it doesn't include 'parent'
  const usersSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get() as { sql: string } | undefined)?.sql || '';
  if (!usersSql.includes("'parent'")) {
    db.exec(`
      BEGIN;
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL REFERENCES schools(id),
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('school_admin','psychologist','parent')),
        password_hash TEXT NOT NULL,
        phone TEXT,
        fcm_token TEXT,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        last_failed_login TEXT,
        locked_until TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO users_new (id, school_id, email, name, role, password_hash, phone, fcm_token, failed_login_attempts, last_failed_login, locked_until, created_at)
        SELECT id, school_id, email, name, role, password_hash, phone,
               COALESCE(fcm_token, NULL),
               COALESCE(failed_login_attempts, 0),
               COALESCE(last_failed_login, NULL),
               COALESCE(locked_until, NULL),
               created_at
        FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      COMMIT;
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS child_parents (
      child_id TEXT NOT NULL REFERENCES children(id),
      parent_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (child_id, parent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_child_parents_parent ON child_parents(parent_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sse_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sse_tickets_expires ON sse_tickets(expires_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS scenario_queue (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      scenario TEXT NOT NULL,
      assigned_by TEXT NOT NULL REFERENCES users(id),
      assigned_at TEXT NOT NULL,
      consumed_at TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_queue_child ON scenario_queue(child_id, consumed_at, assigned_at DESC);

    CREATE TABLE IF NOT EXISTS parent_contacts (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      logged_by TEXT NOT NULL REFERENCES users(id),
      contacted_at TEXT NOT NULL,
      method TEXT NOT NULL,
      person TEXT NOT NULL,
      topic TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_child ON parent_contacts(child_id, contacted_at DESC);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      child_id TEXT REFERENCES children(id),
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_child ON audit_log(child_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

    CREATE TABLE IF NOT EXISTS risk_snapshots (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      snapshot_date TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      unread_high INTEGER NOT NULL DEFAULT 0,
      unread_medium INTEGER NOT NULL DEFAULT 0,
      unread_low INTEGER NOT NULL DEFAULT 0,
      sentiment_avg REAL,
      UNIQUE (child_id, snapshot_date)
    );
    CREATE INDEX IF NOT EXISTS idx_risk_child ON risk_snapshots(child_id, snapshot_date);

    CREATE TABLE IF NOT EXISTS child_missions (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_scenario TEXT,
      source_session_id TEXT REFERENCES sessions(id),
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
      xp INTEGER NOT NULL DEFAULT 10,
      assigned_at TEXT NOT NULL,
      due_date TEXT,
      completed_at TEXT,
      child_reflection TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_missions_child ON child_missions(child_id, assigned_at DESC);

    CREATE TABLE IF NOT EXISTS child_app_events (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_child_events ON child_app_events(child_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS child_helper_messages (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      role TEXT NOT NULL CHECK(role IN ('child','helper')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_helper_msgs ON child_helper_messages(child_id, created_at DESC);
  `);
}
