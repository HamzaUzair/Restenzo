import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  buildBranchScopeFilter,
  requireAuth,
} from "@/lib/server-auth";
import type { Prisma } from "@prisma/client";

const LEGACY_PAID_STATUSES = new Set(["Complete", "Bill Generated"]);
const BOOKED_SALES_STATUSES = new Set(["Paid", "Credit", "Complete", "Bill Generated"]);

function parseDateStart(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStatus(status: string) {
  if (LEGACY_PAID_STATUSES.has(status)) return "Paid";
  if (
    status === "Pending" ||
    status === "Running" ||
    status === "Served" ||
    status === "Paid" ||
    status === "Cancelled" ||
    status === "Credit"
  ) {
    return status;
  }
  return "Pending";
}

function normalizePaymentMode(mode: string) {
  if (mode === "Cash" || mode === "Card" || mode === "Online" || mode === "Credit") {
    return mode;
  }
  return "Cash";
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateLabel(key: string) {
  const date = new Date(`${key}T00:00:00.000Z`);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role === "ORDER_TAKER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId");
    const includeCancelled = searchParams.get("includeCancelled") === "true";
    const dateFrom = parseDateStart(searchParams.get("dateFrom"));
    const dateTo = parseDateEnd(searchParams.get("dateTo"));

    const requestedBranchId =
      branchIdParam && branchIdParam !== "all" ? Number(branchIdParam) : null;
    const scope = await buildBranchScopeFilter(auth, requestedBranchId);
    const where: Prisma.OrderWhereInput = { ...(scope as Prisma.OrderWhereInput) };
    if (dateFrom || dateTo) {
      where.created_at = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    const orders = await prisma.order.findMany({
      where,
      select: {
        order_id: true,
        branch_id: true,
        created_at: true,
        order_status: true,
        payment_mode: true,
        g_total_amount: true,
        discount_amount: true,
        service_charge: true,
        net_total_amount: true,
        branch: { select: { branch_name: true } },
      },
      orderBy: { created_at: "desc" },
      take: 1000,
    });

    const mappedOrders = orders
      .map((order) => ({
        id: String(order.order_id),
        orderNo: `ORD-${order.order_id}`,
        branchId: order.branch_id,
        branchName: order.branch.branch_name,
        status: normalizeStatus(order.order_status),
        paymentMethod: normalizePaymentMode(order.payment_mode),
        subtotal: Number(order.g_total_amount),
        discount: Number(order.discount_amount),
        tax: 0,
        serviceCharge: Number(order.service_charge),
        total: Number(order.net_total_amount),
        refundAmount: 0,
        createdAt: order.created_at.getTime(),
      }))
      .filter((row) => (includeCancelled ? true : row.status !== "Cancelled"));

    const booked = mappedOrders.filter((row) => BOOKED_SALES_STATUSES.has(row.status));
    // Business rule:
    // - Gross Sales: billed sales before deductions.
    // - Net Revenue: Gross - Discounts - Service Charges - Refunds.
    //   (Refunds are 0 for now until refund flow is introduced.)
    const grossSales = booked.reduce((sum, row) => sum + row.subtotal + row.serviceCharge, 0);
    const discountsGiven = booked.reduce((sum, row) => sum + row.discount, 0);
    const serviceCharges = booked.reduce((sum, row) => sum + row.serviceCharge, 0);
    const refundsAmount = 0;
    const netRevenue = grossSales - discountsGiven - serviceCharges - refundsAmount;
    const totalOrders = booked.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(netRevenue / totalOrders) : 0;

    let cashAmount = 0;
    let cashCount = 0;
    let cardAmount = 0;
    let cardCount = 0;
    let onlineAmount = 0;
    let onlineCount = 0;
    let creditAmount = 0;
    let creditCount = 0;
    for (const row of booked) {
      switch (row.paymentMethod) {
        case "Cash":
          cashAmount += row.total;
          cashCount += 1;
          break;
        case "Card":
          cardAmount += row.total;
          cardCount += 1;
          break;
        case "Online":
          onlineAmount += row.total;
          onlineCount += 1;
          break;
        case "Credit":
          creditAmount += row.total;
          creditCount += 1;
          break;
      }
    }

    const grouped = new Map<
      string,
      {
        date: string;
        dateLabel: string;
        orders: number;
        gross: number;
        discounts: number;
        refunds: number;
        tax: number;
        serviceCharges: number;
        net: number;
        cash: number;
        card: number;
        online: number;
        credit: number;
      }
    >();

    for (const row of booked) {
      const key = dateKey(new Date(row.createdAt));
      const existing = grouped.get(key) ?? {
        date: key,
        dateLabel: dateLabel(key),
        orders: 0,
        gross: 0,
        discounts: 0,
        refunds: 0,
        tax: 0,
        serviceCharges: 0,
        net: 0,
        cash: 0,
        card: 0,
        online: 0,
        credit: 0,
      };

      existing.orders += 1;
      existing.gross += row.subtotal + row.serviceCharge;
      existing.discounts += row.discount;
      existing.serviceCharges += row.serviceCharge;
      existing.net += row.subtotal - row.discount;
      switch (row.paymentMethod) {
        case "Cash":
          existing.cash += row.total;
          break;
        case "Card":
          existing.card += row.total;
          break;
        case "Online":
          existing.online += row.total;
          break;
        case "Credit":
          existing.credit += row.total;
          break;
      }

      grouped.set(key, existing);
    }

    const dailyRows = [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      orders: mappedOrders,
      kpis: {
        grossSales,
        netRevenue,
        totalOrders,
        avgOrderValue,
        cashAmount,
        cashCount,
        cardAmount,
        cardCount,
        onlineAmount,
        onlineCount,
        creditAmount,
        creditCount,
        taxCollected: 0,
        discountsGiven,
        discountCount: booked.filter((row) => row.discount > 0).length,
        refundsAmount,
        refundCount: 0,
        serviceCharges,
      },
      dailyRows,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/reports/sales-report error:", err);
    return NextResponse.json({ error: "Failed to fetch sales report" }, { status: 500 });
  }
}
