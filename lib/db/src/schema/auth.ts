import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const sessionsTable = pgTable(
  'sessions',
  {
    sid: varchar('sid').primaryKey(),
    sess: jsonb('sess').notNull(),
    expire: timestamp('expire').notNull(),
  },
  (table) => [index('IDX_session_expire').on(table.expire)],
);

export const usersTable = pgTable('users', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** Unique login handle (lowercase). Null for legacy Replit-imported accounts. */
  username: varchar('username', { length: 64 }).unique(),
  /** bcrypt hash of the user's password. Null for legacy accounts. */
  passwordHash: varchar('password_hash'),
  /** Role for RBAC: admin | finance | sales | operations */
  role: varchar('role', { length: 32 }).notNull().default('admin'),
  /** Whether the account can log in */
  isActive: boolean('is_active').notNull().default(true),
  email: varchar('email').unique(),
  firstName: varchar('first_name'),
  lastName: varchar('last_name'),
  profileImageUrl: varchar('profile_image_url'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
