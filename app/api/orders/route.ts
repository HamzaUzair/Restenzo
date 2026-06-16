import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertBranchWriteAccess,
  AuthError,
  buildBranchScopeFilter,
  requireAuth,
} from "@/lib/server-auth";
import type { Prisma } from "@prisma/client";
import { formatBillNo, isLegacyReference } from "@/lib/bill-number";
import {
  isOrderTakerVisibleStatus,
  ORDER_TAKER_VISIBLE_STATUSES,
} from "@/lib/order-revenue";

/**
 * Order statuses that keep a dine-in table "Occupied". As soon as the order
 * leaves this set (e.g. the cashier marks it Paid or an admin cancels it),
 * the table is released back to "Available". Keep this in sync with
 * `ACTIVE_ORDER_STATUSES` in `app/api/orders/[id]/route.ts`.
 */
const ACTIVE_ORDER_STATUSES = [
  "Pending",
  "Running",
  "Served",
  "Credit",
] as const;

const TABLE_STATUS_OCCUPIED = "Occupied";

type CreateOrderItem = {
  menuId?: number | string;
  menuName?: string;
  categoryName?: string;
  variationName?: string | null;
  quantity?: number | string;
  unitPrice?: number | string;
};

type CreateOrderDeal = {
  dealId?: number | string;
  quantity?: number | string;
};

const DISCOUNT_META_TAG = "[DISCOUNT_META]";
const BILLING_META_TAG = "[BILLING_META]";

type DiscountMeta = {
  type: "Fixed Amount" | "Percentage";
  value: number;
  reason: string;
};

type BillingMeta = {
  discountType: "Fixed Amount" | "Percentage" | null;
  discountValue: number;
  discountReason: string | null;
  serviceChargePercent: number;
  serviceChargeAmount: number;
  gstPercent: number;
  gstAmount: number;
  subtotal: number;
};

function parseBillingMeta(rawComments: string | null | undefined): {
  notes: string;
  meta: BillingMeta | null;
} {
  if (!rawComments) return { notes: "", meta: null };
  const billingIdx = rawComments.indexOf(BILLING_META_TAG);
  if (billingIdx >= 0) {
    const notes = rawComments.slice(0, billingIdx).trim();
    const metaJson = rawComments.slice(billingIdx + BILLING_META_TAG.length).trim();
    try {
      const parsed = JSON.parse(metaJson) as BillingMeta;
      if (
        (parsed.discountType === null ||
          parsed.discountType === "Fixed Amount" ||
          parsed.discountType === "Percentage") &&
        Number.isFinite(parsed.discountValue) &&
        (parsed.discountReason === null || typeof parsed.discountReason === "string") &&
        Number.isFinite(parsed.serviceChargePercent) &&
        Number.isFinite(parsed.serviceChargeAmount) &&
        Number.isFinite(parsed.gstPercent) &&
        Number.isFinite(parsed.gstAmount) &&
        Number.isFinite(parsed.subtotal)
      ) {
        return { notes, meta: parsed };
      }
    } catch {
      // ignore malformed metadata
    }
  }
  const idx = rawComments.indexOf(DISCOUNT_META_TAG);
  if (idx < 0) return { notes: rawComments, meta: null };

  const notes = rawComments.slice(0, idx).trim();
  const metaJson = rawComments.slice(idx + DISCOUNT_META_TAG.length).trim();
  try {
    const parsed = JSON.parse(metaJson) as DiscountMeta;
    if (
      (parsed.type === "Fixed Amount" || parsed.type === "Percentage") &&
      Number.isFinite(parsed.value) &&
      typeof parsed.reason === "string"
    ) {
      return {
        notes,
        meta: {
          discountType: parsed.type,
          discountValue: parsed.value,
          discountReason: parsed.reason,
          serviceChargePercent: 0,
          serviceChargeAmount: 0,
          gstPercent: 0,
          gstAmount: 0,
          subtotal: 0,
        },
      };
    }
  } catch {
    // ignore malformed metadata
  }
  return { notes, meta: null };
}

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Returns the synthetic "Deal bundle" row in `menu_items` for a given deal.
 * These rows are kept for reporting (so deal sales show up as a single line
 * item on receipts / top-selling reports) but hidden from the Menu UI via
 * `show_in_menu=false`.
 */
async function ensureDealBundleDish(
  tx: Prisma.TransactionClient,
  branchId: number,
  dealName: string
) {
  const tagName = `Deal: ${dealName.trim()}`;
  const existing = await tx.menuItem.findFirst({
    where: { branch_id: branchId, name: tagName },
    select: { dish_id: true },
  });
  if (existing) return existing.dish_id;

  let category = await tx.category.findFirst({
    where: {
      branch_id: branchId,
      name: { equals: "Deals", mode: "insensitive" },
    },
    select: { category_id: true },
  });
  if (!category) {
    category = await tx.category.create({
      data: {
        name: "Deals",
        branch_id: branchId,
        terminal: 1,
        kid: 0,
      },
      select: { category_id: true },
    });
  }

  const created = await tx.menuItem.create({
    data: {
      name: tagName,
      description: null,
      price: 0,
      category_id: category.category_id,
      branch_id: branchId,
      terminal: 1,
      status: "ACTIVE",
      show_in_menu: false,
    },
    select: { dish_id: true },
  });
  return created.dish_id;
}

/**
 * For an order line referencing a variation (e.g. "Tea (Small)"), we keep a
 * dedicated row in `menu_items` so historical reporting can distinguish
 * variations. These rows are hidden from the Menu UI via `show_in_menu=false`.
 */
async function findOrCreateVariantDish(
  tx: Prisma.TransactionClient,
  {
    branchId,
    variantName,
    categoryId,
    price,
  }: {
    branchId: number;
    variantName: string;
    categoryId: number;
    price: number;
  }
) {
  const existing = await tx.menuItem.findFirst({
    where: {
      branch_id: branchId,
      name: { equals: variantName, mode: "insensitive" },
    },
    select: { dish_id: true },
  });
  if (existing) return existing.dish_id;

  const created = await tx.menuItem.create({
    data: {
      name: variantName,
      description: null,
      price,
      category_id: categoryId,
      branch_id: branchId,
      terminal: 1,
      status: "ACTIVE",
      show_in_menu: false,
    },
    select: { dish_id: true },
  });
  return created.dish_id;
}

function serializeOrder(order: {
  order_id: number;
  order_type: string;
  order_status: string;
  comments: string | null;
  payment_mode: string;
  discount_amount: unknown;
  service_charge: unknown;
  net_total_amount: unknown;
  created_at: Date;
  kitchen_started_at: Date | null;
  kitchen_served_at: Date | null;
  branch_id: number;
  branch: { branch_name: string };
  hall: { name: string } | null;
  table: { table_number: string } | null;
  order_items: Array<{
    item_id: number;
    quantity: unknown;
    price: unknown;
    total_amount: unknown;
    menu_item: { name: string };
  }>;
  /**
   * Latest payment row for this order, when one exists. Sorted by
   * `paid_at` desc by the caller so we read the active bill reference.
   * Legacy rows (pre bill-number format) store `ORD-<id>` here; we
   * normalize those to the canonical format at serialize time.
   */
  payments?: Array<{
    reference: string | null;
    external_reference: string | null;
    paid_at: Date;
  }>;
}) {
  const itemRows = order.order_items.map((item) => {
    const menuName = item.menu_item.name;
    const variationMatch = menuName.match(/\(([^)]+)\)$/);
    const variationName = variationMatch ? variationMatch[1] : null;
    const cleanName = variationMatch ? menuName.replace(/\s*\([^)]+\)\s*$/, "") : menuName;
    return {
      id: String(item.item_id),
      name: cleanName,
      variationName,
      qty: Number(item.quantity),
      price: Number(item.price),
    };
  });
  const { notes, meta } = parseBillingMeta(order.comments);
  const fallbackSubtotal =
    Number(order.net_total_amount) + Number(order.discount_amount) - Number(order.service_charge);
  const subtotal = meta?.subtotal && meta.subtotal > 0 ? meta.subtotal : Math.max(0, fallbackSubtotal);

  // Bill number resolution:
  //   1. Newest payment row with a canonical `BILL-...` reference wins.
  //   2. Otherwise (legacy `ORD-42` style, or payment row missing on
  //      orders that were paid before Payment was wired up) synthesize a
  //      deterministic bill number from `order_id` and the best
  //      available payment timestamp so the receipt still shows a clean
  //      id instead of `#`.
  //   3. Orders that haven't been paid yet get `null`.
  const latestPayment = order.payments?.[0];
  const isPaid =
    order.order_status === "Paid" ||
    order.order_status === "Complete" ||
    order.order_status === "Bill Generated";
  let billNo: string | null = null;
  if (latestPayment?.reference && !isLegacyReference(latestPayment.reference)) {
    billNo = latestPayment.reference;
  } else if (isPaid) {
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
    type: order.order_type as "Dine In" | "Take Away" | "Delivery",
    hall: order.hall?.name ?? undefined,
    table: order.table?.table_number ?? undefined,
    total: Number(order.net_total_amount),
    status:
      order.order_status === "Pending" ||
      order.order_status === "Running" ||
      order.order_status === "Served" ||
      order.order_status === "Paid" ||
      order.order_status === "Credit" ||
      order.order_status === "Cancelled"
        ? order.order_status
        : order.order_status === "Bill Generated" || order.order_status === "Complete"
        ? "Paid"
        : "Pending",
    paymentMode:
      order.payment_mode === "Cash" ||
      order.payment_mode === "Card" ||
      order.payment_mode === "Online" ||
      order.payment_mode === "Credit"
        ? order.payment_mode
        : "Cash",
    createdAt: new Date(order.created_at).getTime(),
    kitchenStartedAt: order.kitchen_started_at
      ? new Date(order.kitchen_started_at).getTime()
      : null,
    kitchenServedAt: order.kitchen_served_at
      ? new Date(order.kitchen_served_at).getTime()
      : null,
    items: itemRows,
    discount: Number(order.discount_amount),
    discountType: meta?.discountType ?? null,
    discountValue: meta?.discountValue ?? 0,
    discountReason: meta?.discountReason ?? null,
    subtotal,
    serviceChargePercent: meta?.serviceChargePercent ?? 0,
    gstPercent: meta?.gstPercent ?? 0,
    gstAmount: meta?.gstAmount ?? 0,
    serviceCharge: Number(order.service_charge),
    paid:
      order.order_status === "Paid" ||
      order.order_status === "Complete" ||
      order.order_status === "Bill Generated",
    /**
     * Cashier-entered Card invoice / Online txn ID captured at the
     * point of payment. Always null for Cash / unpaid orders so the
     * UI can hide the row without extra plumbing.
     */
    paymentReferenceId:
      latestPayment?.external_reference && latestPayment.external_reference.trim().length > 0
        ? latestPayment.external_reference
        : null,
    notes,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId");
    const statusParam = searchParams.get("status");
    const searchParam = searchParams.get("search")?.trim();

    const requestedBranchId =
      branchIdParam && branchIdParam !== "all" ? Number(branchIdParam) : null;
    const scope = await buildBranchScopeFilter(auth, requestedBranchId);
    const where: Prisma.OrderWhereInput = { ...(scope as Prisma.OrderWhereInput) };

    if (auth.role === "ORDER_TAKER") {
      where.order_status = { in: [...ORDER_TAKER_VISIBLE_STATUSES] };
      if (
        statusParam &&
        statusParam !== "all" &&
        isOrderTakerVisibleStatus(statusParam)
      ) {
        where.order_status = statusParam;
      }
    } else if (statusParam && statusParam !== "all") {
      where.order_status = statusParam;
    }
    if (searchParam) {
      const maybeId = Number(searchParam.replace(/^ORD-/i, "").trim());
      if (!Number.isNaN(maybeId)) {
        where.OR = [{ comments: { contains: searchParam, mode: "insensitive" } }];
      } else {
        where.OR = [{ comments: { contains: searchParam, mode: "insensitive" } }];
      }
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        branch: { select: { branch_name: true } },
        hall: { select: { name: true } },
        table: { select: { table_number: true } },
        order_items: {
          include: { menu_item: { select: { name: true } } },
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
      take: 200,
    });

    const filtered = orders.filter((order) => {
      if (!searchParam) return true;
      const q = searchParam.toLowerCase();
      return (
        `ord-${order.order_id}`.toLowerCase().includes(q) ||
        String(order.order_id).includes(q) ||
        order.order_items.some((i) => i.menu_item.name.toLowerCase().includes(q))
      );
    });

    return NextResponse.json(filtered.map(serializeOrder));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/orders error:", err);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.role !== "RESTAURANT_ADMIN" &&
      auth.role !== "BRANCH_ADMIN" &&
      auth.role !== "ORDER_TAKER" &&
      auth.role !== "CASHIER"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const orderType = String(body.orderType ?? "Dine In");
    const comments = typeof body.comments === "string" ? body.comments.trim() : "";
    const hallId = body.hallId ? Number(body.hallId) : null;
    const tableId = body.tableId ? Number(body.tableId) : null;
    const branchId = Number(body.branchId ?? auth.branchId);
    const rows = Array.isArray(body.items) ? (body.items as CreateOrderItem[]) : [];
    const dealRowsRaw = Array.isArray(body.deals) ? (body.deals as CreateOrderDeal[]) : [];

    if (!branchId || Number.isNaN(branchId)) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    await assertBranchWriteAccess(auth, branchId);

    const branchRecord = await prisma.branch.findUnique({
      where: { branch_id: branchId },
      select: { restaurant_id: true },
    });
    if (!branchRecord) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    const parsedDeals = dealRowsRaw
      .map((d) => ({
        dealId: Number(d.dealId),
        quantity: Math.max(1, toNumber(d.quantity, 1)),
      }))
      .filter((d) => Number.isFinite(d.dealId) && d.dealId > 0);

    if (rows.length === 0 && parsedDeals.length === 0) {
      return NextResponse.json(
        { error: "At least one menu item or deal is required" },
        { status: 400 }
      );
    }

    if (orderType === "Dine In") {
      if (!hallId || !tableId) {
        return NextResponse.json({ error: "Hall and table are required for dine in orders" }, { status: 400 });
      }
      const hall = await prisma.hall.findUnique({
        where: { hall_id: hallId },
        select: { hall_id: true, branch_id: true },
      });
      const table = await prisma.table.findUnique({
        where: { table_id: tableId },
        select: { table_id: true, branch_id: true, hall_id: true, status: true },
      });
      if (!hall || !table || hall.branch_id !== branchId || table.branch_id !== branchId || table.hall_id !== hallId) {
        return NextResponse.json({ error: "Invalid hall/table selection" }, { status: 400 });
      }

      // Hard guard against double-booking the same dine-in table. We check by
      // the authoritative "active order" status set (not just the stored
      // table flag) so a stale "Available" row from older data or a missed
      // status flip can't silently let a second order through.
      const activeOrder = await prisma.order.findFirst({
        where: {
          branch_id: branchId,
          table_id: tableId,
          order_status: { in: [...ACTIVE_ORDER_STATUSES] },
        },
        select: { order_id: true },
      });
      if (activeOrder) {
        return NextResponse.json(
          {
            error:
              "This table already has an active order. Please wait until the cashier marks it Paid.",
          },
          { status: 409 }
        );
      }
    }

    const parsedItems = rows.map((row) => {
      const qty = Math.max(1, toNumber(row.quantity, 1));
      const unitPrice = Math.max(0, toNumber(row.unitPrice, 0));
      return {
        menuId: Number(row.menuId),
        menuName: String(row.menuName ?? "").trim(),
        categoryName: String(row.categoryName ?? "").trim() || "General",
        variationName: row.variationName ? String(row.variationName).trim() : null,
        quantity: qty,
        unitPrice,
        lineTotal: qty * unitPrice,
      };
    });

    const menuSubtotal = parsedItems.reduce((sum, row) => sum + row.lineTotal, 0);

    const serviceCharge = 0;
    const discountAmount = 0;

    const created = await prisma.$transaction(async (tx) => {
      const dealSnapshots: Array<{
        dealId: number;
        name: string;
        dealQty: number;
        unitPrice: number;
        items: Array<{ dish_id: number; quantity: number }>;
      }> = [];

      let dealSubtotal = 0;
      for (const d of parsedDeals) {
        const deal = await tx.deal.findFirst({
          where: {
            id: d.dealId,
            branch_id: branchId,
            status: "Active",
          },
          include: {
            items: {
              include: {
                menu_item: { select: { dish_id: true, branch_id: true } },
              },
            },
          },
        });
        if (!deal) {
          throw new AuthError(`Deal not found or inactive: ${d.dealId}`, 404);
        }
        if (deal.items.length === 0) {
          throw new AuthError(`Deal has no items: ${deal.name}`, 400);
        }
        for (const di of deal.items) {
          if (di.menu_item.branch_id !== branchId) {
            throw new AuthError(`Deal item branch mismatch for deal: ${deal.name}`, 400);
          }
        }
        const unitPrice = Math.max(0, Number(deal.discount_value));
        dealSubtotal += unitPrice * d.quantity;
        dealSnapshots.push({
          dealId: deal.id,
          name: deal.name,
          dealQty: d.quantity,
          unitPrice,
          items: deal.items.map((it) => ({
            dish_id: it.menu_item.dish_id,
            quantity: it.quantity,
          })),
        });
      }

      const orderSubtotal = menuSubtotal + dealSubtotal;
      const netTotal = orderSubtotal + serviceCharge - discountAmount;

      const order = await tx.order.create({
        data: {
          order_type: orderType,
          order_status: "Pending",
          hall_id: orderType === "Dine In" ? hallId : null,
          table_id: orderType === "Dine In" ? tableId : null,
          comments: comments || null,
          order_taker_id: auth.id,
          branch_id: branchId,
          restaurant_id: branchRecord.restaurant_id,
          g_total_amount: orderSubtotal,
          service_charge: serviceCharge,
          discount_amount: discountAmount,
          net_total_amount: netTotal,
          payment_mode: "Cash",
          terminal: 1,
        },
      });

      for (const row of parsedItems) {
        const menu = await tx.menuItem.findUnique({
          where: { dish_id: row.menuId },
          select: {
            dish_id: true,
            name: true,
            branch_id: true,
            category_id: true,
          },
        });
        if (!menu || menu.branch_id !== branchId) {
          throw new AuthError(
            `Menu item not found for branch: ${row.menuName}`,
            400
          );
        }

        // If the caller chose a variation, we still want a dedicated
        // menu_items row for it so reporting can tell variants apart (same
        // behaviour as before the merge). Otherwise we reuse the parent row.
        const dishId = row.variationName
          ? await findOrCreateVariantDish(tx, {
              branchId,
              variantName: `${menu.name} (${row.variationName})`,
              categoryId: menu.category_id,
              price: row.unitPrice,
            })
          : menu.dish_id;

        await tx.orderItem.create({
          data: {
            order_id: order.order_id,
            dish_id: dishId,
            quantity: row.quantity,
            price: row.unitPrice,
            total_amount: row.lineTotal,
            branch_id: branchId,
          },
        });
      }

      for (const snap of dealSnapshots) {
        const bundleDishId = await ensureDealBundleDish(tx, branchId, snap.name);
        const bundleLineTotal = snap.unitPrice * snap.dealQty;
        await tx.orderItem.create({
          data: {
            order_id: order.order_id,
            dish_id: bundleDishId,
            quantity: snap.dealQty,
            price: snap.unitPrice,
            total_amount: bundleLineTotal,
            branch_id: branchId,
          },
        });
        for (const comp of snap.items) {
          const compQty = snap.dealQty * comp.quantity;
          await tx.orderItem.create({
            data: {
              order_id: order.order_id,
              dish_id: comp.dish_id,
              quantity: compQty,
              price: 0,
              total_amount: 0,
              branch_id: branchId,
            },
          });
        }
      }

      // Lock the table inside the same transaction so either both the order
      // row and the occupancy flag land, or neither does.
      if (orderType === "Dine In" && tableId) {
        await tx.table.update({
          where: { table_id: tableId },
          data: { status: TABLE_STATUS_OCCUPIED },
        });
      }

      const withItems = await tx.order.findUniqueOrThrow({
        where: { order_id: order.order_id },
        include: {
          branch: { select: { branch_name: true } },
          hall: { select: { name: true } },
          table: { select: { table_number: true } },
          order_items: {
            include: { menu_item: { select: { name: true } } },
            orderBy: { item_id: "asc" },
          },
        },
      });

      return withItems;
    });

    return NextResponse.json(serializeOrder(created), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/orders error:", err);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

