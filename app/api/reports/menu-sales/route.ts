import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  buildBranchScopeFilter,
  requireAuth,
} from "@/lib/server-auth";
import type { Prisma } from "@prisma/client";

const BOOKED_SALES_STATUSES = ["Paid", "Credit", "Complete", "Bill Generated"];

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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role === "ORDER_TAKER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId");
    const category = searchParams.get("category");
    const search = searchParams.get("search")?.trim() ?? "";
    const activeOnly = searchParams.get("activeOnly") !== "false";
    const dateFrom = parseDateStart(searchParams.get("dateFrom"));
    const dateTo = parseDateEnd(searchParams.get("dateTo"));

    const currentFrom = dateFrom ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const currentTo = dateTo ?? new Date();
    const durationMs = Math.max(1, currentTo.getTime() - currentFrom.getTime());
    const previousFrom = new Date(currentFrom.getTime() - durationMs);
    const previousTo = new Date(currentFrom.getTime() - 1);

    const requestedBranchId =
      branchIdParam && branchIdParam !== "all" ? Number(branchIdParam) : null;
    const scope = await buildBranchScopeFilter(auth, requestedBranchId);
    const scopedWhere = scope as Prisma.OrderItemWhereInput;

    const menuItemWhere: Prisma.MenuItemWhereInput = {
      ...(activeOnly ? { status: "ACTIVE" } : {}),
      ...(category && category !== "all" ? { category: { name: category } } : {}),
      ...(search
        ? {
            name: { contains: search, mode: "insensitive" },
          }
        : {}),
    };

    const currentItems = await prisma.orderItem.findMany({
      where: {
        ...scopedWhere,
        order: {
          order_status: { in: BOOKED_SALES_STATUSES },
          created_at: {
            gte: currentFrom,
            lte: currentTo,
          },
        },
        // Prevent "PKR 0" rows (deal components) from entering Menu Sales.
        // Deal bundle rows carry real totals; component rows are saved with total_amount=0.
        total_amount: { gt: 0 },
        menu_item: menuItemWhere,
      },
      select: {
        dish_id: true,
        branch_id: true,
        quantity: true,
        total_amount: true,
        menu_item: {
          select: {
            name: true,
            status: true,
            category: {
              select: { name: true },
            },
          },
        },
        branch: {
          select: { branch_name: true },
        },
      },
    });

    const previousItems = await prisma.orderItem.findMany({
      where: {
        ...scopedWhere,
        order: {
          order_status: { in: BOOKED_SALES_STATUSES },
          created_at: {
            gte: previousFrom,
            lte: previousTo,
          },
        },
        total_amount: { gt: 0 },
        menu_item: menuItemWhere,
      },
      select: {
        dish_id: true,
        quantity: true,
      },
    });

    const previousQtyMap = new Map<number, number>();
    for (const row of previousItems) {
      previousQtyMap.set(row.dish_id, (previousQtyMap.get(row.dish_id) ?? 0) + Number(row.quantity));
    }

    const aggregateMap = new Map<
      number,
      {
        soldQty: number;
        revenue: number;
        itemName: string;
        category: string;
        isActive: boolean;
        branchMap: Map<number, { branchName: string; qty: number; revenue: number }>;
      }
    >();

    for (const row of currentItems) {
      const existing = aggregateMap.get(row.dish_id) ?? {
        soldQty: 0,
        revenue: 0,
        itemName: row.menu_item.name,
        category: row.menu_item.category?.name ?? "Uncategorized",
        isActive: row.menu_item.status === "ACTIVE",
        branchMap: new Map<number, { branchName: string; qty: number; revenue: number }>(),
      };

      const qty = Number(row.quantity);
      const revenue = Number(row.total_amount);
      existing.soldQty += qty;
      existing.revenue += revenue;

      const branchRow = existing.branchMap.get(row.branch_id) ?? {
        branchName: row.branch.branch_name,
        qty: 0,
        revenue: 0,
      };
      branchRow.qty += qty;
      branchRow.revenue += revenue;
      existing.branchMap.set(row.branch_id, branchRow);

      aggregateMap.set(row.dish_id, existing);
    }

    const rows = [...aggregateMap.entries()].map(([dishId, value]) => {
      const prevQty = previousQtyMap.get(dishId) ?? 0;
      const trendPct =
        prevQty > 0
          ? Math.round(((value.soldQty - prevQty) / prevQty) * 100)
          : value.soldQty > 0
          ? 100
          : 0;
      const branchBreakdown = [...value.branchMap.entries()]
        .map(([branchId, branchStats]) => ({
          branchId,
          branchName: branchStats.branchName,
          qty: branchStats.qty,
          revenue: branchStats.revenue,
        }))
        .sort((a, b) => b.qty - a.qty);

      return {
        itemId: String(dishId),
        itemName: value.itemName,
        category: value.category,
        soldQty: value.soldQty,
        revenue: value.revenue,
        avgPrice: value.soldQty > 0 ? Math.round(value.revenue / value.soldQty) : 0,
        branchBreakdown,
        trendPct,
        isActive: value.isActive,
      };
    });

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/reports/menu-sales error:", err);
    return NextResponse.json({ error: "Failed to fetch menu sales" }, { status: 500 });
  }
}
