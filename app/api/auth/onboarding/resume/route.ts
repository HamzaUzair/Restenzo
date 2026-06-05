import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  clientSecretFromSubscription,
  createSetupIntentForCustomer,
  getSubscriptionById,
  stripeEnabled,
} from "@/lib/stripe";
import { verifyOnboardingResumeToken } from "@/lib/onboarding-resume";

type ResumeBody = {
  token?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ResumeBody;
    const token = String(body.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ error: "Resume token is required" }, { status: 400 });
    }

    const payload = verifyOnboardingResumeToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Resume link is invalid or expired" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.uid },
      include: {
        restaurant: {
          include: {
            subscription: true,
          },
        },
      },
    });

    if (
      !user ||
      user.username.toLowerCase() !== payload.email.toLowerCase() ||
      user.role !== "RESTAURANT_ADMIN" ||
      !user.restaurant_id ||
      !user.restaurant
    ) {
      return NextResponse.json({ error: "Resume context not found" }, { status: 404 });
    }

    if (user.status === "Active" || user.restaurant.onboarding_complete) {
      return NextResponse.json(
        { error: "Your account setup is already complete. Please sign in." },
        { status: 409 }
      );
    }

    const subscription = user.restaurant.subscription;
    if (!subscription) {
      return NextResponse.json(
        { error: "We couldn't find your pending subscription setup." },
        { status: 409 }
      );
    }

    if (!stripeEnabled()) {
      return NextResponse.json(
        { error: "Billing setup is not available in this environment." },
        { status: 503 }
      );
    }

    let clientSecret: string | null = null;
    if (subscription.stripe_subscription_id) {
      try {
        const stripeSub = await getSubscriptionById(subscription.stripe_subscription_id);
        clientSecret = clientSecretFromSubscription(stripeSub);
      } catch (err) {
        console.error("Failed to retrieve Stripe subscription for resume flow:", err);
      }
    }

    if (!clientSecret && subscription.stripe_customer_id) {
      try {
        clientSecret = await createSetupIntentForCustomer({
          customerId: subscription.stripe_customer_id,
          restaurantId: user.restaurant_id,
          planId: subscription.plan_id,
          billingCycle:
            subscription.billing_cycle === "yearly" ? "yearly" : "monthly",
        });
      } catch (err) {
        console.error("Failed to create setup intent for resume flow:", err);
      }
    }

    if (!clientSecret) {
      return NextResponse.json(
        {
          error:
            "We couldn't initialize payment setup right now. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        restaurantId: user.restaurant_id,
        userId: user.id,
        email: user.username,
        planId: subscription.plan_id,
        cycle: subscription.billing_cycle === "yearly" ? "yearly" : "monthly",
        trialEnd: subscription.trial_end?.toISOString() ?? null,
        clientSecret,
        publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/auth/onboarding/resume error:", err);
    return NextResponse.json(
      { error: "Failed to resume onboarding setup" },
      { status: 500 }
    );
  }
}
