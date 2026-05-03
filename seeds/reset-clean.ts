// Wipe the database and create a single school + one admin user.
// Outputs the admin email and a freshly-generated password.
//
// Run from repo root: npm run seed:clean -w seeds
//
// Use this AFTER deploying the new admin/children endpoints — admin can then add
// psychologists, parents, and children directly from the dashboard.

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../socialmind.db');
const db = new Database(DB_PATH);

console.log(`==> Resetting DB at ${DB_PATH}`);

// Drop & recreate every app table. Order matters because of foreign keys.
const TABLES = [
  'audit_log', 'risk_snapshots', 'parent_contacts', 'sse_tickets',
  'scenario_queue', 'child_helper_messages', 'child_app_events',
  'child_missions', 'child_parents', 'alerts', 'sessions',
  'children', 'users', 'schools',
  'vr_alerts', 'vr_turns', 'vr_sessions',
];
db.pragma('foreign_keys = OFF');
for (const t of TABLES) {
  try { db.exec(`DELETE FROM ${t}`); console.log(`  cleared ${t}`); } catch { /* table may not exist yet */ }
}
db.pragma('foreign_keys = ON');

// Re-create schema (in case this is a brand-new file)
const schemaSql = `
  CREATE TABLE IF NOT EXISTS schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
    email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('school_admin','psychologist','parent')),
    password_hash TEXT NOT NULL, phone TEXT, fcm_token TEXT, created_at TEXT NOT NULL
  );
`;
db.exec(schemaSql);

const now = new Date().toISOString();
const schoolId = crypto.randomUUID();
const adminId = crypto.randomUUID();

// Override via env if needed.
const adminPassword = process.env.ADMIN_PASSWORD || '12345678';
const adminEmail = process.env.ADMIN_EMAIL || 'Fridmanvlad11@gmail.com';
const adminName = process.env.ADMIN_NAME || 'Vlad Fridman';

db.prepare(`INSERT INTO schools (id, name, created_at) VALUES (?, ?, ?)`).run(schoolId, 'SocialMind', now);
db.prepare(
  `INSERT INTO users (id, school_id, email, name, role, password_hash, created_at)
   VALUES (?, ?, ?, ?, 'school_admin', ?, ?)`
).run(adminId, schoolId, adminEmail, adminName, bcrypt.hashSync(adminPassword, 10), now);

console.log('\n==> CLEAN STATE READY');
console.log('────────────────────────────────────────');
console.log(`  Email:    ${adminEmail}`);
console.log(`  Password: ${adminPassword}`);
console.log('────────────────────────────────────────');
console.log('\n  Login at https://dashboard.social-mind.org and add psychologists, parents, children.');
console.log('  This password will NOT be shown again. Save it now.');
