/**
 * POST /api/auth/signup-trial
 *
 * Self-serve onboarding endpoint for the Restenzo marketing site. Creates:
 *
 *   1. A Restaurant row (single or multi branch)
 *   2. A default Branch for single-branch tenants
 *   3. A RESTAURANT_ADMIN User
 *   4. A Stripe Customer (metadata-pinned to the restaurant)
 *   5. A trialing Stripe Subscription with `payment_behavior: 'default_incomplete'`
 *      and `trial_period_days: 14` — card is NOT charged today
 *   6. A `subscriptions` row that mirrors the Stripe state
 *
 * The response includes a SetupIntent client_secret so the /onboarding page
 * can mount Stripe Elements and collect the card that will be used for the
 * first invoice once the trial ends.
 *
 * This endpoint is deliberately public (no auth) but is rate-limit-friendly:
 * duplicate emails fail with 409 and duplicate restaurant slugs are
 * deduplicated server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  validateEmailUsername,
  validateNameWithLetters,
} from "@/lib/user-validation";
import {
  ensureStripeCustomer,
  ensureStripePriceForPlan,
  createTrialSubscription,
  clientSecretFromSubscription,
  normalizeSubscriptionStatus,
  derivePaymentStatus,
  stripeEnabled,
  TRIAL_DAYS,
} from "@/lib/stripe";
import { generateUniqueBranchCode } from "@/lib/branch-code";
import { seedDefaultCategoriesForBranch } from "@/lib/seedDefaultCategories";
import type { BillingCycle } from "@/lib/pricing";
import { issueOnboardingResumeToken } from "@/lib/onboarding-resume";
import {
  hashPassword,
  upgradePasswordHashIfNeeded,
  verifyPassword,
} from "@/lib/password";

function slugify(input: string) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uniqueSlugFromName(name: string): Promise<string> {
  const base = slugify(name) || "restenzo";
  let slug = base;
  for (let i = 2; i < 1000; i++) {
    const clash = await prisma.restaurant.findUnique({ where: { slug } });
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

interface SignupBody {
  fullName?: string;
  email?: string;
  password?: string;
  restaurantName?: string;
  restaurantType?: "SINGLE" | "MULTI";
  cycle?: BillingCycle;
  phone?: string | null;
  address?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SignupBody;

    const fullName = String(body.fullName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const restaurantName = String(body.restaurantName ?? "").trim();
    const restaurantType =
      body.restaurantType === "MULTI" ? "MULTI" : "SINGLE";
    const cycle: BillingCycle = body.cycle === "yearly" ? "yearly" : "monthly";

    // ── Validation ──────────────────────────────────────────────────────
    const fullNameError = validateNameWithLetters(fullName);
    if (fullNameError) {
      return NextResponse.json({ error: fullNameError }, { status: 400 });
    }

    const restaurantNameError = validateNameWithLetters(
      restaurantName,
      "Restaurant name"
    );
    if (restaurantNameError) {
      return NextResponse.json({ error: restaurantNameError }, { status: 400 });
    }

    const emailError = validateEmailUsername(email, "Work email");
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findFirst({
      where: { username: { equals: email, mode: "insensitive" } },
      include: {
        restaurant: {
          select: {
            onboarding_complete: true,
          },
        },
      },
    });
    if (existingUser) {
      const isIncompleteSignup =
        existingUser.role === "RESTAURANT_ADMIN" &&
        existingUser.restaurant_id != null &&
        existingUser.status !== "Active" &&
        existingUser.restaurant?.onboarding_complete === false;

      if (isIncompleteSignup) {
        if (!(await verifyPassword(password, existingUser.password))) {
          return NextResponse.json(
            {
              error:
                "This email already exists with an incomplete signup. Use the same password to continue payment setup or sign in to resume.",
              errorCode: "ONBOARDING_INCOMPLETE",
              canResumeSetup: false,
            },
            { status: 409 }
          );
        }
        await upgradePasswordHashIfNeeded(
          existingUser.id,
          password,
          existingUser.password
        );
        return NextResponse.json(
          {
            error:
              "This account already exists but setup is incomplete. Continue payment setup to start your 14 day free trial.",
            errorCode: "ONBOARDING_INCOMPLETE",
            canResumeSetup: true,
            resumeToken: issueOnboardingResumeToken(existingUser.id, existingUser.username),
            resumeEmail: existingUser.username,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const hasMultipleBranches = restaurantType === "MULTI";
    const planId = hasMultipleBranches ? "multi" : "single";
    const slug = await uniqueSlugFromName(restaurantName);

    const stripeAvailable = stripeEnabled();

    // ── 1. Tenant + user provisioning ───────────────────────────────────
    // We create the restaurant row first so we can pin the Stripe Customer
    // metadata to a stable id. If Stripe fails afterwards the tenant is
    // still usable and the admin can retry onboarding from the portal.
    const provisioned = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          slug,
          phone: body.phone?.toString().trim() || null,
          address: body.address?.toString().trim() || null,
          status: "Active",
          has_multiple_branches: hasMultipleBranches,
          onboarding_complete: false,
        },
      });

      if (!hasMultipleBranches) {
        const branchCode = await generateUniqueBranchCode(slug, {
          suffix: "MAIN",
        });
        const mainBranch = await tx.branch.create({
          data: {
            branch_name: "Main Branch",
            branch_code: branchCode,
            restaurant_id: restaurant.restaurant_id,
            address: body.address?.toString().trim() || "",
            city: "",
            status: "Active",
          },
        });
        await seedDefaultCategoriesForBranch(mainBranch.branch_id, tx);
      }

      const user = await tx.user.create({
        data: {
          username: email,
          password: await hashPassword(password),
          fullname: fullName,
          role: "RESTAURANT_ADMIN",
          restaurant_id: restaurant.restaurant_id,
          branch_id: null,
          terminal: 1,
          // Keep new self-serve accounts blocked until Stripe onboarding
          // completes (setup_intent.succeeded webhook). In Stripe-disabled
          // environments we allow immediate access.
          status: stripeAvailable ? "Inactive" : "Active",
          token: randomUUID(),
        },
      });

      return { restaurant, user };
    });

    // ── 2. Stripe customer + trialing subscription ──────────────────────
    let stripeCustomerId: string | null = null;
    let stripeSubscriptionId: string | null = null;
    let stripePriceId: string | null = null;
    let clientSecret: string | null = null;
    let trialStart: Date | null = null;
    let trialEnd: Date | null = null;
    let currentPeriodStart: Date | null = null;
    let currentPeriodEnd: Date | null = null;
    let rawStatus = "trialing";
    let paymentStatus = "n_a";

    if (stripeAvailable) {
      try {
        const { priceId } = await ensureStripePriceForPlan(planId, cycle);
        stripePriceId = priceId;

        const customer = await ensureStripeCustomer({
          email,
          fullName,
          restaurantId: provisioned.restaurant.restaurant_id,
          restaurantName,
          planId,
        });
        stripeCustomerId = customer.id;

        const sub = await createTrialSubscription({
          customerId: customer.id,
          priceId,
          restaurantId: provisioned.restaurant.restaurant_id,
          planId,
          billingCycle: cycle,
        });
        stripeSubscriptionId = sub.id;
        rawStatus = normalizeSubscriptionStatus(sub.status);
        paymentStatus = derivePaymentStatus(sub);
        clientSecret = clientSecretFromSubscription(sub);
        trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
        trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
        // `current_period_start` / `current_period_end` live on the primary
        // subscription item; fall back to subscription-level values if the
        // SDK surfaces them (older API versions).
        const item = sub.items?.data?.[0];
        const subWithPeriods = sub as unknown as {
          current_period_start?: number | null;
          current_period_end?: number | null;
        };
        const cps =
          item?.current_period_start ?? subWithPeriods.current_period_start ?? null;
        const cpe =
          item?.current_period_end ?? subWithPeriods.current_period_end ?? null;
        currentPeriodStart = cps ? new Date(cps * 1000) : null;
        currentPeriodEnd = cpe ? new Date(cpe * 1000) : null;
      } catch (err) {
        console.error(
          "Stripe provisioning failed for restaurant",
          provisioned.restaurant.restaurant_id,
          err
        );
        // Don't fail the signup — the tenant still exists. The onboarding
        // page will surface the error and offer a retry.
      }
    }

    // Fallback trial window when Stripe is not configured.
    if (!trialStart) trialStart = new Date();
    if (!trialEnd) {
      const t = new Date(trialStart);
      t.setDate(t.getDate() + TRIAL_DAYS);
      trialEnd = t;
    }

    // ── 3. Persist subscription row ─────────────────────────────────────
    await prisma.subscription.upsert({
      where: { restaurant_id: provisioned.restaurant.restaurant_id },
      create: {
        restaurant_id: provisioned.restaurant.restaurant_id,
        plan_id: planId,
        billing_cycle: cycle,
        status: rawStatus,
        payment_status: paymentStatus,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_price_id: stripePriceId,
        trial_start: trialStart,
        trial_end: trialEnd,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
      },
      update: {
        plan_id: planId,
        billing_cycle: cycle,
        status: rawStatus,
        payment_status: paymentStatus,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_price_id: stripePriceId,
        trial_start: trialStart,
        trial_end: trialEnd,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
      },
    });

    return NextResponse.json(
      {
        restaurantId: provisioned.restaurant.restaurant_id,
        userId: provisioned.user.id,
        email,
        planId,
        cycle,
        trialEnd: trialEnd?.toISOString() ?? null,
        stripe: {
          enabled: stripeAvailable,
          customerId: stripeCustomerId,
          subscriptionId: stripeSubscriptionId,
          priceId: stripePriceId,
          clientSecret,
          publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/auth/signup-trial error:", err);
    return NextResponse.json(
      { error: "Signup failed. Please try again." },
      { status: 500 }
    );
  }
}
