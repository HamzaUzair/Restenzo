import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Decimal, toNumber } from "@/lib/decimal";

/**
 * One row in either of the two top-selling lists. Both fields are populated
 * regardless of which list the row came from so the caller can show the
 * "primary" metric and the secondary one (e.g. quantity sold + revenue).
 */
export interface TopSellingItemRow {
  dish_id: number;
  itemId: number;
  itemName: string;
  categoryName: string;
  totalQuantitySold: number;
  totalSalesAmount: number;
}

export interface TopSellingItemLists {
  /** Items sorted by units sold (DESC), with name ASC as a stable tie-break. */
  byQuantity: TopSellingItemRow[];
  /** Items sorted by revenue (DESC), with name ASC as a stable tie-break. */
  bySales: TopSellingItemRow[];
}

export interface TopSellingItemsParams {
  /**
   * Restrict to a single branch. Takes precedence over `restaurantId`.
   * Pass `null`/`undefined` and `restaurantId` to scope to a tenant instead.
   */
  branchId?: number | null;
  /** Restrict to a tenant when `branchId` is not supplied. */
  restaurantId?: number | null;
  /** Inclusive lower bound on `Order.created_at`. */
  startDate?: Date | null;
  /** Inclusive upper bound on `Order.created_at`. */
  endDate?: Date | null;
  /**
   * Optional whitelist of `Order.order_status` values. Day End uses the
   * "booked sales" statuses ("Paid", "Credit", "Complete", "Bill Generated")
   * to match the rest of the day-end snapshot. The dashboard analytics path
   * leaves this `undefined` so it stays consistent with the existing KPIs
   * (which include all non-cancelled orders inside the date range).
   */
  orderStatuses?: string[];
  /** How many rows each list should contain. Defaults to 5. */
  limit?: number;
}

/**
 * Reusable aggregation for the "Top Selling Items" widgets shown on the
 * Branch Admin Dashboard and the Day End page.
 *
 * Uses two parallel `groupBy` calls so each list is computed by Postgres
 * directly (cheap), then resolves dish names + categories in one extra
 * `findMany` against the union of dish ids. No client-side ranking, no
 * full table scan in JS — same cost characteristics as the previous
 * single-sort code, just one extra `groupBy` pass.
 */
export async function getTopSellingItems(
  params: TopSellingItemsParams
): Promise<TopSellingItemLists> {
  const {
    branchId,
    restaurantId,
    startDate,
    endDate,
    orderStatuses,
    limit = 5,
  } = params;

  const orderWhere: Prisma.OrderWhereInput = {};
  if (branchId) {
    orderWhere.branch_id = branchId;
  } else if (restaurantId) {
    orderWhere.restaurant_id = restaurantId;
  }
  if (startDate || endDate) {
    orderWhere.created_at = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }
  if (orderStatuses && orderStatuses.length > 0) {
    orderWhere.order_status = { in: orderStatuses };
  }

  const itemWhere: Prisma.OrderItemWhereInput = { order: orderWhere };
  if (branchId) itemWhere.branch_id = branchId;

  const [byQtyRows, bySalesRows] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ["dish_id"],
      where: itemWhere,
      _sum: { quantity: true, total_amount: true },
      orderBy: [{ _sum: { quantity: "desc" } }],
      take: limit,
    }),
    prisma.orderItem.groupBy({
      by: ["dish_id"],
      where: itemWhere,
      _sum: { quantity: true, total_amount: true },
      orderBy: [{ _sum: { total_amount: "desc" } }],
      take: limit,
    }),
  ]);

  const dishIds = Array.from(
    new Set([
      ...byQtyRows.map((r) => r.dish_id),
      ...bySalesRows.map((r) => r.dish_id),
    ])
  );

  const dishes = dishIds.length
    ? await prisma.menuItem.findMany({
        where: { dish_id: { in: dishIds } },
        select: {
          dish_id: true,
          name: true,
          category: { select: { name: true } },
        },
      })
    : [];
  const dishMap = new Map(dishes.map((d) => [d.dish_id, d]));

  const toRow = (r: {
    dish_id: number;
    _sum: { quantity: Decimal | null; total_amount: Decimal | null };
  }): TopSellingItemRow => {
    const d = dishMap.get(r.dish_id);
    const name = d?.name ?? `Item #${r.dish_id}`;
    return {
      dish_id: r.dish_id,
      itemId: r.dish_id,
      itemName: name,
      categoryName: d?.category?.name ?? "—",
      totalQuantitySold: toNumber(r._sum.quantity),
      totalSalesAmount: toNumber(r._sum.total_amount),
    };
  };

  // Postgres' ordering for ties is unspecified, so we re-sort in JS with a
  // deterministic secondary key (name ASC) before returning. Keeps the UI
  // stable across reloads when two items have identical totals.
  const byQuantity = byQtyRows
    .map(toRow)
    .sort((a, b) =>
      b.totalQuantitySold !== a.totalQuantitySold
        ? b.totalQuantitySold - a.totalQuantitySold
        : a.itemName.localeCompare(b.itemName, undefined, { sensitivity: "base" })
    );

  const bySales = bySalesRows
    .map(toRow)
    .sort((a, b) =>
      b.totalSalesAmount !== a.totalSalesAmount
        ? b.totalSalesAmount - a.totalSalesAmount
        : a.itemName.localeCompare(b.itemName, undefined, { sensitivity: "base" })
    );

  return { byQuantity, bySales };
}
