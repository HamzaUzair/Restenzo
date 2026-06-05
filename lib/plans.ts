/**
 * Server-side plan catalog access.
 *
 * Plans live in the `plans` table (see `prisma/schema.prisma`) and are the
 * single source of truth for pricing, features and branch limits across:
 *   - the Platform Admin panel (`/plans`)
 *   - the public marketing site (`/pricing`, `/signup`)
 *   - Stripe checkout (`lib/stripe.ts`)
 *   - branch-limit enforcement (`lib/branch-limits.ts`)
 *
 * If the table has not been seeded yet, every reader falls back to the
 * hardcoded defaults in `lib/pricing.ts` so the app never renders an empty
 * pricing page.
 */
import type { Plan as PrismaPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/pricing";
import type { AdminPlan, PublicPlan } from "@/types/plan";

/** Default branch limits per built-in plan slug (used for seeding/fallback). */
export const DEFAULT_MAX_BRANCHES: Record<string, number | null> = {
  single: 1,
  multi: 10,
  enterprise: null,
};

/** Map a Prisma row → the admin-facing plan shape. */
export function mapPrismaPlan(row: PrismaPlan): AdminPlan {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    monthlyPrice: Number(row.monthly_price),
    yearlyPrice: Number(row.yearly_price),
    currency: row.currency,
    billingLabel: row.billing_label,
    ctaLabel: row.cta_label,
    features: row.features ?? [],
    isPopular: row.is_popular,
    isCustom: row.is_custom,
    isActive: row.is_active,
    maxBranches: row.max_branches,
    sortOrder: row.sort_order,
    stripeMonthlyPriceId: row.stripe_monthly_price_id,
    stripeYearlyPriceId: row.stripe_yearly_price_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Build AdminPlan[] from the hardcoded defaults when the DB has no rows. */
function fallbackPlans(): AdminPlan[] {
  const now = new Date().toISOString();
  return PLANS.map((p, i) => ({
    id: -(i + 1),
    slug: p.id,
    name: p.name,
    description: p.tagline,
    monthlyPrice: p.monthly,
    yearlyPrice: p.yearly,
    currency: p.currency,
    billingLabel: "/mo",
    ctaLabel: p.cta,
    features: [...p.features],
    isPopular: Boolean(p.highlighted),
    isCustom: p.id === "enterprise",
    isActive: true,
    maxBranches: DEFAULT_MAX_BRANCHES[p.id] ?? null,
    sortOrder: i,
    stripeMonthlyPriceId: p.stripeIds?.monthly ?? null,
    stripeYearlyPriceId: p.stripeIds?.yearly ?? null,
    createdAt: now,
    updatedAt: now,
  }));
}

/** All plans (admin view), ordered by sort_order. Falls back to defaults. */
export async function getPlans(): Promise<AdminPlan[]> {
  try {
    const rows = await prisma.plan.findMany({
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
    });
    if (rows.length === 0) return fallbackPlans();
    return rows.map(mapPrismaPlan);
  } catch {
    // Table may not exist yet (pre-migration) — degrade gracefully.
    return fallbackPlans();
  }
}

/** Strip an AdminPlan down to public-safe fields. */
export function toPublicPlan(plan: AdminPlan): PublicPlan {
  return {
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    currency: plan.currency,
    billingLabel: plan.billingLabel,
    ctaLabel: plan.ctaLabel,
    features: plan.features,
    isPopular: plan.isPopular,
    isCustom: plan.isCustom,
    maxBranches: plan.maxBranches,
    sortOrder: plan.sortOrder,
  };
}

/** Active plans only, mapped to the public shape. */
export async function getPublicPlans(): Promise<PublicPlan[]> {
  const plans = await getPlans();
  return plans.filter((p) => p.isActive).map(toPublicPlan);
}

/** Look up a single plan by slug (admin shape). */
export async function getPlanBySlug(slug: string): Promise<AdminPlan | null> {
  try {
    const row = await prisma.plan.findUnique({ where: { slug } });
    if (row) return mapPrismaPlan(row);
  } catch {
    // fall through to defaults
  }
  return fallbackPlans().find((p) => p.slug === slug) ?? null;
}
