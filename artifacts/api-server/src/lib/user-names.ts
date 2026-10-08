import { inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export function userDisplayName(user: { firstName: string | null; lastName: string | null; username: string | null; email: string | null }): string | null {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.username || user.email || null;
}

/** Display names for the given user ids (missing users are simply absent). */
export async function loadUserNames(ids: Array<string | null | undefined>): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const users = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username, email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  return new Map(users.map((u) => [u.id, userDisplayName(u)]));
}
