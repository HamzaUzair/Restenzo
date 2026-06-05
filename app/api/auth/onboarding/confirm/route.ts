import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSetupIntentByClientSecret, stripeEnabled } from "@/lib/stripe";

type ConfirmBody = {
  setupIntentClientSecret?: string;
  restaurantId?: number;
};

async function activateRestaurantOnboarding(restaurantId: number) {
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

export async function POST(request: NextRequest) {
  try {
    if (!stripeEnabled()) {
      return NextResponse.json(
        { activated: false, error: "Stripe is not configured" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as ConfirmBody;
    const setupIntentClientSecret = String(
      body.setupIntentClientSecret ?? ""
    ).trim();
    const expectedRestaurantId =
      typeof body.restaurantId === "number" && Number.isFinite(body.restaurantId)
        ? body.restaurantId
        : null;

    if (!setupIntentClientSecret) {
      return NextResponse.json(
        { activated: false, error: "Setup intent client secret is required" },
        { status: 400 }
      );
    }

    const setupIntent = await getSetupIntentByClientSecret(setupIntentClientSecret);
    if (setupIntent.status !== "succeeded") {
      return NextResponse.json({
        activated: false,
        pending: true,
        setupIntentStatus: setupIntent.status,
        message:
          "Payment setup is still processing. Please wait a moment and try again.",
      });
    }

    const customerId =
      typeof setupIntent.customer === "string"
        ? setupIntent.customer
        : setupIntent.customer?.id ?? null;

    const metadataRestaurantId = Number(
      setupIntent.metadata?.restenzo_restaurant_id ?? 0
    );

    const resolvedSubscription = customerId
      ? await prisma.subscription.findFirst({
          where: { stripe_customer_id: customerId },
        })
      : null;

    const fallbackRestaurantId =
      Number.isFinite(metadataRestaurantId) && metadataRestaurantId > 0
        ? metadataRestaurantId
        : null;

    let resolvedRestaurantId =
      resolvedSubscription?.restaurant_id ?? fallbackRestaurantId ?? null;

    // Local/test fallback: when Stripe customer linkage has not propagated
    // yet, allow resolving by expected restaurant id only if that tenant is
    // still in an incomplete onboarding state.
    if (!resolvedRestaurantId && expectedRestaurantId) {
      const pendingTenant = await prisma.restaurant.findFirst({
        where: {
          restaurant_id: expectedRestaurantId,
          onboarding_complete: false,
          users: {
            some: { role: "RESTAURANT_ADMIN", status: { not: "Active" } },
          },
        },
        select: { restaurant_id: true },
      });
      resolvedRestaurantId = pendingTenant?.restaurant_id ?? null;
    }

    if (!resolvedRestaurantId) {
      return NextResponse.json(
        {
          activated: false,
          pending: true,
          error:
            "We could not match your payment setup to an account yet. Please retry in a few seconds.",
        },
        { status: 409 }
      );
    }

    if (expectedRestaurantId && expectedRestaurantId !== resolvedRestaurantId) {
      return NextResponse.json(
        {
          activated: false,
          error:
            "Payment setup did not match the expected account. Please restart from login and use Complete payment setup.",
        },
        { status: 403 }
      );
    }

    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id ?? null;

    if (paymentMethodId) {
      await prisma.subscription.updateMany({
        where: { restaurant_id: resolvedRestaurantId },
        data: { stripe_payment_method_id: paymentMethodId },
      });
    }

    await activateRestaurantOnboarding(resolvedRestaurantId);

    return NextResponse.json({
      activated: true,
      restaurantId: resolvedRestaurantId,
      setupIntentStatus: setupIntent.status,
    });
  } catch (err) {
    console.error("POST /api/auth/onboarding/confirm error:", err);
    return NextResponse.json(
      { activated: false, error: "Failed to confirm onboarding status" },
      { status: 500 }
    );
  }
}
