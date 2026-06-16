import type { Prisma } from "@prisma/client";
import { Decimal } from "@/lib/decimal";

/**
 * Shared helpers for resolving and persisting deal lines.
 *
 * A deal line can reference either a plain menu item (`variationId = null`)
 * or one specific variation of a menu item. We snapshot the name and price at
 * save time so existing deals stay stable even if the underlying menu item is
 * later renamed or repriced, and we re-validate every line server-side so a
 * caller can never smuggle in a cross-tenant item, an inactive item, or a
 * variation that does not belong to the chosen item.
 */

export type IncomingDealLine = {
  id?: string | number;
  name?: string;
  variationId?: number | string | null;
  quantity?: number | string;
};

export type NormalizedDealLine = {
  dishId: number;
  variationId: number | null;
  quantity: number;
};

/**
 * Coerce the raw request payload into clean, de-duplicated lines. Lines with
 * an invalid dish/variation id are dropped; duplicate (dish, variation) pairs
 * collapse to a single line (last one wins) so the
 * `@@unique([deal_id, dish_id, variation_id])` constraint never trips.
 */
export function normalizeDealLines(
  items: IncomingDealLine[] | undefined
): NormalizedDealLine[] {
  if (!Array.isArray(items)) return [];

  const byKey = new Map<string, NormalizedDealLine>();
  for (const raw of items) {
    const dishId = Number(raw?.id);
    if (!Number.isInteger(dishId) || dishId <= 0) continue;

    const rawVariation = raw?.variationId;
    const variationId =
      rawVariation === null || rawVariation === undefined || rawVariation === ""
        ? null
        : Number(rawVariation);
    if (
      variationId !== null &&
      (!Number.isInteger(variationId) || variationId <= 0)
    ) {
      continue;
    }

    const quantity = Math.max(1, Math.floor(Number(raw?.quantity) || 1));
    const key = `${dishId}:${variationId ?? "base"}`;
    byKey.set(key, { dishId, variationId, quantity });
  }

  return Array.from(byKey.values());
}

/**
 * Resolve a single normalized line against the database within the given
 * branch. Returns the `DealItem` row data (minus `deal_id`) ready for
 * insertion, or `null` when the line is invalid (inactive/missing item, or a
 * variation that does not belong to the item / branch).
 */
export async function buildDealItemData(
  tx: Prisma.TransactionClient,
  branchId: number,
  line: NormalizedDealLine
): Promise<Omit<Prisma.DealItemCreateManyInput, "deal_id"> | null> {
  const dish = await tx.menuItem.findFirst({
    where: {
      dish_id: line.dishId,
      branch_id: branchId,
      status: "ACTIVE",
      show_in_menu: true,
    },
    select: { dish_id: true, name: true, base_price: true, price: true },
  });
  if (!dish) return null;

  let variationName: string | null = null;
  let unitPrice = Number(dish.base_price ?? dish.price ?? 0);

  if (line.variationId !== null) {
    const variation = await tx.menuVariation.findFirst({
      where: { id: line.variationId, menuId: line.dishId },
      select: { id: true, name: true, price: true },
    });
    // A variation must belong to the selected item; otherwise drop the line.
    if (!variation) return null;
    variationName = variation.name;
    unitPrice = Number(variation.price);
  }

  return {
    dish_id: dish.dish_id,
    variation_id: line.variationId,
    quantity: line.quantity,
    unit_price_snapshot: new Decimal(unitPrice),
    item_name_snapshot: dish.name,
    variation_name_snapshot: variationName,
  };
}

/** Build the public/UI-facing display name for a deal line. */
export function dealLineDisplayName(
  itemName: string,
  variationName: string | null | undefined
): string {
  return variationName ? `${itemName} (${variationName})` : itemName;
}
