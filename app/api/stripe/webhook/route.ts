/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook receiver. Keeps the `subscriptions` table in sync with
 * Stripe's view of the world. Handles:
 *
 *   - checkout.session.completed
 *   - customer.subscription.created
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - customer.subscription.trial_will_end
 *   - invoice.paid
 *   - invoice.payment_succeeded
 *   - invoice.payment_failed
 *   - setup_intent.succeeded           (card attached during onboarding)
 *   - payment_method.attached
 *
 * Signature verification relies on STRIPE_WEBHOOK_SECRET (use the Stripe CLI's
 * `whsec_...` value in test mode). When the secret is not configured we
 * log-and-accept the payload so local smoke tests still work, but production
 * should always have the secret set.
 *
 * All handlers are idempotent — replaying the same event simply rewrites the
 * same columns and never creates duplicate subscription rows.
 */
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeOrNull } from "@/lib/stripe";
import { reconcileStripeSubscription } from "@/lib/subscription-sync";

export const runtime = "nodejs";
// Disable Next's default JSON body parsing so we can hand Stripe the raw
// request body (needed for signature verification).
export const dynamic = "force-dynamic";

function customerIdOf(
  customer: string | { id: string } | null | undefined
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id ?? null;
}

/** Resolves and reconciles the subscription referenced by an invoice. */
async function reconcileInvoiceSubscription(
  stripe: Stripe,
  invoice: Stripe.Invoice
): Promise<boolean> {
  const inv = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const subscriptionId =
    typeof inv.subscription === "string"
      ? inv.subscription
      : inv.subscription?.id ?? null;

  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const result = await reconcileStripeSubscription(sub, "invoice");
    return result.matched;
  }
  return false;
}

async function applyInvoicePaidFallback(invoice: Stripe.Invoice) {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) return;
  await prisma.subscription.updateMany({
    where: { stripe_customer_id: customerId },
    data: { payment_status: "paid" },
  });
  console.log("[stripe-webhook] invoice paid (customer fallback)", {
    stripeCustomerId: customerId,
  });
}

async function applyInvoiceFailed(invoice: Stripe.Invoice) {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) return;
  await prisma.subscription.updateMany({
    where: { stripe_customer_id: customerId },
    data: { payment_status: "failed" },
  });
  console.log("[stripe-webhook] invoice payment failed", {
    stripeCustomerId: customerId,
  });
}

async function applyPaymentMethodAttached(pm: Stripe.PaymentMethod) {
  const customerId = customerIdOf(pm.customer);
  if (!customerId) return;
  await prisma.subscription.updateMany({
    where: { stripe_customer_id: customerId },
    data: { stripe_payment_method_id: pm.id },
  });
}

async function activateOnboardingByRestaurantId(restaurantId: number) {
  await prisma.$transaction([
    prisma.restaurant.update({
      where: { restaurant_id: restaurantId },
      data: { onboarding_complete: true, status: "Active" },
    }),
    prisma.user.updateMany({
      where: { restaurant_id: restaurantId, role: "RESTAURANT_ADMIN" },
      data: { status: "Active" },
    }),
  ]);
}

async function applySetupIntentSucceeded(si: Stripe.SetupIntent) {
  const customerId = customerIdOf(si.customer);
  let matchedRestaurantId: number | null = null;
  if (customerId) {
    const sub = await prisma.subscription.findFirst({
      where: { stripe_customer_id: customerId },
      select: { restaurant_id: true },
    });
    matchedRestaurantId = sub?.restaurant_id ?? null;
  }
  if (!matchedRestaurantId) {
    const metadataRestaurantId = Number(
      si.metadata?.restenzo_restaurant_id ?? 0
    );
    if (Number.isFinite(metadataRestaurantId) && metadataRestaurantId > 0) {
      matchedRestaurantId = metadataRestaurantId;
    }
  }
  if (matchedRestaurantId) {
    await activateOnboardingByRestaurantId(matchedRestaurantId);
    console.log("[stripe-webhook] onboarding activated", {
      restaurantId: matchedRestaurantId,
      setupIntentId: si.id,
    });
  } else {
    console.warn("[stripe-webhook] setup_intent.succeeded had no local match", {
      setupIntentId: si.id,
      customerId,
      metadataRestaurantId: si.metadata?.restenzo_restaurant_id ?? null,
    });
  }
}

async function applyCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const result = await reconcileStripeSubscription(sub, "checkout");
    if (result.matched && result.restaurantId) {
      await activateOnboardingByRestaurantId(result.restaurantId);
    }
    return;
  }

  // Subscription not attached to the session — fall back to metadata so we can
  // at least finalize onboarding for the right tenant.
  const metaId = Number(session.metadata?.restenzo_restaurant_id ?? 0);
  if (Number.isFinite(metaId) && metaId > 0) {
    await activateOnboardingByRestaurantId(metaId);
  } else {
    console.warn("[stripe-webhook] checkout.session.completed had no match", {
      sessionId: session.id,
      customerId: customerIdOf(session.customer as string | { id: string } | null),
    });
  }
}

export async function POST(request: NextRequest) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature") ?? "";
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const payload = await request.text();

  let event: Stripe.Event;
  if (secret && signature) {
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (err) {
      console.error("Invalid Stripe webhook signature:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else {
    // When STRIPE_WEBHOOK_SECRET isn't configured we still parse the
    // payload so local `stripe trigger` smoke tests work, but log a
    // warning so this is never missed in production.
    console.warn(
      "STRIPE_WEBHOOK_SECRET is not set — accepting unverified webhook payload. Set this before going live."
    );
    try {
      event = JSON.parse(payload) as Stripe.Event;
    } catch {
      return NextResponse.json({ error: "Bad payload" }, { status: 400 });
    }
  }

  console.log("[stripe-webhook] received", {
    type: event.type,
    id: event.id,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await applyCheckoutCompleted(
          stripe,
          event.data.object as Stripe.Checkout.Session
        );
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.trial_will_end": {
        await reconcileStripeSubscription(
          event.data.object as Stripe.Subscription,
          event.type
        );
        break;
      }
      case "payment_method.attached": {
        await applyPaymentMethodAttached(
          event.data.object as Stripe.PaymentMethod
        );
        break;
      }
      case "setup_intent.succeeded": {
        await applySetupIntentSucceeded(event.data.object as Stripe.SetupIntent);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // Reconcile the full subscription so status flips trialing → active in
        // the same beat as payment_status → paid. Fall back to a direct
        // customer-scoped update if the subscription can't be resolved.
        const matched = await reconcileInvoiceSubscription(stripe, invoice);
        if (!matched) await applyInvoicePaidFallback(invoice);
        break;
      }
      case "invoice.payment_failed": {
        await applyInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        // Silently accept other events so Stripe's dashboard stays green.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json(
      { error: "Webhook processing error" },
      { status: 500 }
    );
  }
}
