/**
 * Platform SaaS derivation helpers.
 *
 * Restenzo does not yet persist a `Subscription` / `Invoice` / `Payment`
 * model for the SaaS side (Stripe is planned). To still power a fully
 * functional Platform Admin (subscriptions, billing, plan breakdowns,
 * setup health, support) we derive virtual billing objects from the
 * real `Restaurant` rows the platform already owns.
 *
 * This keeps every page on the Platform Admin backed by real DB data
 * without inventing fake numbers. When Stripe lands, these helpers can
 * be swapped for real subscription lookups with zero UI changes.
 */
import { YEARLY_DISCOUNT_PERCENT } from "@/lib/pricing";

/**
 * Minimal pricing slice the billing math needs from a plan. The platform
 * overview route loads the real `plans` rows and passes them in, so MRR /
 * customer counts always reflect the prices the Platform Admin has set.
 */
export interface PlanPricing {
  slug: string;
  name: string;
  /** Per-month price billed monthly. */
  monthlyPrice: number;
  /** Per-month price when billed annually. */
  yearlyPrice: number;
}

/** 14 day free trial window that matches the marketing site copy. */
export const TRIAL_DAYS = 14;

export type DerivedSubscriptionStatus =
  | "Active"
  | "Trial"
  | "Inactive"
  | "Suspended"
  | "Past Due"
  | "Canceled";

export interface RestaurantBillingInput {
  restaurant_id: number;
  name: string;
  slug: string;
  status: string;
  has_multiple_branches: boolean;
  created_at: Date;
  /** Billing cycle opted in at sign up. Stripe integration will persist
   *  this per tenant; for now we default to monthly. */
  billing_cycle?: "monthly" | "yearly";
  /** Real subscription row from `subscriptions`, when available.
   *  Populated by the platform overview API once Stripe creates a
   *  subscription for the tenant — takes precedence over derived values. */
  subscription?: {
    plan_id: string;
    billing_cycle: string;
    status: string;
    payment_status: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    trial_start: Date | null;
    trial_end: Date | null;
    current_period_start: Date | null;
    current_period_end: Date | null;
    cancel_at_period_end: boolean;
    canceled_at: Date | null;
  } | null;
}

export interface DerivedSubscription {
  restaurantId: number;
  restaurantName: string;
  slug: string;
  planId: string;
  planName: string;
  billingCycle: "monthly" | "yearly";
  status: DerivedSubscriptionStatus;
  /** When the virtual subscription started (restaurant.created_at). */
  startDate: string;
  /** First day after the free trial ends. */
  trialEndsAt: string | null;
  /** Next renewal date (monthly → 30 days, yearly → 365 days from start). */
  renewalDate: string;
  /** Current effective price in USD per month for the derived billing cycle. */
  monthlyPrice: number;
  /** Total billed on the current cycle (monthly → monthlyPrice, yearly → monthlyPrice * 12). */
  cyclePrice: number;
  /** Stripe references are not wired yet but shaped here for future use. */
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  paymentStatus: "Paid" | "Pending" | "Failed" | "Trial" | "N/A";
}

/**
 * Resolve the plan a restaurant is on. Prefers the real `subscription.plan_id`
 * slug; falls back to the legacy `has_multiple_branches` heuristic when no
 * subscription row exists, then to the first plan provided.
 */
export function resolvePlanPricing(
  plans: PlanPricing[],
  planSlug: string | null | undefined,
  hasMultipleBranches: boolean
): PlanPricing {
  const fallbackSlug = hasMultipleBranches ? "multi" : "single";
  const slug = planSlug ?? fallbackSlug;
  return (
    plans.find((p) => p.slug === slug) ??
    plans.find((p) => p.slug === fallbackSlug) ??
    plans[0] ?? {
      slug,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      monthlyPrice: 0,
      yearlyPrice: 0,
    }
  );
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function mapSubscriptionStatus(raw: string): DerivedSubscriptionStatus {
  switch (raw) {
    case "trialing":
      return "Trial";
    case "active":
      return "Active";
    case "past_due":
      return "Past Due";
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
      return "Canceled";
    case "unpaid":
    case "paused":
      return "Suspended";
    case "inactive":
      return "Inactive";
    default:
      return "Active";
  }
}

function mapPaymentStatus(raw: string): DerivedSubscription["paymentStatus"] {
  switch (raw) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "failed":
    case "unpaid":
      return "Failed";
    default:
      return "N/A";
  }
}

/** Derive a virtual subscription for a single restaurant. */
export function deriveSubscription(
  r: RestaurantBillingInput,
  plans: PlanPricing[]
): DerivedSubscription {
  // Prefer the real subscription row when Stripe has already provisioned
  // one for this tenant. Any missing fields fall through to the derived
  // defaults so the UI never blanks out while Stripe is propagating.
  const sub = r.subscription ?? null;
  const plan = resolvePlanPricing(plans, sub?.plan_id, r.has_multiple_branches);
  const createdAt = new Date(r.created_at);
  const now = new Date();

  const cycle: "monthly" | "yearly" =
    (sub?.billing_cycle as "monthly" | "yearly") ??
    r.billing_cycle ??
    "monthly";

  const trialEnds = sub?.trial_end
    ? new Date(sub.trial_end)
    : addDays(createdAt, TRIAL_DAYS);

  let status: DerivedSubscriptionStatus;
  if (r.status === "Suspended") {
    status = "Suspended";
  } else if (r.status === "Inactive") {
    status = "Inactive";
  } else if (sub) {
    status = mapSubscriptionStatus(sub.status);
  } else {
    status = now < trialEnds ? "Trial" : "Active";
  }

  // Renewal date — prefer real `current_period_end`, fall back to trial end,
  // fall back to the pure date math we used before Stripe integration.
  let renewal: Date;
  if (sub?.current_period_end) {
    renewal = new Date(sub.current_period_end);
  } else if (sub?.trial_end) {
    renewal = new Date(sub.trial_end);
  } else {
    const stepDays = cycle === "yearly" ? 365 : 30;
    renewal = addDays(createdAt, stepDays);
    while (renewal < now) renewal = addDays(renewal, stepDays);
  }

  const monthlyPrice = cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
  const cyclePrice = cycle === "yearly" ? monthlyPrice * 12 : monthlyPrice;

  // Payment display rules:
  //  - On trial → always show "Trial" (never N/A), regardless of the stored
  //    payment_status, since Stripe reports "n_a" while a trial is running.
  //  - Active tenants backed by a real Stripe subscription should never show
  //    N/A — if the record hasn't flipped to "paid" yet, surface "Pending".
  //  - Otherwise fall through to the stored payment_status mapping.
  let paymentStatus: DerivedSubscription["paymentStatus"];
  if (status === "Trial") {
    paymentStatus = "Trial";
  } else if (sub) {
    const mapped = mapPaymentStatus(sub.payment_status);
    if (status === "Active" && mapped === "N/A") {
      paymentStatus =
        sub.stripe_subscription_id || sub.stripe_customer_id ? "Paid" : "N/A";
    } else {
      paymentStatus = mapped;
    }
  } else if (status === "Suspended") {
    paymentStatus = "Failed";
  } else if (status === "Inactive") {
    paymentStatus = "N/A";
  } else {
    paymentStatus = "Paid";
  }

  return {
    restaurantId: r.restaurant_id,
    restaurantName: r.name,
    slug: r.slug,
    planId: plan.slug,
    planName: plan.name,
    billingCycle: cycle,
    status,
    startDate: (sub?.trial_start ?? createdAt).toISOString(),
    trialEndsAt: trialEnds.toISOString(),
    renewalDate: renewal.toISOString(),
    monthlyPrice,
    cyclePrice,
    stripeCustomerId: sub?.stripe_customer_id ?? null,
    stripeSubscriptionId: sub?.stripe_subscription_id ?? null,
    paymentStatus,
  };
}

export interface PlatformBillingSummary {
  /** Monthly Recurring Revenue across all paying (Active, non-Trial) tenants. */
  mrr: number;
  /** Annual Recurring Revenue (MRR * 12 for now, until real invoices exist). */
  arr: number;
  activePayingCustomers: number;
  trialingCustomers: number;
  pastDueCustomers: number;
  canceledOrSuspendedCustomers: number;
  monthlyCustomers: number;
  yearlyCustomers: number;
  /** Revenue broken down by plan slug. */
  byPlan: Array<{ planId: string; planName: string; customers: number; mrr: number }>;
}

export function summarizeBilling(
  subs: DerivedSubscription[]
): PlatformBillingSummary {
  const active = subs.filter((s) => s.status === "Active");
  const trialing = subs.filter((s) => s.status === "Trial");
  const pastDue = subs.filter((s) => s.status === "Past Due");
  const suspended = subs.filter(
    (s) => s.status === "Suspended" || s.status === "Canceled" || s.status === "Inactive"
  );

  const mrr = active.reduce((sum, s) => sum + s.monthlyPrice, 0);

  const byPlanMap = new Map<
    string,
    { planId: string; planName: string; customers: number; mrr: number }
  >();
  active.forEach((s) => {
    const existing = byPlanMap.get(s.planId) ?? {
      planId: s.planId,
      planName: s.planName,
      customers: 0,
      mrr: 0,
    };
    existing.customers += 1;
    existing.mrr += s.monthlyPrice;
    byPlanMap.set(s.planId, existing);
  });

  return {
    mrr,
    arr: mrr * 12,
    activePayingCustomers: active.length,
    trialingCustomers: trialing.length,
    pastDueCustomers: pastDue.length,
    canceledOrSuspendedCustomers: suspended.length,
    monthlyCustomers: subs.filter(
      (s) => s.billingCycle === "monthly" && s.status !== "Suspended" && s.status !== "Inactive"
    ).length,
    yearlyCustomers: subs.filter(
      (s) => s.billingCycle === "yearly" && s.status !== "Suspended" && s.status !== "Inactive"
    ).length,
    byPlan: Array.from(byPlanMap.values()),
  };
}

/** Formats a USD amount with symbol + thousands separator. */
export function formatUSD(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export { YEARLY_DISCOUNT_PERCENT };
