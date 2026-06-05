/**
 * Stripe server-side helpers.
 *
 * All Stripe API access for the Restenzo SaaS platform flows through
 * this module. It intentionally keeps concerns narrow:
 *
 *   - lazily builds the Stripe client using STRIPE_SECRET_KEY
 *   - exposes a `stripeEnabled()` check so the rest of the app can
 *     degrade gracefully when keys are missing
 *   - owns product / price provisioning (Products & Prices are created
 *     on-demand from `lib/pricing.ts` and cached in Stripe metadata)
 *   - centralizes Customer + Subscription creation for the 14-day trial
 *
 * All Stripe keys are read from env vars — NEVER hardcoded in components:
 *   STRIPE_SECRET_KEY                  (server)
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (browser)
 *   STRIPE_WEBHOOK_SECRET              (webhook signature verification)
 */
import Stripe from "stripe";
import { type BillingCycle } from "@/lib/pricing";
import { getPlanBySlug } from "@/lib/plans";

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
/**
 * Optional Stripe API version override. The SDK infers the version from its
 * own bundled types when this is left unset, which is what we want in
 * production so upgrades stay in lock-step with the SDK.
 */
const API_VERSION = process.env.STRIPE_API_VERSION ?? undefined;

export const TRIAL_DAYS = 14;

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!SECRET_KEY) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment."
    );
  }
  if (!_stripe) {
    // Cast is intentional: the Stripe SDK uses a very strict union of
    // version strings that changes every release. We pass the env value
    // through verbatim so deployments can pin a specific version at any
    // time without needing a code change.
    const config: Record<string, unknown> = {
      appInfo: {
        name: "Restenzo SaaS",
        version: "0.1.0",
      },
    };
    if (API_VERSION) config.apiVersion = API_VERSION;
    _stripe = new Stripe(SECRET_KEY, config as ConstructorParameters<typeof Stripe>[1]);
  }
  return _stripe;
}

export function stripeEnabled(): boolean {
  return Boolean(SECRET_KEY);
}

/**
 * Shape used by every signup / provisioning call — resolves a plan id +
 * billing cycle to the matching Stripe price. The first time a given
 * plan+cycle is used, the Product and Price are created in Stripe with
 * deterministic metadata so subsequent calls always find the same ones.
 */
/**
 * Optional fixed price ids supplied through the environment. When set these
 * take precedence over the on-demand product/price provisioning below, which
 * is the recommended setup for Stripe test mode where you create the prices
 * once in the dashboard / CLI and pin their ids:
 *   STRIPE_SINGLE_BRANCH_PRICE_ID=price_...
 *   STRIPE_MULTI_BRANCH_PRICE_ID=price_...
 */
function envPriceIdForPlan(planSlug: string): string | null {
  if (planSlug === "single") {
    return process.env.STRIPE_SINGLE_BRANCH_PRICE_ID?.trim() || null;
  }
  if (planSlug === "multi") {
    return process.env.STRIPE_MULTI_BRANCH_PRICE_ID?.trim() || null;
  }
  return null;
}

/** Per-cycle unit amount (in cents) for a plan, from its stored prices. */
function unitAmountForCycle(
  monthlyPrice: number,
  yearlyPrice: number,
  cycle: BillingCycle
): number {
  // Yearly is billed for the full year up-front using the per-month yearly
  // price × 12. Monthly bills the monthly price.
  return cycle === "yearly"
    ? Math.round(yearlyPrice * 12 * 100)
    : Math.round(monthlyPrice * 100);
}

/**
 * Creates a brand-new Stripe Price for a plan + cycle at the given unit amount
 * (cents). Stripe prices are immutable, so callers that change a plan's price
 * always mint a fresh Price and store its id — old prices keep serving existing
 * subscriptions. The owning Product is reused/created from the plan slug.
 */
export async function createStripePriceForPlan(params: {
  slug: string;
  name: string;
  description?: string | null;
  cycle: BillingCycle;
  unitAmount: number;
}): Promise<string> {
  const stripe = getStripe();
  const interval: Stripe.Price.Recurring.Interval =
    params.cycle === "yearly" ? "year" : "month";

  const existingProducts = await stripe.products.search({
    query: `metadata['restenzo_plan']:'${params.slug}'`,
    limit: 1,
  });
  let product = existingProducts.data[0];
  if (!product) {
    product = await stripe.products.create({
      name: `Restenzo · ${params.name}`,
      description: params.description || undefined,
      metadata: { restenzo_plan: params.slug },
    });
  }

  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: params.unitAmount,
    recurring: { interval },
    metadata: { restenzo_plan: params.slug, restenzo_cycle: params.cycle },
  });
  return price.id;
}

/**
 * Resolves the Stripe Price id to use for a plan + cycle, preferring (in order):
 *   1. the plan's admin-managed stored price id
 *   2. an env-pinned price id (STRIPE_*_PRICE_ID)
 *   3. an on-demand price provisioned from the plan's current amounts
 */
export async function ensureStripePriceForPlan(
  planSlug: string,
  cycle: BillingCycle
): Promise<{ priceId: string; amount: number }> {
  const plan = await getPlanBySlug(planSlug);
  if (!plan) throw new Error(`Unknown plan id: ${planSlug}`);
  if (plan.isCustom) {
    throw new Error("Custom / contact-sales plan has no Stripe price");
  }

  const stripe = getStripe();
  const interval: Stripe.Price.Recurring.Interval =
    cycle === "yearly" ? "year" : "month";

  // 1. Admin-managed stored price id wins (Option A / Option B result).
  const storedPriceId =
    cycle === "yearly" ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;
  if (storedPriceId) {
    try {
      const stored = await stripe.prices.retrieve(storedPriceId);
      return { priceId: stored.id, amount: stored.unit_amount ?? 0 };
    } catch {
      // Stored id missing/invalid in this Stripe mode — fall through.
    }
  }

  // 2. Env-pinned price id (test mode best practice).
  const pinnedPriceId = envPriceIdForPlan(plan.slug);
  if (pinnedPriceId) {
    const pinned = await stripe.prices.retrieve(pinnedPriceId);
    return { priceId: pinned.id, amount: pinned.unit_amount ?? 0 };
  }

  // 3. Provision from the plan's amounts, reusing a matching price when one
  //    already exists (keeps signup idempotent without duplicating prices).
  const unitAmount = unitAmountForCycle(
    plan.monthlyPrice,
    plan.yearlyPrice,
    cycle
  );
  const priceKey = `${plan.slug}_${cycle}`;
  const existingPrices = await stripe.prices.search({
    query: `metadata['restenzo_price_key']:'${priceKey}'`,
    limit: 1,
  });
  let price = existingPrices.data[0];
  if (!price || price.unit_amount !== unitAmount) {
    const existingProducts = await stripe.products.search({
      query: `metadata['restenzo_plan']:'${plan.slug}'`,
      limit: 1,
    });
    let product = existingProducts.data[0];
    if (!product) {
      product = await stripe.products.create({
        name: `Restenzo · ${plan.name}`,
        description: plan.description || undefined,
        metadata: { restenzo_plan: plan.slug },
      });
    }
    price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: unitAmount,
      recurring: { interval },
      metadata: {
        restenzo_plan: plan.slug,
        restenzo_cycle: cycle,
        restenzo_price_key: priceKey,
      },
    });
  }

  return { priceId: price.id, amount: unitAmount };
}

/**
 * Creates (or reuses) a Stripe Customer for a tenant. Idempotent on
 * `metadata.restenzo_restaurant_id`, so subsequent lookups always return
 * the same Customer even if the request retries.
 */
export async function ensureStripeCustomer(params: {
  email: string;
  fullName: string;
  restaurantId: number;
  restaurantName: string;
  planId: string;
}): Promise<Stripe.Customer> {
  const stripe = getStripe();
  const existing = await stripe.customers.search({
    query: `metadata['restenzo_restaurant_id']:'${params.restaurantId}'`,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0];

  return stripe.customers.create({
    email: params.email,
    name: params.fullName,
    description: `${params.restaurantName} (Restenzo tenant)`,
    metadata: {
      restenzo_restaurant_id: String(params.restaurantId),
      restenzo_restaurant_name: params.restaurantName,
      restenzo_plan: params.planId,
    },
  });
}

/**
 * Creates a Stripe Subscription in trialing state with card-collection
 * deferred via `payment_behavior: 'default_incomplete'`. The returned
 * subscription has `pending_setup_intent` populated so the client can
 * confirm a SetupIntent (save card for future use) without charging
 * today. After the 14-day trial, Stripe automatically attempts the first
 * invoice using the saved default payment method.
 */
export async function createTrialSubscription(params: {
  customerId: string;
  priceId: string;
  restaurantId: number;
  planId: string;
  billingCycle: BillingCycle;
}): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: params.priceId }],
    trial_period_days: TRIAL_DAYS,
    // Defer payment collection: don't attempt the first invoice, surface
    // a SetupIntent instead so we can confirm the card before trial ends.
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
      payment_method_types: ["card"],
    },
    trial_settings: {
      end_behavior: {
        // If the customer never attaches a payment method, pause the
        // subscription at the end of the trial instead of canceling so
        // the tenant can add a card later.
        missing_payment_method: "pause",
      },
    },
    expand: ["pending_setup_intent", "latest_invoice.payment_intent"],
    metadata: {
      restenzo_restaurant_id: String(params.restaurantId),
      restenzo_plan: params.planId,
      restenzo_cycle: params.billingCycle,
    },
  });
}

/** Helper: read the setup intent client secret from a trialing subscription. */
export function clientSecretFromSubscription(
  sub: Stripe.Subscription
): string | null {
  const setupIntent = sub.pending_setup_intent;
  if (setupIntent && typeof setupIntent !== "string") {
    return setupIntent.client_secret ?? null;
  }
  const invoice = sub.latest_invoice;
  if (invoice && typeof invoice !== "string") {
    const pi = (invoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string | null }).payment_intent;
    if (pi && typeof pi !== "string") {
      return pi.client_secret ?? null;
    }
  }
  return null;
}

/**
 * Maps a Stripe.Subscription.Status onto the Restenzo-side status we
 * persist in `subscriptions.status`. Keeps the DB enum narrow and
 * UI-friendly so the platform admin can render badges without string
 * gymnastics.
 */
export function normalizeSubscriptionStatus(
  status: Stripe.Subscription.Status
): string {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    case "paused":
      return "paused";
    default:
      return "inactive";
  }
}

export type LocalPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "unpaid"
  | "n_a";

/** Derives the public payment_status we surface in the admin panel. */
export function derivePaymentStatus(
  sub: Stripe.Subscription
): LocalPaymentStatus {
  if (sub.status === "trialing") return "n_a";
  if (sub.status === "active") return "paid";
  if (sub.status === "past_due" || sub.status === "unpaid") return "failed";
  if (sub.status === "canceled") return "unpaid";
  if (sub.status === "incomplete" || sub.status === "incomplete_expired")
    return "pending";
  return "n_a";
}

interface SubscriptionWithPeriods extends Stripe.Subscription {
  current_period_start?: number | null;
  current_period_end?: number | null;
}

/**
 * Reads the current period window. Newer Stripe API versions expose
 * `current_period_*` on the subscription item rather than the subscription,
 * so we check the item first and fall back to the subscription-level fields.
 */
export function readSubscriptionPeriods(sub: Stripe.Subscription): {
  start: number | null;
  end: number | null;
} {
  const item = sub.items?.data?.[0];
  const s = sub as SubscriptionWithPeriods;
  return {
    start: item?.current_period_start ?? s.current_period_start ?? null,
    end: item?.current_period_end ?? s.current_period_end ?? null,
  };
}

const toDate = (epochSeconds: number | null | undefined): Date | null =>
  epochSeconds ? new Date(epochSeconds * 1000) : null;

/** Local `subscriptions` columns derived from a Stripe.Subscription. */
export interface LocalSubscriptionFields {
  status: string;
  payment_status: LocalPaymentStatus;
  stripe_subscription_id: string;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  trial_start: Date | null;
  trial_end: Date | null;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  canceled_at: Date | null;
}

/**
 * Single source of truth for translating a Stripe.Subscription into the
 * columns we persist on `subscriptions`. Reused by the signup flow, the
 * webhook receiver and the manual sync endpoint so all three stay in lock-step.
 */
export function mapStripeSubscriptionToLocal(
  sub: Stripe.Subscription
): LocalSubscriptionFields {
  const periods = readSubscriptionPeriods(sub);
  return {
    status: normalizeSubscriptionStatus(sub.status),
    payment_status: derivePaymentStatus(sub),
    stripe_subscription_id: sub.id,
    stripe_customer_id:
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripe_price_id: sub.items?.data?.[0]?.price?.id ?? null,
    trial_start: toDate(sub.trial_start),
    trial_end: toDate(sub.trial_end),
    current_period_start: toDate(periods.start),
    current_period_end: toDate(periods.end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    canceled_at: toDate(sub.canceled_at),
  };
}

/** Reads the restaurant id pinned in a subscription's Stripe metadata. */
export function restaurantIdFromMetadata(
  metadata: Stripe.Metadata | null | undefined
): number | null {
  const raw = metadata?.restenzo_restaurant_id;
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Read-only Stripe instance accessor used by the webhook route. */
export function getStripeOrNull(): Stripe | null {
  if (!SECRET_KEY) return null;
  return getStripe();
}

export async function getSubscriptionById(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["pending_setup_intent", "latest_invoice.payment_intent"],
  });
}

export async function createSetupIntentForCustomer(params: {
  customerId: string;
  restaurantId: number;
  planId: string;
  billingCycle: BillingCycle;
}): Promise<string | null> {
  const stripe = getStripe();
  const setupIntent = await stripe.setupIntents.create({
    customer: params.customerId,
    usage: "off_session",
    payment_method_types: ["card"],
    metadata: {
      restenzo_restaurant_id: String(params.restaurantId),
      restenzo_plan: params.planId,
      restenzo_cycle: params.billingCycle,
      restenzo_resume_flow: "true",
    },
  });
  return setupIntent.client_secret ?? null;
}

export async function getSetupIntentByClientSecret(
  clientSecret: string
): Promise<Stripe.SetupIntent> {
  const setupIntentId = clientSecret.split("_secret_")[0];
  if (!setupIntentId.startsWith("seti_")) {
    throw new Error("Invalid setup intent client secret");
  }
  const stripe = getStripe();
  return stripe.setupIntents.retrieve(setupIntentId, {
    client_secret: clientSecret,
    expand: ["payment_method"],
  });
}
