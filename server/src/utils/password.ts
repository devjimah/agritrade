import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * bcrypt hash of a random unused secret. Compare against this whenever the
 * lookup failed (unknown email/phone, no hash set) so those paths cost the
 * same as a real wrong-secret compare — otherwise response time reveals
 * whether an account exists. Shared by both auth services deliberately: two
 * copies of a security-relevant constant can drift.
 */
export const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
