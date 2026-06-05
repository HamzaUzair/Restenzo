/**
 * Shared plan shapes used across the marketing site, the Platform Admin panel
 * and the API layer. Kept free of any server-only imports (no Prisma) so both
 * client and server code can import the types.
 */

/** Public-safe plan fields surfaced to the marketing site + signup. */
export interface PublicPlan {
  slug: string;
  name: string;
  description: string;
  /** Per-month price billed monthly. */
  monthlyPrice: number;
  /** Per-month price when billed annually (figure shown on the card). */
  yearlyPrice: number;
  currency: string;
  billingLabel: string | null;
  ctaLabel: string | null;
  features: string[];
  isPopular: boolean;
  isCustom: boolean;
  /** null = unlimited / custom. */
  maxBranches: number | null;
  sortOrder: number;
}

/** Full plan record (Platform Admin only) — adds internal + Stripe fields. */
export interface AdminPlan extends PublicPlan {
  id: number;
  isActive: boolean;
  stripeMonthlyPriceId: string | null;
  stripeYearlyPriceId: string | null;
  createdAt: string;
  updatedAt: string;
}
