import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  assertBranchAccess,
  assertBranchWriteAccess,
  requireAuth,
  type ServerAuthUser,
} from "@/lib/server-auth";
import {
  getTopSellingItems,
  type TopSellingItemRow,
} from "@/lib/topSellingItems";
import type {
  DayEndResponse,
  DayEndStats,
  DayEndSummary,
  ExpenseEntry,
  HourlySales,
  PaymentBreakdown,
  TopSellingItem,
} from "@/types/dayend";

/* ──────────────────────── Constants ──────────────────────── */

const BOOKED_SALES_STATUSES = [
  "Paid",
  "Credit",
  "Complete",
  "Bill Generated",
];
const CANCELLED_STATUSES = ["Cancelled"];

type PaymentKey = "Cash" | "Card" | "Online" | "Credit";

function normalizePaymentMode(mode: string): PaymentKey {
  if (mode === "Cash" || mode === "Card" || mode === "Online" || mode === "Credit") {
    return mode;
  }
  return "Cash";
}

/* ──────────────────────── Helpers ──────────────────────── */

/**
 * Build the [00:00, 23:59:59.999] range for a business date in the **server's
 * local timezone**.
 *
 * Rationale: `Order.created_at` and `Expense.expense_date` are written by
 * Prisma as UTC instants. The UI's date picker (`selectedDate`) reflects the
 * user's local calendar day. If we interpret the picked date as a UTC day we
 * slice the timeline at UTC midnight, which in PKT (UTC+5) excludes the first
 * 5 hours of every local day. Constructing the range with no `Z` makes Node
 * interpret the string in the process's local timezone, giving us a real
 * local-calendar day — matching what the cashier, expenses module, and user
 * actually see.
 */
function parseBusinessDate(value: string | null): { start: Date; end: Date; key: string } | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end, key: value };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Bucket by the **local** hour so the chart reflects what happened on the
 * wall clock for the selected business day (matches cashier shift hours). */
function hourKey(d: Date) {
  return `${pad2(d.getHours())}:00`;
}

/**
 * Anchor a business date to noon UTC for storage in `DayEnd.business_date`
 * (a Postgres DATE column). Noon UTC is the same calendar date in every
 * timezone between UTC-11 and UTC+11, so Postgres' cast to DATE yields the
 * intended day regardless of session timezone.
 */
function dateOnlyUTC(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

async function resolveBranch(
  user: ServerAuthUser,
  requestedBranchId: number | null
): Promise<{ branch_id: number; branch_name: string } | null> {
  // Branch-scoped roles: always use their own branch.
  if (
    user.role === "BRANCH_ADMIN" ||
    user.role === "ORDER_TAKER" ||
    user.role === "CASHIER" ||
    user.role === "ACCOUNTANT" ||
    user.role === "LIVE_KITCHEN"
  ) {
    if (!user.branchId) return null;
    const b = await prisma.branch.findUnique({
      where: { branch_id: user.branchId },
      select: { branch_id: true, branch_name: true, restaurant_id: true },
    });
    if (!b) return null;
    return { branch_id: b.branch_id, branch_name: b.branch_name };
  }

  // Super / Restaurant admin: use explicit branch, else first active branch in scope.
  if (requestedBranchId) {
    const b = await prisma.branch.findUnique({
      where: { branch_id: requestedBranchId },
      select: { branch_id: true, branch_name: true, restaurant_id: true, status: true },
    });
    if (!b) return null;
    if (user.role === "RESTAURANT_ADMIN" && b.restaurant_id !== user.restaurantId) return null;
    return { branch_id: b.branch_id, branch_name: b.branch_name };
  }

  const where: Prisma.BranchWhereInput = { status: "Active" };
  if (user.role === "RESTAURANT_ADMIN" && user.restaurantId) {
    where.restaurant_id = user.restaurantId;
  }
  const b = await prisma.branch.findFirst({
    where,
    orderBy: { branch_id: "asc" },
    select: { branch_id: true, branch_name: true },
  });
  return b ?? null;
}

/* ──────────────────────── GET ──────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    // CASHIER can view Day End for their own branch (auto-pinned via
    // `resolveBranch` below). `resolveBranch` ignores any `branchId` query
    // param for branch-scoped roles, so a cashier cannot read another
    // branch's day even by tampering with the URL.
    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.role !== "RESTAURANT_ADMIN" &&
      auth.role !== "BRANCH_ADMIN" &&
      auth.role !== "CASHIER"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId");
    const dateParam = searchParams.get("date");
    const requestedBranchId =
      branchIdParam && branchIdParam !== "all" ? Number(branchIdParam) : null;

    const dateRange = parseBusinessDate(dateParam);
    if (!dateRange) {
      return NextResponse.json({ error: "Valid date (YYYY-MM-DD) is required" }, { status: 400 });
    }

    const branch = await resolveBranch(auth, requestedBranchId);
    if (!branch) {
      return NextResponse.json({ error: "No branch available for this user" }, { status: 404 });
    }

    await assertBranchAccess(auth, branch.branch_id);

    const [orders, expenses, topSellingLists, closedRecord] = await Promise.all([
      prisma.order.findMany({
        where: {
          branch_id: branch.branch_id,
          created_at: { gte: dateRange.start, lte: dateRange.end },
        },
        select: {
          order_id: true,
          order_status: true,
          payment_mode: true,
          g_total_amount: true,
          discount_amount: true,
          service_charge: true,
          net_total_amount: true,
          created_at: true,
          order_taker: { select: { fullname: true, username: true } },
        },
        orderBy: { created_at: "asc" },
      }),
      prisma.expense.findMany({
        where: {
          branch_id: branch.branch_id,
          expense_date: { gte: dateRange.start, lte: dateRange.end },
        },
        select: {
          id: true,
          title: true,
          amount: true,
          expense_date: true,
          expenseCategory: { select: { name: true } },
        },
        orderBy: { expense_date: "asc" },
      }),
      // Pull both rankings (by-quantity + by-sales) for this branch+day in one
      // helper call. The helper restricts to "booked sales" statuses so it
      // matches the rest of the day-end snapshot (paid / credit / complete /
      // bill generated) and excludes cancelled / removed orders.
      getTopSellingItems({
        branchId: branch.branch_id,
        startDate: dateRange.start,
        endDate: dateRange.end,
        orderStatuses: BOOKED_SALES_STATUSES,
        limit: 10,
      }),
      prisma.dayEnd.findUnique({
        where: {
          branch_id_business_date: {
            branch_id: branch.branch_id,
            business_date: dateOnlyUTC(dateRange.key),
          },
        },
        include: {
          closed_by: { select: { fullname: true, username: true } },
        },
      }),
    ]);

    const booked = orders.filter((o) => BOOKED_SALES_STATUSES.includes(o.order_status));
    const cancelled = orders.filter((o) => CANCELLED_STATUSES.includes(o.order_status));

    const totalRevenue = booked.reduce((sum, o) => sum + Number(o.net_total_amount), 0);
    const grossSales = booked.reduce(
      (sum, o) => sum + Number(o.g_total_amount) + Number(o.service_charge),
      0
    );
    const discounts = booked.reduce((sum, o) => sum + Number(o.discount_amount), 0);
    const serviceCharges = booked.reduce((sum, o) => sum + Number(o.service_charge), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalOrders = booked.length;
    const cancelledOrders = cancelled.length;
    const netRevenue = totalRevenue - totalExpenses;
    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Payment breakdown (Cash / Card / Online / Credit).
    const paymentTotals: Record<PaymentKey, { amount: number; count: number }> = {
      Cash: { amount: 0, count: 0 },
      Card: { amount: 0, count: 0 },
      Online: { amount: 0, count: 0 },
      Credit: { amount: 0, count: 0 },
    };
    for (const o of booked) {
      const key = normalizePaymentMode(o.payment_mode);
      paymentTotals[key].amount += Number(o.net_total_amount);
      paymentTotals[key].count += 1;
    }
    const paidTotal =
      paymentTotals.Cash.amount +
      paymentTotals.Card.amount +
      paymentTotals.Online.amount +
      paymentTotals.Credit.amount;
    const payments: PaymentBreakdown[] = (["Cash", "Card", "Online", "Credit"] as const).map(
      (k) => ({
        method: k,
        amount: paymentTotals[k].amount,
        count: paymentTotals[k].count,
        percentage: paidTotal > 0 ? (paymentTotals[k].amount / paidTotal) * 100 : 0,
      })
    );

    // Hourly sales from booked orders.
    const hourlyMap = new Map<string, { orders: number; revenue: number }>();
    for (const o of booked) {
      const key = hourKey(o.created_at);
      const cur = hourlyMap.get(key) ?? { orders: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += Number(o.net_total_amount);
      hourlyMap.set(key, cur);
    }
    const hourlySales: HourlySales[] = [];
    for (let h = 0; h < 24; h += 1) {
      const key = `${pad2(h)}:00`;
      const v = hourlyMap.get(key) ?? { orders: 0, revenue: 0 };
      hourlySales.push({ hour: key, orders: v.orders, revenue: v.revenue });
    }
    // Trim leading/trailing zero windows for a cleaner chart but keep at least 6 hours.
    let startIdx = 0;
    let endIdx = 23;
    while (startIdx < endIdx && hourlySales[startIdx].orders === 0) startIdx += 1;
    while (endIdx > startIdx && hourlySales[endIdx].orders === 0) endIdx -= 1;
    if (endIdx - startIdx < 5) {
      // No real data yet — keep a 09:00..18:00 window so the UI has something sensible.
      startIdx = 9;
      endIdx = 18;
    }
    const trimmedHourly = hourlySales.slice(startIdx, endIdx + 1);

    // Top selling items — the helper already returns two rankings sorted
    // and limited to `take`. We project both into the day-end-friendly
    // `TopSellingItem` shape and keep the legacy `topItems` field aligned
    // with the by-sales list so the CSV export and any older consumer
    // continue to work unchanged.
    const toTopSellingItem = (r: TopSellingItemRow): TopSellingItem => ({
      dish_id: r.dish_id,
      name: r.itemName,
      category: r.categoryName,
      quantity: r.totalQuantitySold,
      revenue: r.totalSalesAmount,
    });
    const topItemsByQuantity = topSellingLists.byQuantity.map(toTopSellingItem);
    const topItemsBySales = topSellingLists.bySales.map(toTopSellingItem);
    const topItems = topItemsBySales;

    // Summary (Day Status).
    const firstOrder = orders[0];
    const openingTime = firstOrder
      ? `${pad2(firstOrder.created_at.getUTCHours())}:${pad2(firstOrder.created_at.getUTCMinutes())}`
      : "—";
    const openedBy =
      firstOrder?.order_taker?.fullname?.trim() ||
      firstOrder?.order_taker?.username ||
      "—";

    const summary: DayEndSummary = closedRecord
      ? {
          branchId: branch.branch_id,
          branchName: branch.branch_name,
          businessDate: dateRange.key,
          status: "closed",
          openedBy,
          openingTime,
          closedBy:
            closedRecord.closed_by?.fullname?.trim() ||
            closedRecord.closed_by?.username ||
            "—",
          closedAt: closedRecord.closing_date_time.toISOString(),
          dayEndId: closedRecord.id,
          note: closedRecord.note ?? undefined,
        }
      : {
          branchId: branch.branch_id,
          branchName: branch.branch_name,
          businessDate: dateRange.key,
          status: "open",
          openedBy,
          openingTime,
        };

    const stats: DayEndStats = {
      totalOrders,
      totalRevenue,
      totalExpenses,
      netRevenue,
      averageOrderValue,
      cancelledOrders,
      grossSales,
      discounts,
      serviceCharges,
    };

    const expenseEntries: ExpenseEntry[] = expenses.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.expenseCategory?.name ?? "Other",
      amount: Number(e.amount),
      createdAt: e.expense_date.toISOString(),
    }));

    const response: DayEndResponse = {
      summary,
      stats,
      payments,
      expenses: expenseEntries,
      topItems,
      topItemsByQuantity,
      topItemsBySales,
      hourlySales: trimmedHourly,
    };

    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/dayend error:", err);
    return NextResponse.json({ error: "Failed to fetch day end data" }, { status: 500 });
  }
}

/* ──────────────────────── POST (Close Day) ──────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    // CASHIER is allowed to close the day for their assigned branch.
    // `assertBranchWriteAccess` below verifies the requested branch matches
    // the cashier's own `branchId` (via `isBranchScopedRole`), so this can
    // never close another branch's day.
    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.role !== "RESTAURANT_ADMIN" &&
      auth.role !== "BRANCH_ADMIN" &&
      auth.role !== "CASHIER"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const requestedBranchId = Number(body.branchId);
    const dateStr = String(body.date ?? "").trim();
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!requestedBranchId || Number.isNaN(requestedBranchId)) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "Valid date (YYYY-MM-DD) is required" }, { status: 400 });
    }

    await assertBranchWriteAccess(auth, requestedBranchId);

    const range = parseBusinessDate(dateStr)!;
    const businessDate = dateOnlyUTC(range.key);

    // Prevent duplicate closure.
    const existing = await prisma.dayEnd.findUnique({
      where: {
        branch_id_business_date: {
          branch_id: requestedBranchId,
          business_date: businessDate,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This branch/day is already closed." },
        { status: 409 }
      );
    }

    // Compute snapshot totals from real DB data.
    const [orders, expensesAgg] = await Promise.all([
      prisma.order.findMany({
        where: {
          branch_id: requestedBranchId,
          created_at: { gte: range.start, lte: range.end },
        },
        select: {
          order_status: true,
          payment_mode: true,
          net_total_amount: true,
        },
      }),
      prisma.expense.aggregate({
        where: {
          branch_id: requestedBranchId,
          expense_date: { gte: range.start, lte: range.end },
        },
        _sum: { amount: true },
      }),
    ]);

    const booked = orders.filter((o) => BOOKED_SALES_STATUSES.includes(o.order_status));
    const cancelled = orders.filter((o) => CANCELLED_STATUSES.includes(o.order_status));
    const totalSales = booked.reduce((s, o) => s + Number(o.net_total_amount), 0);
    const totals = { Cash: 0, Card: 0, Online: 0, Credit: 0 } as Record<PaymentKey, number>;
    for (const o of booked) totals[normalizePaymentMode(o.payment_mode)] += Number(o.net_total_amount);
    const totalExpenses = Number(expensesAgg._sum.amount ?? 0);
    const netRevenue = totalSales - totalExpenses;

    const created = await prisma.dayEnd.create({
      data: {
        branch_id: requestedBranchId,
        business_date: businessDate,
        total_cash: new Prisma.Decimal(totals.Cash),
        total_bank: new Prisma.Decimal(totals.Card),
        total_easypaisa: new Prisma.Decimal(totals.Online),
        credit_sales: new Prisma.Decimal(totals.Credit),
        total_sales: new Prisma.Decimal(totalSales),
        total_expenses: new Prisma.Decimal(totalExpenses),
        closing_balance: new Prisma.Decimal(netRevenue),
        total_orders: booked.length,
        cancelled_orders: cancelled.length,
        closing_by: auth.id,
        closing_date_time: new Date(),
        note: note || null,
      },
      include: {
        closed_by: { select: { fullname: true, username: true } },
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        businessDate: range.key,
        totalSales,
        totalExpenses,
        netRevenue,
        totalOrders: booked.length,
        cancelledOrders: cancelled.length,
        closedBy:
          created.closed_by?.fullname?.trim() ||
          created.closed_by?.username ||
          "—",
        closedAt: created.closing_date_time.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/dayend error:", err);
    return NextResponse.json({ error: "Failed to close day" }, { status: 500 });
  }
}
