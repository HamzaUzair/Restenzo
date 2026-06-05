/**
 * Plan-based branch limit enforcement.
 *
 * Resolves how many branches a tenant may own from its subscribed plan and
 * compares against the current branch count. Used by the branch creation API
 * (hard backend guarantee) and surfaced to the Branch Management UI.
 */
import { prisma } from "@/lib/prisma";
import { getPlanBySlug } from "@/lib/plans";

export interface BranchUsage {
  used: number;
  /** Maximum branches allowed. null = unlimited / custom. */
  max: number | null;
  planSlug: string;
  planName: string;
  /** True when a new branch may be created. */
  canCreate: boolean;
}

/** Resolve current branch usage + limit for a restaurant. */
export async function getBranchUsage(restaurantId: number): Promise<BranchUsage> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { restaurant_id: restaurantId },
    select: {
      has_multiple_branches: true,
      subscription: { select: { plan_id: true } },
      _count: { select: { branches: true } },
    },
  });

  if (!restaurant) {
    return {
      used: 0,
      max: null,
      planSlug: "unknown",
      planName: "Unknown",
      canCreate: false,
    };
  }

  // Prefer the real subscribed plan; fall back to the legacy multi-branch flag.
  const slug =
    restaurant.subscription?.plan_id ??
    (restaurant.has_multiple_branches ? "multi" : "single");
  const plan = await getPlanBySlug(slug);

  const used = restaurant._count.branches;
  const max = plan ? plan.maxBranches : null;

  return {
    used,
    max,
    planSlug: slug,
    planName: plan?.name ?? slug,
    canCreate: max === null || used < max,
  };
}

/** Friendly, user-facing message shown when the branch limit is reached. */
export function branchLimitMessage(usage: BranchUsage): string {
  if (usage.max === null) return "";
  const noun = usage.max === 1 ? "branch" : "branches";
  return `Your ${usage.planName} plan includes up to ${usage.max} ${noun}. Upgrade your plan to add more branches.`;
}
