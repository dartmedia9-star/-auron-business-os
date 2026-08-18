/**
 * Manually updated for local Passport.js authentication (Replit OIDC removed).
 * Role and username fields added.
 */

export interface AuthUser {
  id: string;
  /** @nullable */
  username: string | null;
  /** @nullable */
  email: string | null;
  /** @nullable */
  firstName: string | null;
  /** @nullable */
  lastName: string | null;
  /** @nullable */
  profileImageUrl: string | null;
  /** admin | finance | sales | operations */
  role: string;
}
