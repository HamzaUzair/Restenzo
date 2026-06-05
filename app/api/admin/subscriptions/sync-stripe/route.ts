/**
 * POST /api/admin/subscriptions/sync-stripe
 *
 * Platform Admin (SUPER_ADMIN) only. Reconciles every local `subscriptions`
 * row against Stripe's current state. This is the safety net for local /
 * test-mode development where Stripe CLI webhook forwarding may not always be
 * running: instead of staying stuck on `trialing` / `n_a` forever, an admin
 * can hit this endpoint (via the "Sync Stripe" button on the Subscriptions
 * page) to pull the live status, payment status and period dates from Stripe.
 *
 * For each subscription it:
 *   - retrieves the Stripe subscription by stored `stripe_subscription_id`
 *     (falling back to the customer's latest subscription when the id is
 *     missing)
 *   - rewrites status / payment_status / period dates through the same
 *     `reconcileStripeSubscription` helper the webhook uses
 *
 * Everything is idempotent and never charges a card — it only reads Stripe.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuth, requireSuperAdmin } from "@/lib/server-auth";
import { getStripeOrNull } from "@/lib/stripe";
import { reconcileStripeSubscription } from "@/lib/subscription-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const stripe = getStripeOrNull();
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
        { status: 503 }
      );
    }

    const subs = await prisma.subscription.findMany({
      where: {
        OR: [
          { stripe_subscription_id: { not: null } },
          { stripe_customer_id: { not: null } },
        ],
      },
      select: {
        restaurant_id: true,
        stripe_subscription_id: true,
        stripe_customer_id: true,
      },
    });

    let matched = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ restaurantId: number; message: string }> = [];

    for (const row of subs) {
      try {
        let stripeSub = null;

        if (row.stripe_subscription_id) {
          stripeSub = await stripe.subscriptions.retrieve(
            row.stripe_subscription_id
          );
        } else if (row.stripe_customer_id) {
          const list = await stripe.subscriptions.list({
            customer: row.stripe_customer_id,
            status: "all",
            limit: 1,
          });
          stripeSub = list.data[0] ?? null;
        }

        if (!stripeSub) {
          skipped += 1;
          continue;
        }

        const result = await reconcileStripeSubscription(stripeSub, "manual-sync");
        if (result.matched) {
          matched += 1;
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown Stripe error";
        // Most common in test mode: a subscription id created in a different
        // Stripe account / mode. Log and continue rather than aborting the run.
        console.warn("[sync-stripe] failed for restaurant", {
          restaurantId: row.restaurant_id,
          message,
        });
        errors.push({ restaurantId: row.restaurant_id, message });
      }
    }

    console.log("[sync-stripe] completed", {
      total: subs.length,
      matched,
      updated,
      skipped,
      errors: errors.length,
    });

    return NextResponse.json({
      ok: true,
      total: subs.length,
      matched,
      updated,
      skipped,
      errors,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/admin/subscriptions/sync-stripe error:", err);
    return NextResponse.json(
      { error: "Failed to sync subscriptions with Stripe" },
      { status: 500 }
    );
  }
}
