import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** True when `stored` looks like a bcrypt hash ($2a$ / $2b$ / $2y$). */
export function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored value.
 * Supports legacy plaintext rows (pre-bcrypt) for seamless migration.
 */
export async function verifyPassword(
  plain: string,
  stored: string
): Promise<boolean> {
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  return stored === plain;
}

/**
 * After a successful login against a legacy plaintext row, upgrade the
 * stored value to a bcrypt hash so future logins use secure storage.
 */
export async function upgradePasswordHashIfNeeded(
  userId: number,
  plain: string,
  stored: string
): Promise<void> {
  if (isBcryptHash(stored)) return;
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({
    where: { id: userId },
    data: { password: await hashPassword(plain) },
  });
}
