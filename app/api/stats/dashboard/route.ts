import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  startOfDay,
  endOfDay,
  subDays,
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";
import {
  AuthError,
  buildBranchScopeFilter,
  requireAuth,
} from "@/lib/server-auth";
import type { Prisma } from "@prisma/client";
import { isBookedSalesStatus } from "@/lib/order-revenue";

/* ── GET /api/stats/dashboard ──
 *   - SUPER_ADMIN: optional ?restaurantId or ?branchId, otherwise platform-wide
 *   - RESTAURANT_ADMIN: locked to their restaurant; optional ?branchId within it
 *   - Staff: locked to their assigned branch
 */
function buildMonthlySeries<T extends { created_at: Date }>(
  rows: T[],
  months: number
) {
  const buckets: Record<string, number> = {};
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId");
    const requestedBranchId =
      branchIdParam && branchIdParam !== "all" ? Number(branchIdParam) : null;

    if (auth.role === "SUPER_ADMIN") {
      const [
        restaurants,
        branches,
        restaurantAdmins,
        branchAdmins,
        recentRestaurants,
        recentBranches,
        recentRestaurantAdminAssignments,
        recentBranchAdminAssignments,
      ] = await Promise.all([
        prisma.restaurant.findMany({
          include: {
            _count: { select: { branches: true } },
            users: {
              where: { role: { in: ["RESTAURANT_ADMIN", "BRANCH_ADMIN"] } },
              select: { id: true, role: true, fullname: true, status: true },
            },
          },
          orderBy: { created_at: "desc" },
        }),
        prisma.branch.findMany({
          include: {
            restaurant: { select: { name: true, has_multiple_branches: true } },
            users: {
              where: { role: "BRANCH_ADMIN", status: "Active" },
              select: { id: true, fullname: true },
              take: 1,
            },
          },
          orderBy: { created_at: "desc" },
        }),
        prisma.user.count({ where: { role: "RESTAURANT_ADMIN" } }),
        prisma.user.count({ where: { role: "BRANCH_ADMIN" } }),
        prisma.restaurant.findMany({
          select: { restaurant_id: true, name: true, created_at: true },
          orderBy: { created_at: "desc" },
          take: 6,
        }),
        prisma.branch.findMany({
          select: {
            branch_id: true,
            branch_name: true,
            created_at: true,
            restaurant: { select: { name: true } },
          },
          orderBy: { created_at: "desc" },
          take: 6,
        }),
        prisma.user.findMany({
          where: { role: "RESTAURANT_ADMIN" },
          select: {
            id: true,
            fullname: true,
            created_at: true,
            restaurant: { select: { name: true } },
          },
          orderBy: { created_at: "desc" },
          take: 6,
        }),
        prisma.user.findMany({
          where: { role: "BRANCH_ADMIN" },
          select: {
            id: true,
            fullname: true,
            created_at: true,
            branch: { select: { branch_name: true } },
          },
          orderBy: { created_at: "desc" },
          take: 6,
        }),
      ]);

      const totalRestaurants = restaurants.length;
      const activeRestaurants = restaurants.filter((r) => r.status === "Active").length;
      const singleBranchRestaurants = restaurants.filter(
        (r) => r.has_multiple_branches === false
      ).length;
      const multiBranchRestaurants = restaurants.filter(
        (r) => r.has_multiple_branches === true
      ).length;
      const totalBranches = branches.length;

      const setupAlerts: {
        id: string;
        severity: "warning" | "critical";
        title: string;
        detail: string;
      }[] = [];

      restaurants.forEach((restaurant) => {
        const hasRestaurantAdmin = restaurant.users.some(
          (u) => u.role === "RESTAURANT_ADMIN" && u.status === "Active"
        );
        if (!hasRestaurantAdmin) {
          setupAlerts.push({
            id: `missing-ra-${restaurant.restaurant_id}`,
            severity: "critical",
            title: "Restaurant has no Restaurant Admin",
            detail: `${restaurant.name} needs a Restaurant Admin assignment.`,
          });
        }
        if (restaurant.status !== "Active") {
          setupAlerts.push({
            id: `inactive-restaurant-${restaurant.restaurant_id}`,
            severity: "warning",
            title: "Restaurant inactive",
            detail: `${restaurant.name} is currently inactive.`,
          });
        }
        if (restaurant.has_multiple_branches && restaurant._count.branches === 0) {
          setupAlerts.push({
            id: `no-branches-${restaurant.restaurant_id}`,
            severity: "critical",
            title: "Multi-branch restaurant has no branches",
            detail: `${restaurant.name} is multi-branch but has no branch records yet.`,
          });
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
            title: "Branch has no Branch Admin",
            detail: `${branch.restaurant.name} / ${branch.branch_name} is missing a Branch Admin assignment.`,
          });
        }
      });

      const restaurantOverview = restaurants.map((restaurant) => {
        const activeRestaurantAdmins = restaurant.users.filter(
          (u) => u.role === "RESTAURANT_ADMIN" && u.status === "Active"
        ).length;
        const activeBranchAdmins = restaurant.users.filter(
          (u) => u.role === "BRANCH_ADMIN" && u.status === "Active"
        ).length;
        const setupStatus =
          restaurant.status !== "Active"
            ? ("Inactive" as const)
            : activeRestaurantAdmins === 0
            ? ("Missing Admin" as const)
            : restaurant.has_multiple_branches && restaurant._count.branches === 0
            ? ("Needs Setup" as const)
            : ("Healthy" as const);
        return {
          restaurantId: restaurant.restaurant_id,
          name: restaurant.name,
          type: restaurant.has_multiple_branches
            ? ("Multi Branch" as const)
            : ("Single Branch" as const),
          totalBranches: restaurant._count.branches,
          restaurantAdminAssigned: activeRestaurantAdmins > 0,
          branchAdminsAssigned: activeBranchAdmins,
          status: (restaurant.status === "Active" ? "Active" : "Inactive") as
            | "Active"
            | "Inactive",
          createdAt: new Date(restaurant.created_at).getTime(),
          setupStatus,
        };
      });

      // For single-branch restaurants we never create a separate Branch Admin
      // — the Restaurant Admin *is* the branch's admin. To avoid showing a
      // misleading "Missing" badge in the Branch Assignment Overview, fall
      // back to the tenant's Restaurant Admin full name when the branch has
      // no BA and its restaurant is single-branch.
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
          ? restaurantAdminByRestaurantId.get(branch.restaurant_id) ?? null
          : null;

        const adminName =
          branchAdmin?.fullname ?? fallbackRestaurantAdminName ?? null;
        const adminAssigned = adminName != null;

        return {
          branchId: branch.branch_id,
          restaurantName: branch.restaurant.name,
          branchName: branch.branch_name,
          branchCode: branch.branch_code,
          branchAdminAssigned: adminAssigned,
          branchAdminName: adminName,
          status: (branch.status === "Active" ? "Active" : "Inactive") as
            | "Active"
            | "Inactive",
        };
      });

      const recentActivity = [
        ...recentRestaurants.map((r) => ({
          id: `restaurant-${r.restaurant_id}`,
          type: "restaurant_created" as const,
          message: `Restaurant created: ${r.name}`,
          createdAt: new Date(r.created_at).getTime(),
        })),
        ...recentRestaurantAdminAssignments.map((u) => ({
          id: `ra-${u.id}`,
          type: "restaurant_admin_assigned" as const,
          message: `Restaurant Admin assigned: ${u.fullname ?? "User"}${
            u.restaurant?.name ? ` · ${u.restaurant.name}` : ""
          }`,
          createdAt: new Date(u.created_at).getTime(),
        })),
        ...recentBranches.map((b) => ({
          id: `branch-${b.branch_id}`,
          type: "branch_created" as const,
          message: `Branch created: ${b.branch_name}${
            b.restaurant?.name ? ` · ${b.restaurant.name}` : ""
          }`,
          createdAt: new Date(b.created_at).getTime(),
        })),
        ...recentBranchAdminAssignments.map((u) => ({
          id: `ba-${u.id}`,
          type: "branch_admin_assigned" as const,
          message: `Branch Admin assigned: ${u.fullname ?? "User"}${
            u.branch?.branch_name ? ` · ${u.branch.branch_name}` : ""
          }`,
          createdAt: new Date(u.created_at).getTime(),
        })),
      ]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 12);

      const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5));
      const restaurantsForTrend = await prisma.restaurant.findMany({
        where: { created_at: { gte: sixMonthsAgo, lte: endOfMonth(new Date()) } },
        select: { created_at: true },
      });
      const branchesForTrend = await prisma.branch.findMany({
        where: { created_at: { gte: sixMonthsAgo, lte: endOfMonth(new Date()) } },
        select: { created_at: true },
      });

      const branchesWithAdmin = branches.filter((b) => b.users.length > 0).length;
      const restaurantsWithAdmin = restaurantOverview.filter(
        (r) => r.restaurantAdminAssigned
      ).length;

      return NextResponse.json({
        superAdmin: {
          platformOverview: {
            totalRestaurants,
            activeRestaurants,
            singleBranchRestaurants,
            multiBranchRestaurants,
            totalBranches,
            restaurantAdmins,
            branchAdmins,
            pendingSetup: setupAlerts.length,
          },
          restaurantOverview,
          branchAssignmentOverview,
          recentActivity,
          setupAlerts: setupAlerts.slice(0, 15),
          charts: {
            restaurantsCreated: buildMonthlySeries(restaurantsForTrend, 6),
            branchesCreated: buildMonthlySeries(branchesForTrend, 6),
            branchTypeDistribution: [
              { label: "Single Branch", count: singleBranchRestaurants },
              { label: "Multi Branch", count: multiBranchRestaurants },
            ],
            restaurantStatusDistribution: [
              { label: "Active", count: activeRestaurants },
              { label: "Inactive", count: totalRestaurants - activeRestaurants },
            ],
            adminAssignmentCompletion: {
              restaurantsWithAdmin,
              totalRestaurants,
              branchesWithAdmin,
              totalBranches,
            },
          },
        },
      });
    }

    /* Branch where clause */
    const branchWhere: Prisma.BranchWhereInput = {};
    if (auth.role === "RESTAURANT_ADMIN") {
      if (!auth.restaurantId) throw new AuthError("Restaurant missing", 403);
      branchWhere.restaurant_id = auth.restaurantId;
      if (requestedBranchId) branchWhere.branch_id = requestedBranchId;
    } else {
      if (!auth.branchId) throw new AuthError("Branch missing", 403);
      branchWhere.branch_id = auth.branchId;
    }

    /* Order/operational scope filter (uses branch_id when staff or branch picked,
     * uses branch.restaurant_id for tenant scope, no filter for platform). */
    const orderScope = await buildBranchScopeFilter(auth, requestedBranchId);
    const opScope: Prisma.OrderWhereInput = {
      ...(orderScope as Prisma.OrderWhereInput),
    };

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const sevenDaysAgo = subDays(todayStart, 6);

    /* ── 1. Today's orders ── */
    const todayOrders = await prisma.order.findMany({
      where: {
        created_at: { gte: todayStart, lte: todayEnd },
        ...opScope,
      },
      select: {
        order_id: true,
        net_total_amount: true,
        order_status: true,
        branch_id: true,
      },
    });

    const todayBooked = todayOrders.filter((o) => isBookedSalesStatus(o.order_status));
    const todaySales = todayBooked.reduce(
      (sum, o) => sum + Number(o.net_total_amount || 0),
      0
    );
    const ordersToday = todayOrders.length;
    const avgOrderValue =
      todayBooked.length > 0 ? Math.round(todaySales / todayBooked.length) : 0;

    /* ── 2. Counts ── */
    const [totalBranches, menuItemsCount] = await Promise.all([
      prisma.branch.count({ where: branchWhere }),
      prisma.menuItem.count({ where: opScope as Prisma.MenuItemWhereInput }),
    ]);

    const activeDeals = await prisma.deal.count({
      where: { status: "Active", ...(opScope as Prisma.DealWhereInput) },
    });

    /* ── 4. Sales last 7 days ── */
    const ordersLast7 = await prisma.order.findMany({
      where: { created_at: { gte: sevenDaysAgo, lte: todayEnd }, ...opScope },
      select: { created_at: true, net_total_amount: true, order_status: true },
    });

    const salesByDate: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = subDays(todayStart, 6 - i);
      const key = format(d, "yyyy-MM-dd");
      salesByDate[key] = 0;
    }
    ordersLast7.forEach((o) => {
      const key = format(new Date(o.created_at), "yyyy-MM-dd");
      if (salesByDate[key] !== undefined && isBookedSalesStatus(o.order_status)) {
        salesByDate[key] += Number(o.net_total_amount || 0);
      }
    });
    const salesLast7Days = Object.entries(salesByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sales]) => ({
        date: format(new Date(date), "MMM d"),
        sales: Math.round(sales),
      }));

    /* ── 5. Branch performance today ── */
    const branches = await prisma.branch.findMany({
      where: { status: "Active", ...branchWhere },
      select: { branch_id: true, branch_name: true },
    });

    const branchStats = branches.map((b) => {
      const branchOrders = todayOrders.filter((o) => o.branch_id === b.branch_id);
      const running = branchOrders.filter((o) => o.order_status === "Running").length;
      const completed = branchOrders.filter((o) => o.order_status !== "Running").length;
      const bookedBranchOrders = branchOrders.filter((o) =>
        isBookedSalesStatus(o.order_status)
      );
      const sales = bookedBranchOrders.reduce(
        (sum, o) => sum + Number(o.net_total_amount || 0),
        0
      );
      const count = branchOrders.length;
      const aov = bookedBranchOrders.length > 0 ? Math.round(sales / bookedBranchOrders.length) : 0;
      return {
        branchId: b.branch_id,
        branchName: b.branch_name,
        todaySales: Math.round(sales),
        ordersToday: count,
        runningOrders: running,
        completedOrders: completed,
        avgOrderValue: aov,
      };
    });

    /* ── 6. Top selling items today ── */
    const orderIdsToday = todayBooked.map((o) => o.order_id);
    const orderItemsToday =
      orderIdsToday.length > 0
        ? await prisma.orderItem.findMany({
            where: { order_id: { in: orderIdsToday } },
            include: { menu_item: { select: { name: true } } },
          })
        : [];

    const itemQuantities: Record<string, { name: string; qty: number }> = {};
    orderItemsToday.forEach((oi) => {
      const name = oi.menu_item?.name ?? "Unknown";
      if (!itemQuantities[name]) itemQuantities[name] = { name, qty: 0 };
      itemQuantities[name].qty += Number(oi.quantity);
    });
    const topSellingItems = Object.values(itemQuantities)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map((x) => ({ name: x.name, quantity: x.qty }));

    /* ── 7. Best & lowest branch today ── */
    const withSales = branchStats.filter((b) => b.ordersToday > 0);
    const bestBranch =
      withSales.length > 0
        ? withSales.reduce((a, b) => (a.todaySales >= b.todaySales ? a : b))
        : null;
    const lowestBranch =
      withSales.length > 0
        ? withSales.reduce((a, b) => (a.todaySales <= b.todaySales ? a : b))
        : null;

    /* ── 8. Alerts ── */
    const alerts: { type: string; message: string }[] = [];

    // Inventory alerts were previously derived from a `qnty` column on
    // `dishes`; the column has been dropped as part of the schema cleanup
    // (inventory module was never wired up in the live app). Leaving a
    // placeholder so future work can re-introduce real stock alerts.

    const twentyMinsAgo = new Date(now.getTime() - 20 * 60 * 1000);
    const staleOrders = await prisma.order.count({
      where: {
        order_status: "Running",
        created_at: { lt: twentyMinsAgo },
        ...opScope,
      },
    });
    if (staleOrders > 0) {
      alerts.push({
        type: "orders",
        message: `${staleOrders} Order${staleOrders > 1 ? "s" : ""} Waiting > 20 Minutes`,
      });
    }

    return NextResponse.json({
      todaySales: Math.round(todaySales),
      ordersToday,
      avgOrderValue,
      totalBranches,
      menuItems: menuItemsCount,
      activeDeals,
      salesLast7Days,
      branchPerformance: branchStats,
      topSellingItems,
      bestBranch: bestBranch
        ? {
            branchName: bestBranch.branchName,
            todaySales: bestBranch.todaySales,
            ordersToday: bestBranch.ordersToday,
          }
        : null,
      lowestBranch: lowestBranch
        ? {
            branchName: lowestBranch.branchName,
            todaySales: lowestBranch.todaySales,
            ordersToday: lowestBranch.ordersToday,
          }
        : null,
      alerts,
      totalActiveBranches: branches.length,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/stats/dashboard error:", err);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
