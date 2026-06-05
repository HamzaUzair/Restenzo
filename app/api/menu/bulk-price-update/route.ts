import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertBranchWriteAccess,
  AuthError,
  requireAuth,
} from "@/lib/server-auth";

/**
 * Restaurant-friendly rounding: round to the nearest whole PKR.
 * Example: 199 + 2% = 202.98 → 203.
 */
function roundPrice(value: number): number {
  return Math.round(value);
}

function applyPercentage(oldPrice: number, percentage: number): number {
  const next = oldPrice + (oldPrice * percentage) / 100;
  return roundPrice(next);
}

/* ── POST /api/menu/bulk-price-update ──
 *
 * Increase the price of multiple selected menu items (and their variations)
 * by a percentage in a single transactional action.
 *
 * Body:
 *   - menuItemIds: number[]      (required, non-empty)
 *   - percentage: number         (required, > 0 and <= 100)
 *   - includeVariations: boolean (default true)
 *
 * Tenant safety is enforced per branch via `assertBranchWriteAccess`, so a
 * caller can never touch items outside the branch(es) they may edit. Platform
 * Admin is not required; operational roles that cannot edit menus (Order
 * Taker / Cashier / Live Kitchen / Accountant) are rejected.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    // Only menu-editing roles may run a bulk price update. The same roles that
    // are blocked from creating/editing single items are blocked here.
    if (
      auth.role === "ORDER_TAKER" ||
      auth.role === "CASHIER" ||
      auth.role === "LIVE_KITCHEN" ||
      auth.role === "ACCOUNTANT"
    ) {
      return NextResponse.json(
        { error: "You do not have permission to update menu prices" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      menuItemIds,
      percentage,
      includeVariations = true,
    } = body as {
      menuItemIds?: unknown;
      percentage?: unknown;
      includeVariations?: boolean;
    };

    /* ── Validate percentage ── */
    const pct = Number(percentage);
    if (percentage === undefined || percentage === null || Number.isNaN(pct)) {
      return NextResponse.json(
        { error: "A valid percentage is required" },
        { status: 400 }
      );
    }
    if (pct <= 0) {
      return NextResponse.json(
        { error: "Percentage must be greater than 0" },
        { status: 400 }
      );
    }
    if (pct > 100) {
      return NextResponse.json(
        { error: "Percentage must not exceed 100" },
        { status: 400 }
      );
    }

    /* ── Validate item ids ── */
    if (!Array.isArray(menuItemIds) || menuItemIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one menu item" },
        { status: 400 }
      );
    }
    const ids = Array.from(
      new Set(
        menuItemIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "No valid menu items were provided" },
        { status: 400 }
      );
    }

    /* ── Load the requested items (only browsable, non-archived rows) ── */
    const items = await prisma.menuItem.findMany({
      where: { dish_id: { in: ids }, show_in_menu: true },
      include: { variations: { orderBy: { sortOrder: "asc" } } },
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "None of the selected menu items could be found" },
        { status: 404 }
      );
    }

    /* ── Tenant safety: caller must be allowed to write every branch in scope.
     * This rejects cross-tenant ids and blocks read-only (multi-branch
     * Restaurant Admin head-office) callers before any data is touched. ── */
    const branchIds = Array.from(new Set(items.map((i) => i.branch_id)));
    for (const branchId of branchIds) {
      await assertBranchWriteAccess(auth, branchId);
    }

    const requestedCount = ids.length;
    const skippedItems = ids.filter(
      (id) => !items.some((i) => i.dish_id === id)
    );

    let updatedItemsCount = 0;
    let updatedPricesCount = 0;
    const changes: Array<{
      dish_id: number;
      name: string;
      branch_id: number;
      oldPrice: number;
      newPrice: number;
    }> = [];

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (item.has_variations) {
          // Update every variation price by the same percentage.
          const newVariationPrices: number[] = [];
          if (includeVariations) {
            for (const variation of item.variations) {
              const oldVarPrice = Number(variation.price);
              const newVarPrice = applyPercentage(oldVarPrice, pct);
              newVariationPrices.push(newVarPrice);
              if (newVarPrice !== oldVarPrice) {
                await tx.menuVariation.update({
                  where: { id: variation.id },
                  data: { price: new Prisma.Decimal(newVarPrice) },
                });
                updatedPricesCount += 1;
              }
            }
          } else {
            for (const variation of item.variations) {
              newVariationPrices.push(Number(variation.price));
            }
          }

          // Keep the order-side display price (`price`) in sync as the minimum
          // variation price, preserving existing min/max display logic.
          const oldDisplay = Number(item.price);
          const newDisplay =
            newVariationPrices.length > 0
              ? Math.min(...newVariationPrices)
              : oldDisplay;
          if (newDisplay !== oldDisplay) {
            await tx.menuItem.update({
              where: { dish_id: item.dish_id },
              data: { price: new Prisma.Decimal(newDisplay) },
            });
          }

          updatedItemsCount += 1;
          changes.push({
            dish_id: item.dish_id,
            name: item.name,
            branch_id: item.branch_id,
            oldPrice: oldDisplay,
            newPrice: newDisplay,
          });
        } else {
          const oldBase = Number(item.base_price ?? item.price);
          const newBase = applyPercentage(oldBase, pct);
          if (newBase !== oldBase) {
            await tx.menuItem.update({
              where: { dish_id: item.dish_id },
              data: {
                base_price: new Prisma.Decimal(newBase),
                price: new Prisma.Decimal(newBase),
              },
            });
            updatedPricesCount += 1;
          }
          updatedItemsCount += 1;
          changes.push({
            dish_id: item.dish_id,
            name: item.name,
            branch_id: item.branch_id,
            oldPrice: oldBase,
            newPrice: newBase,
          });
        }
      }
    });

    // Audit trail. There is no dedicated audit table in the schema, so we log
    // server-side without exposing sensitive info. Bulk price changes affect
    // live menu pricing, so a durable server record is important.
    console.info(
      "[menu.bulk-price-update]",
      JSON.stringify({
        userId: auth.id,
        role: auth.role,
        restaurantId: auth.restaurantId,
        branchIds,
        percentage: pct,
        includeVariations,
        requestedCount,
        updatedItemsCount,
        updatedPricesCount,
        skippedCount: skippedItems.length,
        at: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      success: true,
      percentage: pct,
      updatedItemsCount,
      updatedPricesCount,
      skippedItems,
      changes,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/menu/bulk-price-update error:", err);
    return NextResponse.json(
      { error: "Failed to update prices" },
      { status: 500 }
    );
  }
}
