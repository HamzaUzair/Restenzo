import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Decimal } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  requireAuth,
  requireSuperAdmin,
} from "@/lib/server-auth";
import { mapPrismaPlan } from "@/lib/plans";
import { validatePlanInput, type PlanFormInput } from "@/lib/plan-validation";
import { stripeEnabled, createStripePriceForPlan } from "@/lib/stripe";

/**
 * PUT /api/platform/plans/[id]
 *
 * Updates a plan's pricing, features, branch limit and flags. SUPER_ADMIN only.
 * The `slug` is immutable (it is the stable key shared with `Subscription`
 * rows and Stripe metadata).
 *
 * Stripe handling (Option B): when a non-custom plan's monthly/yearly amount
 * changes and Stripe is configured, a new immutable test Price is created and
 * its id stored. Old prices are left intact for existing subscriptions. If
 * Stripe is unavailable the save still succeeds (display-only) and a warning is
 * returned.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const { id } = await params;
    const planId = parseInt(id, 10);
    if (Number.isNaN(planId)) {
      return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
    }

    const existing = await prisma.plan.findUnique({ where: { id: planId } });
    if (!existing) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const body = await request.json();
    const input: PlanFormInput = {
      // slug is immutable — always use the stored one for validation caps.
      slug: existing.slug,
      name: String(body.name ?? ""),
      description: String(body.description ?? ""),
      monthlyPrice: Number(body.monthlyPrice),
      yearlyPrice: Number(body.yearlyPrice),
      currency: String(body.currency ?? existing.currency ?? "USD"),
      billingLabel: String(body.billingLabel ?? ""),
      ctaLabel: String(body.ctaLabel ?? ""),
      isActive: Boolean(body.isActive),
      isPopular: Boolean(body.isPopular),
      isCustom: Boolean(body.isCustom),
      maxBranches:
        body.maxBranches === null || body.maxBranches === "" || body.maxBranches === undefined
          ? null
          : Number(body.maxBranches),
      features: Array.isArray(body.features) ? body.features.map(String) : [],
      stripeMonthlyPriceId: String(body.stripeMonthlyPriceId ?? ""),
      stripeYearlyPriceId: String(body.stripeYearlyPriceId ?? ""),
    };

    const { valid, errors, normalized } = validatePlanInput(input);
    if (!valid) {
      return NextResponse.json(
        { error: errors[0], errors },
        { status: 400 }
      );
    }

    const monthlyChanged =
      Number(existing.monthly_price) !== normalized.monthlyPrice;
    const yearlyChanged =
      Number(existing.yearly_price) !== normalized.yearlyPrice;

    // ── Stripe (Option B): mint new immutable prices when amounts change ──
    let stripeMonthlyPriceId = existing.stripe_monthly_price_id;
    let stripeYearlyPriceId = existing.stripe_yearly_price_id;
    let stripeWarning: string | null = null;

    if (!normalized.isCustom && stripeEnabled()) {
      try {
        if (monthlyChanged) {
          stripeMonthlyPriceId = await createStripePriceForPlan({
            slug: existing.slug,
            name: normalized.name,
            description: normalized.description,
            cycle: "monthly",
            unitAmount: Math.round(normalized.monthlyPrice * 100),
          });
        }
        if (yearlyChanged) {
          stripeYearlyPriceId = await createStripePriceForPlan({
            slug: existing.slug,
            name: normalized.name,
            description: normalized.description,
            cycle: "yearly",
            unitAmount: Math.round(normalized.yearlyPrice * 12 * 100),
          });
        }
      } catch (e) {
        stripeWarning =
          "Plan saved, but creating new Stripe test prices failed: " +
          (e instanceof Error ? e.message : "unknown error") +
          ". New checkouts will use the previous Stripe price until this is resolved.";
      }
    } else if (!normalized.isCustom && (monthlyChanged || yearlyChanged)) {
      stripeWarning =
        "Display price updated. Stripe is not configured, so no new Stripe price was created — wire STRIPE_SECRET_KEY to sync new checkouts.";
    }

    const updated = await prisma.plan.update({
      where: { id: planId },
      data: {
        name: normalized.name,
        description: normalized.description || null,
        monthly_price: new Decimal(normalized.monthlyPrice),
        yearly_price: new Decimal(normalized.yearlyPrice),
        currency: normalized.currency,
        billing_label: normalized.billingLabel || null,
        cta_label: normalized.ctaLabel || null,
        is_active: normalized.isActive,
        is_popular: normalized.isPopular,
        is_custom: normalized.isCustom,
        max_branches: normalized.maxBranches,
        features: normalized.features,
        stripe_monthly_price_id: stripeMonthlyPriceId,
        stripe_yearly_price_id: stripeYearlyPriceId,
      },
    });

    return NextResponse.json({
      plan: mapPrismaPlan(updated),
      stripeWarning,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PUT /api/platform/plans/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update plan" },
      { status: 500 }
    );
  }
}
