/**
 * Shared plan-edit validation used by both the Platform Admin modal (client)
 * and the update API (server) so the rules can never drift apart. No
 * server-only imports here.
 */

export interface PlanFormInput {
  slug: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  billingLabel: string;
  ctaLabel: string;
  isActive: boolean;
  isPopular: boolean;
  isCustom: boolean;
  /** null = unlimited / custom. */
  maxBranches: number | null;
  features: string[];
  stripeMonthlyPriceId: string;
  stripeYearlyPriceId: string;
}

export interface NormalizedPlanInput extends PlanFormInput {
  features: string[];
}

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  normalized: NormalizedPlanInput;
}

/** Hard caps enforced per built-in plan slug (business rules). */
export const PLAN_BRANCH_CAPS: Record<string, number> = {
  single: 1,
  multi: 10,
};

export function validatePlanInput(input: PlanFormInput): PlanValidationResult {
  const errors: string[] = [];

  const name = (input.name ?? "").trim();
  if (!name) errors.push("Plan name is required.");

  const currency = (input.currency ?? "").trim().toUpperCase() || "USD";

  const features = (input.features ?? [])
    .map((f) => (f ?? "").trim())
    .filter((f) => f.length > 0);

  const monthlyPrice = Number(input.monthlyPrice);
  const yearlyPrice = Number(input.yearlyPrice);

  if (!input.isCustom) {
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
      errors.push("Monthly price must be a positive number.");
    }
    if (!Number.isFinite(yearlyPrice) || yearlyPrice <= 0) {
      errors.push("Yearly price must be a positive number.");
    }
  } else {
    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
      errors.push("Monthly price must be zero or a positive number.");
    }
    if (!Number.isFinite(yearlyPrice) || yearlyPrice < 0) {
      errors.push("Yearly price must be zero or a positive number.");
    }
  }

  let maxBranches = input.maxBranches;
  if (maxBranches !== null && maxBranches !== undefined) {
    if (!Number.isInteger(maxBranches) || maxBranches < 1) {
      errors.push("Max branches must be a whole number of at least 1, or unlimited.");
    } else {
      const cap = PLAN_BRANCH_CAPS[input.slug];
      if (cap !== undefined && maxBranches > cap) {
        errors.push(
          input.slug === "single"
            ? "Single Branch plan cannot allow more than 1 branch."
            : `Multi Branch plan cannot allow more than ${cap} branches.`
        );
      }
    }
  } else {
    maxBranches = null;
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      ...input,
      name,
      description: (input.description ?? "").trim(),
      currency,
      billingLabel: (input.billingLabel ?? "").trim(),
      ctaLabel: (input.ctaLabel ?? "").trim(),
      stripeMonthlyPriceId: (input.stripeMonthlyPriceId ?? "").trim(),
      stripeYearlyPriceId: (input.stripeYearlyPriceId ?? "").trim(),
      monthlyPrice,
      yearlyPrice,
      maxBranches,
      features,
    },
  };
}
