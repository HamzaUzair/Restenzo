import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  buildBranchScopeFilter,
  requireAuth,
} from "@/lib/server-auth";
import type { Prisma } from "@prisma/client";
import { formatBillNo, isLegacyReference } from "@/lib/bill-number";

const LEGACY_PAID_STATUSES = new Set(["Complete", "Bill Generated"]);

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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role === "ORDER_TAKER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId");
    const statusParam = searchParams.get("status");
    const paymentParam = searchParams.get("payment");
    const searchParam = searchParams.get("search")?.trim() ?? "";
    const dateFrom = parseDateStart(searchParams.get("dateFrom"));
    const dateTo = parseDateEnd(searchParams.get("dateTo"));

    const requestedBranchId =
      branchIdParam && branchIdParam !== "all" ? Number(branchIdParam) : null;
    const scope = await buildBranchScopeFilter(auth, requestedBranchId);
    const where: Prisma.OrderWhereInput = { ...(scope as Prisma.OrderWhereInput) };

    if (statusParam && statusParam !== "all") {
      where.order_status =
        statusParam === "Paid"
          ? { in: ["Paid", "Complete", "Bill Generated"] }
          : statusParam;
    }
    if (paymentParam && paymentParam !== "all") {
      where.payment_mode = paymentParam;
    }
    if (dateFrom || dateTo) {
      where.created_at = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    if (searchParam) {
      const normalized = searchParam.replace(/^ORD-/i, "").trim();
      const orderId = Number(normalized);
      if (!Number.isNaN(orderId)) {
        where.order_id = orderId;
      }
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        branch: { select: { branch_name: true } },
        hall: { select: { name: true } },
        table: { select: { table_number: true } },
        order_items: {
          include: {
            menu_item: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { item_id: "asc" },
        },
        payments: {
          select: {
            reference: true,
            external_reference: true,
            paid_at: true,
          },
          orderBy: { paid_at: "desc" },
          take: 1,
        },
      },
      orderBy: { created_at: "desc" },
      take: 500,
    });

    const payload = orders.map((order) => {
      const status = normalizeStatus(order.order_status);
      const paid = status === "Paid";
      // Match the logic in `/api/orders` so the Sales List and the
      // Cashier's paid-receipt screen always surface the same Bill ID
      // for the same order — see `lib/bill-number.ts`.
      const latestPayment = order.payments[0];
      let billNo: string | null = null;
      if (latestPayment?.reference && !isLegacyReference(latestPayment.reference)) {
        billNo = latestPayment.reference;
      } else if (paid) {
        billNo = formatBillNo(
          order.order_id,
          latestPayment?.paid_at ?? order.created_at
        );
      }
      return {
        id: String(order.order_id),
        orderNo: `ORD-${order.order_id}`,
        billNo,
        branchId: order.branch_id,
        branchName: order.branch.branch_name,
        type: order.order_type,
        table: order.table?.table_number ?? undefined,
        subtotal: Number(order.g_total_amount),
        discount: Number(order.discount_amount),
        serviceCharge: Number(order.service_charge),
        total: Number(order.net_total_amount),
        status,
        paymentMethod: normalizePaymentMode(order.payment_mode),
        paid,
        // Cashier-entered Card / Online reference; null for Cash and
        // for legacy paid rows captured before this column existed.
        paymentReferenceId:
          latestPayment?.external_reference && latestPayment.external_reference.trim().length > 0
            ? latestPayment.external_reference
            : null,
        createdAt: order.created_at.getTime(),
        items: order.order_items.map((item) => ({
          id: String(item.item_id),
          name: item.menu_item.name,
          qty: Number(item.quantity),
          price: Number(item.price),
        })),
      };
    });

    const filteredByLooseSearch = searchParam
      ? payload.filter((order) => order.orderNo.toLowerCase().includes(searchParam.toLowerCase()))
      : payload;

    return NextResponse.json(filteredByLooseSearch);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/reports/sales-list error:", err);
    return NextResponse.json({ error: "Failed to fetch sales list" }, { status: 500 });
  }
}
