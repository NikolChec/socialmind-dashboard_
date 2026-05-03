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

function tableExists(table: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
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
  if (tableExists('audit_log')) {
    if (!columnExists('audit_log', 'ip')) {
      db.exec(`ALTER TABLE audit_log ADD COLUMN ip TEXT`);
    }
    if (!columnExists('audit_log', 'user_agent')) {
      db.exec(`ALTER TABLE audit_log ADD COLUMN user_agent TEXT`);
    }
  }
  if (tableExists('child_helper_messages') && !columnExists('child_helper_messages', 'flags')) {
    db.exec(`ALTER TABLE child_helper_messages ADD COLUMN flags TEXT`);
  }
  if (tableExists('child_helper_messages') && !columnExists('child_helper_messages', 'private_from_parents')) {
    db.exec(`ALTER TABLE child_helper_messages ADD COLUMN private_from_parents INTEGER NOT NULL DEFAULT 0`);
  }
  if (tableExists('child_missions') && !columnExists('child_missions', 'private_from_parents')) {
    db.exec(`ALTER TABLE child_missions ADD COLUMN private_from_parents INTEGER NOT NULL DEFAULT 0`);
  }
  if (tableExists('child_missions') && !columnExists('child_missions', 'assigned_by')) {
    db.exec(`ALTER TABLE child_missions ADD COLUMN assigned_by TEXT REFERENCES users(id)`);
  }
  if (tableExists('child_missions') && !columnExists('child_missions', 'source')) {
    // 'auto' = generated from VR scenarios, 'psychologist' = manually assigned, 'parent_request' = parent-suggested + approved
    db.exec(`ALTER TABLE child_missions ADD COLUMN source TEXT NOT NULL DEFAULT 'auto'`);
  }
  if (tableExists('safety_learned_patterns') && !columnExists('safety_learned_patterns', 'match_kind')) {
    // 'phrase' = substring match (existing behavior); 'stem' = word-prefix match with typo tolerance
    // (catches "bullied"/"bully"/"bulliex" from a single stem like "bull").
    db.exec(`ALTER TABLE safety_learned_patterns ADD COLUMN match_kind TEXT NOT NULL DEFAULT 'phrase'`);
  }
  if (tableExists('users') && !columnExists('users', 'two_factor_enabled')) {
    // Admin-controlled per-user 2FA flag. Default ON for school_admin + psychologist
    // (matches the previous role-based default), OFF for parent/teacher.
    db.exec(`ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0`);
    db.exec(`UPDATE users SET two_factor_enabled = 1 WHERE role IN ('school_admin','psychologist')`);
  }
  if (tableExists('users') && !columnExists('users', 'two_factor_email')) {
    // Optional override: admin can route OTPs to a different email than the user's login email.
    db.exec(`ALTER TABLE users ADD COLUMN two_factor_email TEXT`);
  }
  if (tableExists('children') && !columnExists('children', 'two_factor_enabled')) {
    // Admin-controlled 2FA for the kid login. OFF by default — only enable when the
    // admin has set a guardian email to receive the code.
    db.exec(`ALTER TABLE children ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0`);
  }
  if (tableExists('children') && !columnExists('children', 'two_factor_email')) {
    // Where the kid's OTP gets emailed — usually a parent/guardian address since kids
    // often don't have email of their own.
    db.exec(`ALTER TABLE children ADD COLUMN two_factor_email TEXT`);
  }
  if (tableExists('mission_requests') && !columnExists('mission_requests', 'requester_role')) {
    // Track whether a mission request came from a parent or a teacher so the UI can
    // surface the source. Default 'parent' since that's what existed before.
    db.exec(`ALTER TABLE mission_requests ADD COLUMN requester_role TEXT NOT NULL DEFAULT 'parent'`);
  }
  // Reuse `email_otps` and `trusted_devices` for child auth too — add a `subject_kind`
  // column so we can tell user vs child rows apart at verify time. Default 'user' so
  // existing rows keep working.
  // We also rebuild the tables to drop the original foreign key on `user_id → users(id)`
  // (the column now stores either a users.id or a children.id depending on subject_kind),
  // since SQLite can't drop a constraint in place.
  if (tableExists('email_otps')) {
    const sql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='email_otps'`).get() as { sql: string } | undefined)?.sql || '';
    if (!sql.includes('subject_kind') || sql.includes('REFERENCES users(id)')) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        BEGIN;
        CREATE TABLE email_otps_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          subject_kind TEXT NOT NULL DEFAULT 'user'
        );
        INSERT INTO email_otps_new (id, user_id, code_hash, attempts, created_at, expires_at, consumed_at, subject_kind)
          SELECT id, user_id, code_hash, attempts, created_at, expires_at, consumed_at,
                 ${columnExists('email_otps','subject_kind') ? "COALESCE(subject_kind,'user')" : "'user'"}
          FROM email_otps;
        DROP TABLE email_otps;
        ALTER TABLE email_otps_new RENAME TO email_otps;
        CREATE INDEX IF NOT EXISTS idx_email_otps_user ON email_otps(user_id, created_at DESC);
        COMMIT;
      `);
      db.pragma('foreign_keys = ON');
    }
  }
  if (tableExists('trusted_devices')) {
    const sql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='trusted_devices'`).get() as { sql: string } | undefined)?.sql || '';
    if (!sql.includes('subject_kind') || sql.includes('REFERENCES users(id)')) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        BEGIN;
        CREATE TABLE trusted_devices_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          user_agent TEXT,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          last_used_at TEXT,
          subject_kind TEXT NOT NULL DEFAULT 'user'
        );
        INSERT INTO trusted_devices_new (id, user_id, token_hash, user_agent, created_at, expires_at, last_used_at, subject_kind)
          SELECT id, user_id, token_hash, user_agent, created_at, expires_at, last_used_at,
                 ${columnExists('trusted_devices','subject_kind') ? "COALESCE(subject_kind,'user')" : "'user'"}
          FROM trusted_devices;
        DROP TABLE trusted_devices;
        ALTER TABLE trusted_devices_new RENAME TO trusted_devices;
        CREATE INDEX IF NOT EXISTS idx_trusted_user ON trusted_devices(user_id, expires_at);
        COMMIT;
      `);
      db.pragma('foreign_keys = ON');
    }
  }

  // Migrate users.role CHECK constraint to include 'teacher' (new) alongside admin/psych/parent.
  const usersSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get() as { sql: string } | undefined)?.sql || '';
  if (!usersSql.includes("'teacher'")) {
    // Need FKs off while we rebuild `users`, otherwise the DROP TABLE invalidates
    // foreign-key references from other tables and the migration aborts.
    db.pragma('foreign_keys = OFF');
    db.exec(`
      BEGIN;
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL REFERENCES schools(id),
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('school_admin','psychologist','parent','teacher')),
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
    db.pragma('foreign_keys = ON');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS child_parents (
      child_id TEXT NOT NULL REFERENCES children(id),
      parent_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (child_id, parent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_child_parents_parent ON child_parents(parent_id);

    CREATE TABLE IF NOT EXISTS child_psychologists (
      child_id TEXT NOT NULL REFERENCES children(id),
      psychologist_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (child_id, psychologist_id)
    );
    CREATE INDEX IF NOT EXISTS idx_child_psychs_psych ON child_psychologists(psychologist_id);

    CREATE TABLE IF NOT EXISTS child_teachers (
      child_id TEXT NOT NULL REFERENCES children(id),
      teacher_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (child_id, teacher_id)
    );
    CREATE INDEX IF NOT EXISTS idx_child_teachers_teacher ON child_teachers(teacher_id);

    CREATE TABLE IF NOT EXISTS permission_requests (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES users(id),
      child_id TEXT NOT NULL REFERENCES children(id),
      scope TEXT NOT NULL CHECK(scope IN ('helper_chats','alerts','sessions','missions','full')),
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('pending','approved','denied')) DEFAULT 'pending',
      requested_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT REFERENCES users(id),
      resolved_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_perm_req_teacher ON permission_requests(teacher_id, status, requested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_perm_req_child ON permission_requests(child_id, status, requested_at DESC);

    CREATE TABLE IF NOT EXISTS mission_requests (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      parent_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')) DEFAULT 'medium',
      xp INTEGER NOT NULL DEFAULT 15,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
      psych_note TEXT,
      decided_by TEXT REFERENCES users(id),
      decided_at TEXT,
      resulting_mission_id TEXT REFERENCES child_missions(id),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mreq_child ON mission_requests(child_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mreq_status ON mission_requests(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mreq_parent ON mission_requests(parent_id, created_at DESC);

    -- Teachers (and parents in the future) can request that a VR scenario be queued
    -- for a child's next session. Admin or psychologist approves; an approval inserts
    -- into scenario_queue. Tracked separately from scenario_queue so we keep an audit
    -- trail of decisions.
    CREATE TABLE IF NOT EXISTS scenario_queue_requests (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id),
      requester_id TEXT NOT NULL REFERENCES users(id),
      requester_role TEXT NOT NULL,
      scenario TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
      decided_by TEXT REFERENCES users(id),
      decided_at TEXT,
      decision_note TEXT,
      resulting_queue_id TEXT REFERENCES scenario_queue(id),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sreq_child ON scenario_queue_requests(child_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sreq_status ON scenario_queue_requests(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sreq_requester ON scenario_queue_requests(requester_id, created_at DESC);

    -- Psychologist-applied safety labels on helper messages. Used as ground truth that the
    -- pattern-extraction job uses to train the learned filter.
    CREATE TABLE IF NOT EXISTS safety_labels (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES child_helper_messages(id),
      child_id TEXT NOT NULL REFERENCES children(id),
      labeled_by TEXT NOT NULL REFERENCES users(id),
      severity TEXT NOT NULL CHECK(severity IN ('safe','low','medium','high','critical')),
      category TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_safety_labels_msg ON safety_labels(message_id);
    CREATE INDEX IF NOT EXISTS idx_safety_labels_child ON safety_labels(child_id, created_at DESC);

    -- Phrases the AI extracted from labelled messages. checkSafety() also greps these
    -- (scoped per school for privacy) on every new helper message + child VR turn.
    CREATE TABLE IF NOT EXISTS safety_learned_patterns (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      pattern TEXT NOT NULL,
      pattern_lower TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('safe','low','medium','high','critical')),
      language TEXT,
      created_from_label_id TEXT REFERENCES safety_labels(id),
      hit_count INTEGER NOT NULL DEFAULT 0,
      last_hit_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(school_id, pattern_lower, severity, category)
    );
    CREATE INDEX IF NOT EXISTS idx_safety_patterns_school ON safety_learned_patterns(school_id, severity);

    -- Pending 2FA codes (email OTP). One row per pending login. The opaque token
    -- in the API response refers back to this row's id; the actual 6-digit code
    -- is hashed before storage. Rows expire after ~10 min and are cleaned up lazily.
    CREATE TABLE IF NOT EXISTS email_otps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_email_otps_user ON email_otps(user_id, created_at DESC);

    -- Long-lived "trusted device" tokens so a returning psychologist on the same
    -- browser doesn't have to re-enter the OTP every time.
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trusted_user ON trusted_devices(user_id, expires_at);
  `);

  // Backfill child_psychologists from existing children.psychologist_id so legacy rows are linked.
  db.exec(`
    INSERT OR IGNORE INTO child_psychologists (child_id, psychologist_id, created_at)
    SELECT id, psychologist_id, COALESCE(created_at, datetime('now'))
    FROM children
    WHERE psychologist_id IS NOT NULL;
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
      flags TEXT,                  -- JSON: {"severity":"high","categories":["self_harm"],"phrases":["..."]}
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_helper_msgs ON child_helper_messages(child_id, created_at DESC);

    -- VR / ConvAI tables: turns are stored ANONYMIZED (real names already replaced with id_xxxxxx).
    CREATE TABLE IF NOT EXISTS vr_sessions (
      id TEXT PRIMARY KEY,
      child_id TEXT REFERENCES children(id),
      scenario TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_vr_sessions_child ON vr_sessions(child_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS vr_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vr_turns_session ON vr_turns(session_id, created_at);

    CREATE TABLE IF NOT EXISTS vr_alerts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      child_id TEXT REFERENCES children(id),
      severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
      categories TEXT NOT NULL,
      phrase TEXT,
      raw TEXT,
      reviewed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vr_alerts_child ON vr_alerts(child_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_vr_alerts_unreviewed ON vr_alerts(reviewed, severity, created_at DESC);
  `);
}
