/**
 * Subscription reconciliation core.
 *
 * Shared by the Stripe webhook receiver (`/api/stripe/webhook`) and the
 * Platform Admin manual sync endpoint (`/api/admin/subscriptions/sync-stripe`).
 * Both paths translate a Stripe.Subscription into our local `subscriptions`
 * row using the single mapping helper in `lib/stripe.ts`, so the webhook and
 * the sync button can never drift apart.
 *
 * Matching strategy (in priority order) keeps things working even when the
 * Stripe event is missing metadata:
 *   1. `metadata.restenzo_restaurant_id`
 *   2. existing local row with the same `stripe_subscription_id`
 *   3. existing local row with the same `stripe_customer_id`
 *
 * Everything here is idempotent: replaying the same Stripe event simply
 * rewrites the same columns, never creating duplicate subscription rows.
 */
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  mapStripeSubscriptionToLocal,
  restaurantIdFromMetadata,
} from "@/lib/stripe";

/** Never log full tokens/secrets — only ids that are safe to surface. */
function logSync(scope: string, payload: Record<string, unknown>) {
  console.log(`[subscription-sync] ${scope}`, payload);
}

function customerIdOf(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string"
    ? sub.customer
    : sub.customer?.id ?? null;
}

/**
 * Resolves the local restaurant_id for a Stripe subscription using metadata
 * first, then the stored Stripe ids. Returns null when nothing matches.
 */
export async function resolveRestaurantId(
  sub: Stripe.Subscription
): Promise<number | null> {
  const metaId = restaurantIdFromMetadata(sub.metadata);
  if (metaId) {
    const owner = await prisma.restaurant.findUnique({
      where: { restaurant_id: metaId },
      select: { restaurant_id: true },
    });
    if (owner) return owner.restaurant_id;
  }

  const bySubId = await prisma.subscription.findFirst({
    where: { stripe_subscription_id: sub.id },
    select: { restaurant_id: true },
  });
  if (bySubId) return bySubId.restaurant_id;

  const customerId = customerIdOf(sub);
  if (customerId) {
    const byCustomer = await prisma.subscription.findFirst({
      where: { stripe_customer_id: customerId },
      select: { restaurant_id: true },
    });
    if (byCustomer) return byCustomer.restaurant_id;
  }

  return null;
}

export interface ReconcileResult {
  matched: boolean;
  restaurantId: number | null;
  status?: string;
  paymentStatus?: string;
}

/**
 * Writes the Stripe subscription state onto the local subscription row and
 * keeps the owning restaurant's status in sync. Safe to call repeatedly.
 */
export async function reconcileStripeSubscription(
  sub: Stripe.Subscription,
  context = "webhook"
): Promise<ReconcileResult> {
  const restaurantId = await resolveRestaurantId(sub);
  const fields = mapStripeSubscriptionToLocal(sub);

  if (!restaurantId) {
    logSync("no-local-match", {
      context,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: customerIdOf(sub),
      stripeStatus: sub.status,
      metadataRestaurantId: sub.metadata?.restenzo_restaurant_id ?? null,
    });
    return { matched: false, restaurantId: null };
  }

  const existing = await prisma.subscription.findUnique({
    where: { restaurant_id: restaurantId },
    select: { id: true, plan_id: true, billing_cycle: true },
  });

  if (existing) {
    await prisma.subscription.update({
      where: { restaurant_id: restaurantId },
      data: fields,
    });
  } else {
    // No local row yet (e.g. provisioned outside the signup flow). Derive the
    // plan/cycle from Stripe price metadata so the required columns are set.
    const planId = sub.items?.data?.[0]?.price?.metadata?.restenzo_plan ?? "single";
    const cycle =
      sub.items?.data?.[0]?.price?.metadata?.restenzo_cycle === "yearly"
        ? "yearly"
        : "monthly";
    await prisma.subscription.create({
      data: {
        restaurant_id: restaurantId,
        plan_id: planId,
        billing_cycle: cycle,
        ...fields,
      },
    });
  }

  // Keep the tenant status aligned with the billing lifecycle.
  if (sub.status === "canceled") {
    await prisma.restaurant.update({
      where: { restaurant_id: restaurantId },
      data: { status: "Inactive" },
    });
  } else if (sub.status === "unpaid") {
    await prisma.restaurant.update({
      where: { restaurant_id: restaurantId },
      data: { status: "Suspended" },
    });
  } else if (sub.status === "active" || sub.status === "trialing") {
    await prisma.restaurant.update({
      where: { restaurant_id: restaurantId },
      data: { status: "Active" },
    });
  }

  logSync("applied", {
    context,
    restaurantId,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: fields.stripe_customer_id,
    stripeStatus: sub.status,
    localStatus: fields.status,
    paymentStatus: fields.payment_status,
  });

  return {
    matched: true,
    restaurantId,
    status: fields.status,
    paymentStatus: fields.payment_status,
  };
}
