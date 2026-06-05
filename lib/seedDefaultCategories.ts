import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { DEFAULT_BRANCH_CATEGORIES } from "@/lib/constants/defaultCategories";

/**
 * Either the top-level Prisma client or a transaction client returned from
 * `prisma.$transaction(async (tx) => …)`. Both expose the same `category`
 * delegate, so callers inside a transaction can pass `tx` to keep branch
 * creation + default-category seeding atomic.
 */
export type CategorySeedClient = PrismaClient | Prisma.TransactionClient;

/**
 * Seed the standard set of starter menu categories for a freshly created
 * branch.
 *
 * Behaviour:
 *   - **Branch-scoped:** every category is created with `branch_id = branchId`
 *     so deleting one in Branch A never affects Branch B.
 *   - **Idempotent:** if any of the default names already exist for the
 *     branch (e.g. the seeder ran twice or a manual category happens to
 *     share a default name) those rows are skipped — never duplicated.
 *   - **Not undeletable:** the rows are written through the regular
 *     `categories` table with no special flag, so the standard PUT/DELETE
 *     endpoints work unchanged. Once a Branch Admin deletes "Pizza" it
 *     stays deleted; this helper is only ever called at branch-creation
 *     time, never on login / dashboard load / page refresh.
 *
 * Returns the number of categories actually inserted (0 means everything
 * already existed).
 */
export async function seedDefaultCategoriesForBranch(
  branchId: number,
  client: CategorySeedClient = defaultPrisma
): Promise<{ createdCount: number }> {
  if (!Number.isFinite(branchId) || branchId <= 0) {
    return { createdCount: 0 };
  }

  const defaultNames = [...DEFAULT_BRANCH_CATEGORIES];

  // Duplicate-prevention safeguard: even if this helper is somehow invoked
  // twice for the same branch, we only insert names that aren't already
  // present. The Category model has no unique (branch_id, name) constraint
  // today, so we can't rely on `createMany({ skipDuplicates: true })` and
  // instead diff against the existing rows ourselves.
  const existing = await client.category.findMany({
    where: { branch_id: branchId, name: { in: defaultNames } },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((c) => c.name));

  const toCreate = defaultNames
    .filter((name) => !existingNames.has(name))
    .map((name) => ({
      name,
      description: null,
      branch_id: branchId,
      kid: 0, // 0 = active in the legacy "kid" flag the schema uses
      terminal: 1,
    }));

  if (toCreate.length === 0) return { createdCount: 0 };

  const result = await client.category.createMany({ data: toCreate });
  return { createdCount: result.count };
}
