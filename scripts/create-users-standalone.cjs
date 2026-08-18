#!/usr/bin/env node
/**
 * Standalone user creation script.
 * Uses only bcryptjs + psql (no drizzle-orm dependency).
 * Run from workspace root: node scripts/create-users-standalone.cjs
 */
'use strict';

const bcrypt  = require('./node_modules/bcryptjs');
const crypto  = require('crypto');
const { execSync } = require('child_process');

const BCRYPT_ROUNDS = 12;
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

function genPassword() {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16);
}

function psql(sql) {
  try {
    // Pass SQL via stdin to avoid shell variable expansion of bcrypt $2b$12$... hashes
    execSync(`psql "${DB_URL}"`, { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    console.error('SQL error:', err.stderr?.toString() || err.message);
    process.exit(1);
  }
}

const USERS = [
  { username: 'ceo',        role: 'admin',      firstName: 'CEO',        lastName: 'Admin'   },
  { username: 'finance',    role: 'finance',    firstName: 'Finance',    lastName: 'Manager' },
  { username: 'sales',      role: 'sales',      firstName: 'Sales',      lastName: 'Manager' },
  { username: 'operations', role: 'operations', firstName: 'Operations', lastName: 'Manager' },
];

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('   AURON BUSINESS OS — User Setup');
  console.log('═══════════════════════════════════════════════════\n');
  console.log('Hashing passwords (this takes a moment)...\n');

  const results = [];
  for (const u of USERS) {
    const password = process.env[u.role.toUpperCase() + '_PASSWORD'] || genPassword();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    results.push({ ...u, password, hash });
  }

  for (const r of results) {
    // Escape single quotes in hash ($ chars in bcrypt hashes are safe but let's use dollar quoting)
    const sql = `
      INSERT INTO users (username, password_hash, role, first_name, last_name, is_active)
      VALUES ('${r.username}', '${r.hash}', '${r.role}', '${r.firstName}', '${r.lastName}', true)
      ON CONFLICT (username) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            is_active = true;
    `.replace(/\n\s+/g, ' ').trim();
    psql(sql);
  }

  console.log('⚠️  SAVE THESE CREDENTIALS — they will not be shown again\n');
  const w = 14;
  console.log('Username'.padEnd(w) + 'Role'.padEnd(w) + 'Password');
  console.log('─'.repeat(w * 2 + 20));
  for (const r of results) {
    console.log(r.username.padEnd(w) + r.role.padEnd(w) + r.password);
  }
  console.log('\n═══════════════════════════════════════════════════');
  console.log('   Done. Login at the app URL.');
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
