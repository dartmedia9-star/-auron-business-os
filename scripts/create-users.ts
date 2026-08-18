/**
 * Create initial Auron Business OS users.
 *
 * Run once on a fresh database (or any time you need to reset/add users):
 *   npx tsx scripts/create-users.ts
 *
 * Passwords are generated randomly and printed to the terminal.
 * Store them in a password manager immediately — they are shown only once.
 *
 * Override any password via environment variable:
 *   ADMIN_PASSWORD=MySecret npx tsx scripts/create-users.ts
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db/src/index.ts';
import { usersTable } from '../lib/db/src/schema/index.ts';

const BCRYPT_ROUNDS = 12;

function generatePassword(): string {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16);
}

const USERS = [
  {
    username: 'ceo',
    role: 'admin',
    firstName: 'CEO',
    lastName: 'Admin',
    passwordEnv: 'ADMIN_PASSWORD',
  },
  {
    username: 'finance',
    role: 'finance',
    firstName: 'Finance',
    lastName: 'Manager',
    passwordEnv: 'FINANCE_PASSWORD',
  },
  {
    username: 'sales',
    role: 'sales',
    firstName: 'Sales',
    lastName: 'Manager',
    passwordEnv: 'SALES_PASSWORD',
  },
  {
    username: 'operations',
    role: 'operations',
    firstName: 'Operations',
    lastName: 'Manager',
    passwordEnv: 'OPERATIONS_PASSWORD',
  },
];

console.log('\n═══════════════════════════════════════════════════');
console.log('   AURON BUSINESS OS — User Setup');
console.log('═══════════════════════════════════════════════════\n');

const results: Array<{ username: string; role: string; password: string; action: string }> = [];

for (const u of USERS) {
  const plaintext = process.env[u.passwordEnv] ?? generatePassword();
  const passwordHash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, u.username));

  if (existing) {
    await db
      .update(usersTable)
      .set({ passwordHash, role: u.role, isActive: true })
      .where(eq(usersTable.username, u.username));
    results.push({ username: u.username, role: u.role, password: plaintext, action: 'UPDATED' });
  } else {
    await db.insert(usersTable).values({
      username: u.username,
      passwordHash,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      isActive: true,
    });
    results.push({ username: u.username, role: u.role, password: plaintext, action: 'CREATED' });
  }
}

console.log('⚠️  SAVE THESE CREDENTIALS — they will not be shown again\n');
console.log(
  'Username'.padEnd(14) +
  'Role'.padEnd(14) +
  'Password'.padEnd(22) +
  'Action'
);
console.log('─'.repeat(62));
for (const r of results) {
  console.log(
    r.username.padEnd(14) +
    r.role.padEnd(14) +
    r.password.padEnd(22) +
    r.action
  );
}
console.log('\n═══════════════════════════════════════════════════');
console.log('   Done. Login at https://os.auronevents.com');
console.log('═══════════════════════════════════════════════════\n');

process.exit(0);
