import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  requireAuth,
  requireSuperAdmin,
} from "@/lib/server-auth";
import {
  deriveSubscription,
  summarizeBilling,
  TRIAL_DAYS,
  addDays,
  type DerivedSubscription,
  type PlanPricing,
} from "@/lib/platform";
import { getPlans } from "@/lib/plans";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";

/**
 * GET /api/platform/overview
 *
 * Single consolidated endpoint that powers every page of the Platform
 * Admin (Dashboard, Restaurants, Subscriptions, Billing, Setup Health,
 * Support). All numbers are computed live from real DB rows — no fake
 * placeholder values anywhere.
 *
 * Only SUPER_ADMIN may call this route.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const [restaurants, branches, allUsers, planRecords] = await Promise.all([
      prisma.restaurant.findMany({
        orderBy: { created_at: "desc" },
        include: {
          _count: { select: { branches: true } },
          users: {
            where: { role: { in: ["RESTAURANT_ADMIN", "BRANCH_ADMIN"] } },
            select: {
              id: true,
              fullname: true,
              username: true,
              role: true,
              status: true,
              branch_id: true,
              created_at: true,
            },
          },
          subscription: true,
        },
      }),
      prisma.branch.findMany({
        orderBy: { created_at: "desc" },
        include: {
          restaurant: {
            select: {
              restaurant_id: true,
              name: true,
              status: true,
              has_multiple_branches: true,
            },
          },
          users: {
            where: { role: "BRANCH_ADMIN", status: "Active" },
            select: { id: true, fullname: true },
            take: 1,
          },
        },
      }),
      prisma.user.findMany({
        where: {
          role: { in: ["RESTAURANT_ADMIN", "BRANCH_ADMIN"] },
        },
        select: {
          id: true,
          fullname: true,
          role: true,
          status: true,
          created_at: true,
          restaurant: { select: { name: true } },
          branch: { select: { branch_name: true } },
        },
        orderBy: { created_at: "desc" },
      }),
      getPlans(),
    ]);

    const planPricing: PlanPricing[] = planRecords.map((p) => ({
      slug: p.slug,
      name: p.name,
      monthlyPrice: p.monthlyPrice,
      yearlyPrice: p.yearlyPrice,
    }));

    const now = new Date();

    /* ── Subscriptions (real row when Stripe has provisioned, derived fallback otherwise) ── */
    const subscriptions: DerivedSubscription[] = restaurants.map((r) =>
      deriveSubscription(
        {
        restaurant_id: r.restaurant_id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        has_multiple_branches: r.has_multiple_branches,
        created_at: r.created_at,
        billing_cycle: (r.subscription?.billing_cycle as
          | "monthly"
          | "yearly"
          | undefined) ?? undefined,
        subscription: r.subscription
          ? {
              plan_id: r.subscription.plan_id,
              billing_cycle: r.subscription.billing_cycle,
              status: r.subscription.status,
              payment_status: r.subscription.payment_status,
              stripe_customer_id: r.subscription.stripe_customer_id,
              stripe_subscription_id: r.subscription.stripe_subscription_id,
              trial_start: r.subscription.trial_start,
              trial_end: r.subscription.trial_end,
              current_period_start: r.subscription.current_period_start,
              current_period_end: r.subscription.current_period_end,
              cancel_at_period_end: r.subscription.cancel_at_period_end,
              canceled_at: r.subscription.canceled_at,
            }
          : null,
        },
        planPricing
      )
    );
    const billing = summarizeBilling(subscriptions);

    /* ── Top-line counts ── */
    const totalRestaurants = restaurants.length;
    const activeRestaurants = restaurants.filter((r) => r.status === "Active").length;
    const inactiveRestaurants = restaurants.filter((r) => r.status === "Inactive").length;
    const suspendedRestaurants = restaurants.filter((r) => r.status === "Suspended").length;
    const singleBranchRestaurants = restaurants.filter((r) => !r.has_multiple_branches).length;
    const multiBranchRestaurants = restaurants.filter((r) => r.has_multiple_branches).length;
    const totalBranches = branches.length;
    const restaurantAdmins = allUsers.filter(
      (u) => u.role === "RESTAURANT_ADMIN" && u.status === "Active"
    ).length;
    const branchAdmins = allUsers.filter(
      (u) => u.role === "BRANCH_ADMIN" && u.status === "Active"
    ).length;

    /* ── Tenant overview rows (one per restaurant) ── */
    const tenantRows = restaurants.map((r) => {
      const sub = subscriptions.find((s) => s.restaurantId === r.restaurant_id)!;
      const activeRa = r.users.find(
        (u) => u.role === "RESTAURANT_ADMIN" && u.status === "Active"
      );
      const activeBaCount = r.users.filter(
        (u) => u.role === "BRANCH_ADMIN" && u.status === "Active"
      ).length;
      const setupIssues: string[] = [];
      if (!activeRa) setupIssues.push("Restaurant Admin missing");
      if (r.has_multiple_branches && r._count.branches === 0) {
        setupIssues.push("Multi branch tenant has no branches");
      }
      if (
        r.has_multiple_branches &&
        r._count.branches > 0 &&
        activeBaCount === 0
      ) {
        setupIssues.push("Branches have no Branch Admin");
      }
      const setupComplete = setupIssues.length === 0;
      return {
        restaurantId: r.restaurant_id,
        name: r.name,
        slug: r.slug,
        phone: r.phone,
        status: r.status,
        type: r.has_multiple_branches ? "Multi Branch" : "Single Branch",
        hasMultipleBranches: r.has_multiple_branches,
        branchCount: r._count.branches,
        createdAt: r.created_at.toISOString(),
        owner: activeRa
          ? {
              userId: activeRa.id,
              fullName: activeRa.fullname ?? "",
              username: activeRa.username,
            }
          : null,
        branchAdminsAssigned: activeBaCount,
        setupComplete,
        setupIssues,
        subscription: {
          planId: sub.planId,
          planName: sub.planName,
          billingCycle: sub.billingCycle,
          status: sub.status,
          startDate: sub.startDate,
          trialEndsAt: sub.trialEndsAt,
          renewalDate: sub.renewalDate,
          monthlyPrice: sub.monthlyPrice,
          cyclePrice: sub.cyclePrice,
          paymentStatus: sub.paymentStatus,
        },
      };
    });

    /* ── Branch assignment overview ── */
    const restaurantAdminByRestaurantId = new Map<number, string>();
    restaurants.forEach((r) => {
      const ra = r.users.find(
        (u) => u.role === "RESTAURANT_ADMIN" && u.status === "Active"
      );
      if (ra?.fullname) {
        restaurantAdminByRestaurantId.set(r.restaurant_id, ra.fullname);
      }
    });

    const branchAssignmentOverview = branches.map((branch) => {
      const branchAdmin = branch.users[0];
      const isSingleBranch = branch.restaurant.has_multiple_branches === false;
      const fallbackRestaurantAdminName = isSingleBranch
        ? restaurantAdminByRestaurantId.get(branch.restaurant.restaurant_id) ?? null
        : null;

      const adminName =
        branchAdmin?.fullname ?? fallbackRestaurantAdminName ?? null;
      return {
        branchId: branch.branch_id,
        restaurantId: branch.restaurant.restaurant_id,
        restaurantName: branch.restaurant.name,
        branchName: branch.branch_name,
        branchCode: branch.branch_code,
        branchAdminAssigned: adminName != null,
        branchAdminName: adminName,
        status: branch.status,
        createdAt: branch.created_at.toISOString(),
      };
    });

    /* ── Setup health alerts ── */
    const setupAlerts: Array<{
      id: string;
      severity: "warning" | "critical";
      category:
        | "missing_restaurant_admin"
        | "no_branches"
        | "missing_branch_admin"
        | "inactive_restaurant"
        | "suspended_restaurant"
        | "trial_ending";
      title: string;
      detail: string;
      restaurantId: number;
      restaurantName: string;
    }> = [];

    restaurants.forEach((r) => {
      const sub = subscriptions.find((s) => s.restaurantId === r.restaurant_id)!;
      const hasRestaurantAdmin = r.users.some(
        (u) => u.role === "RESTAURANT_ADMIN" && u.status === "Active"
      );
      if (!hasRestaurantAdmin) {
        setupAlerts.push({
          id: `missing-ra-${r.restaurant_id}`,
          severity: "critical",
          category: "missing_restaurant_admin",
          title: "Restaurant has no Restaurant Admin",
          detail: `${r.name} needs a Restaurant Admin assignment before the tenant can operate.`,
          restaurantId: r.restaurant_id,
          restaurantName: r.name,
        });
      }
      if (r.status === "Inactive") {
        setupAlerts.push({
          id: `inactive-restaurant-${r.restaurant_id}`,
          severity: "warning",
          category: "inactive_restaurant",
          title: "Restaurant is inactive",
          detail: `${r.name} is currently inactive. Operational modules are frozen.`,
          restaurantId: r.restaurant_id,
          restaurantName: r.name,
        });
      }
      if (r.status === "Suspended") {
        setupAlerts.push({
          id: `suspended-restaurant-${r.restaurant_id}`,
          severity: "critical",
          category: "suspended_restaurant",
          title: "Restaurant is suspended",
          detail: `${r.name} is suspended. Restore or cancel the subscription.`,
          restaurantId: r.restaurant_id,
          restaurantName: r.name,
        });
      }
      if (r.has_multiple_branches && r._count.branches === 0) {
        setupAlerts.push({
          id: `no-branches-${r.restaurant_id}`,
          severity: "critical",
          category: "no_branches",
          title: "Multi branch restaurant has no branches",
          detail: `${r.name} is configured as multi branch but has no branch records yet.`,
          restaurantId: r.restaurant_id,
          restaurantName: r.name,
        });
      }
      // Flag trials that end within the next 3 days so support can reach out.
      if (sub.status === "Trial" && sub.trialEndsAt) {
        const ends = new Date(sub.trialEndsAt);
        const diffDays = Math.ceil(
          (ends.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays <= 3) {
          setupAlerts.push({
            id: `trial-ending-${r.restaurant_id}`,
            severity: "warning",
            category: "trial_ending",
            title: "Trial ending soon",
            detail: `${r.name} is on a free trial that ends in ${Math.max(diffDays, 0)} day${
              diffDays === 1 ? "" : "s"
            }.`,
            restaurantId: r.restaurant_id,
            restaurantName: r.name,
          });
        }
      }
    });

    branches.forEach((branch) => {
      if (
        branch.restaurant.has_multiple_branches &&
        branch.users.length === 0
      ) {
        setupAlerts.push({
          id: `missing-ba-${branch.branch_id}`,
          severity: "warning",
          category: "missing_branch_admin",
          title: "Branch has no Branch Admin",
          detail: `${branch.restaurant.name} · ${branch.branch_name} is missing a Branch Admin.`,
          restaurantId: branch.restaurant.restaurant_id,
          restaurantName: branch.restaurant.name,
        });
      }
    });

    /* ── Recent activity ── */
    const recentRestaurants = [...restaurants]
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, 6);
    const recentBranches = [...branches]
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, 6);
    const recentUsers = allUsers.slice(0, 6);

    const recentActivity = [
      ...recentRestaurants.map((r) => ({
        id: `restaurant-${r.restaurant_id}`,
        type: "restaurant_created" as const,
        message: `Restaurant created: ${r.name}`,
        createdAt: r.created_at.toISOString(),
      })),
      ...recentBranches.map((b) => ({
        id: `branch-${b.branch_id}`,
        type: "branch_created" as const,
        message: `Branch created: ${b.branch_name} · ${b.restaurant.name}`,
        createdAt: b.created_at.toISOString(),
      })),
      ...recentUsers.map((u) => ({
        id: `user-${u.id}`,
        type:
          u.role === "RESTAURANT_ADMIN"
            ? ("restaurant_admin_assigned" as const)
            : ("branch_admin_assigned" as const),
        message:
          u.role === "RESTAURANT_ADMIN"
            ? `Restaurant Admin assigned: ${u.fullname ?? "User"}${
                u.restaurant?.name ? ` · ${u.restaurant.name}` : ""
              }`
            : `Branch Admin assigned: ${u.fullname ?? "User"}${
                u.branch?.branch_name ? ` · ${u.branch.branch_name}` : ""
              }`,
        createdAt: u.created_at.toISOString(),
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 12);

    /* ── Growth charts (last 6 months) ── */
    const sixMonthsAgo = startOfMonth(subMonths(now, 5));
    function monthlySeries(rows: { created_at: Date }[]) {
      const buckets: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(now, i);
        const key = format(d, "yyyy-MM");
        buckets[key] = 0;
      }
      rows.forEach((row) => {
        const key = format(new Date(row.created_at), "yyyy-MM");
        if (buckets[key] !== undefined) buckets[key] += 1;
      });
      return Object.entries(buckets).map(([key, count]) => ({
        label: format(new Date(`${key}-01`), "MMM yy"),
        count,
      }));
    }
    const restaurantsLast6 = restaurants.filter(
      (r) =>
        r.created_at >= sixMonthsAgo && r.created_at <= endOfMonth(now)
    );
    const branchesLast6 = branches.filter(
      (b) =>
        b.created_at >= sixMonthsAgo && b.created_at <= endOfMonth(now)
    );

    /* ── Recent signups (restaurants created in the last 30 days) ── */
    const thirtyDaysAgo = addDays(now, -30);
    const recentSignups = restaurants
      .filter((r) => r.created_at >= thirtyDaysAgo)
      .map((r) => {
        const sub = subscriptions.find(
          (s) => s.restaurantId === r.restaurant_id
        )!;
        return {
          restaurantId: r.restaurant_id,
          name: r.name,
          type: r.has_multiple_branches ? "Multi Branch" : "Single Branch",
          createdAt: r.created_at.toISOString(),
          status: sub.status,
          planName: sub.planName,
        };
      })
      .slice(0, 8);

    /* ── Subscriptions by status for quick breakdown cards ── */
    const subscriptionsByStatus = {
      active: subscriptions.filter((s) => s.status === "Active").length,
      trial: subscriptions.filter((s) => s.status === "Trial").length,
      suspended: subscriptions.filter((s) => s.status === "Suspended").length,
      inactive: subscriptions.filter((s) => s.status === "Inactive").length,
      canceled: subscriptions.filter((s) => s.status === "Canceled").length,
    };

    return NextResponse.json({
      platformOverview: {
        totalRestaurants,
        activeRestaurants,
        inactiveRestaurants,
        suspendedRestaurants,
        singleBranchRestaurants,
        multiBranchRestaurants,
        totalBranches,
        restaurantAdmins,
        branchAdmins,
        pendingSetup: setupAlerts.length,
        trialDays: TRIAL_DAYS,
      },
      subscriptionsByStatus,
      billing,
      tenants: tenantRows,
      subscriptions,
      branchAssignmentOverview,
      setupAlerts,
      recentActivity,
      recentSignups,
      charts: {
        restaurantsCreated: monthlySeries(restaurantsLast6),
        branchesCreated: monthlySeries(branchesLast6),
        branchTypeDistribution: [
          { label: "Single Branch", count: singleBranchRestaurants },
          { label: "Multi Branch", count: multiBranchRestaurants },
        ],
        restaurantStatusDistribution: [
          { label: "Active", count: activeRestaurants },
          { label: "Inactive", count: inactiveRestaurants },
          { label: "Suspended", count: suspendedRestaurants },
        ],
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/platform/overview error:", err);
    return NextResponse.json(
      { error: "Failed to load platform overview" },
      { status: 500 }
    );
  }
}
