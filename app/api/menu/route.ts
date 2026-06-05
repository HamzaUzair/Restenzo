import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertBranchWriteAccess,
  AuthError,
  buildBranchScopeFilter,
  requireAuth,
} from "@/lib/server-auth";

type IncomingVariation = { name?: string; price?: number | string };

function normalizeVariations(input: unknown) {
  if (!Array.isArray(input)) return [];

  const normalized = input
    .map((row) => ({
      name: typeof row?.name === "string" ? row.name.trim() : "",
      price:
        typeof row?.price === "number"
          ? row.price
          : typeof row?.price === "string"
          ? Number(row.price)
          : NaN,
    }))
    .filter((row) => row.name.length > 0 || !Number.isNaN(row.price));

  return normalized;
}

function validateVariationRows(rows: Array<{ name: string; price: number }>) {
  if (rows.length === 0) return "At least one variation is required";

  for (const row of rows) {
    if (!row.name) return "Variation name is required";
    if (Number.isNaN(row.price)) return "Variation price is required";
    if (row.price < 0) return "Variation price must be zero or greater";
  }

  const unique = new Set(rows.map((r) => r.name.toLowerCase()));
  if (unique.size !== rows.length) {
    return "Duplicate variation names are not allowed";
  }

  return null;
}

type SerializableMenuItem = {
  dish_id: number;
  name: string;
  description: string | null;
  price: Prisma.Decimal | number | string;
  base_price: Prisma.Decimal | number | string | null;
  has_variations: boolean;
  status: "ACTIVE" | "INACTIVE";
  branch_id: number;
  branch: { branch_id: number; branch_name: string };
  category: { category_id: number; name: string };
  variations: Array<{
    id: number;
    name: string;
    price: Prisma.Decimal | number | string;
    sortOrder: number;
  }>;
  created_at: Date;
  updated_at: Date;
};

function serialize(item: SerializableMenuItem) {
  return {
    id: item.dish_id,
    itemName: item.name,
    description: item.description,
    price: Number(item.price),
    branchId: item.branch_id,
    branchName: item.branch.branch_name,
    category: item.category.name,
    hasVariations: item.has_variations,
    basePrice: item.base_price === null ? null : Number(item.base_price),
    variations: item.variations.map((v) => ({
      id: v.id,
      name: v.name,
      price: Number(v.price),
      sortOrder: v.sortOrder,
      // Variations have no independent status column — they are live whenever
      // their parent item is. Exposed so callers (e.g. Deals) get a stable
      // contract that already accounts for a future per-variation status.
      status: "active" as const,
    })),
    status: item.status === "ACTIVE" ? "active" : "inactive",
    createdAt: item.created_at.toISOString(),
    updatedAt: item.updated_at.toISOString(),
  };
}

/* ── GET /api/menu ── */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId");
    const statusParam = searchParams.get("status"); // "active" | "inactive" | omit for all
    const categoryParam = searchParams.get("category");
    const searchParam = searchParams.get("search")?.trim();

    const requestedBranchId =
      branchIdParam && branchIdParam !== "all" ? Number(branchIdParam) : null;
    const scopeFilter = await buildBranchScopeFilter(
      auth,
      requestedBranchId,
      "branch_id"
    );
    const where: Prisma.MenuItemWhereInput = {
      ...(scopeFilter as Prisma.MenuItemWhereInput),
      // Hide synthetic variant rows (e.g. "Tea (Small)") that the order
      // flow creates; those are never directly browsable in the Menu UI.
      show_in_menu: true,
    };
    if (statusParam === "active" || statusParam === "inactive") {
      where.status = statusParam === "active" ? "ACTIVE" : "INACTIVE";
    }
    if (categoryParam && categoryParam !== "all") {
      where.category = { name: categoryParam };
    }
    if (searchParam) {
      where.OR = [
        { name: { contains: searchParam, mode: "insensitive" } },
        { description: { contains: searchParam, mode: "insensitive" } },
        { category: { name: { contains: searchParam, mode: "insensitive" } } },
      ];
    }

    const items = await prisma.menuItem.findMany({
      where,
      include: {
        branch: {
          select: { branch_id: true, branch_name: true },
        },
        category: {
          select: { category_id: true, name: true },
        },
        variations: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(items.map(serialize));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/menu error:", err);
    return NextResponse.json(
      { error: "Failed to fetch menu items" },
      { status: 500 }
    );
  }
}

/* ── POST /api/menu ── */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role === "ORDER_TAKER") {
      return NextResponse.json(
        { error: "Order Taker cannot manage menu items" },
        { status: 403 }
      );
    }
    const body = await request.json();
    const {
      itemName,
      description,
      branchId,
      category,
      status,
      hasVariations,
      basePrice,
      variations,
    } = body as {
      itemName?: string;
      description?: string | null;
      branchId?: number | string;
      category?: string;
      status?: string;
      hasVariations?: boolean;
      basePrice?: number | string | null;
      variations?: IncomingVariation[];
    };

    if (!itemName?.trim()) {
      return NextResponse.json(
        { error: "Item name is required" },
        { status: 400 }
      );
    }
    if (status !== "active" && status !== "inactive") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (!branchId) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    if (!category?.trim()) {
      return NextResponse.json(
        { error: "Category is required" },
        { status: 400 }
      );
    }

    const hasVars = Boolean(hasVariations);
    const normalizedRows = normalizeVariations(variations);

    let basePriceNum: number | null = null;
    if (!hasVars) {
      basePriceNum = Number(basePrice);
      if (basePrice === undefined || basePrice === null || isNaN(basePriceNum)) {
        return NextResponse.json(
          { error: "Price is required and must be a valid number" },
          { status: 400 }
        );
      }
      if (basePriceNum < 0) {
        return NextResponse.json(
          { error: "Price must be zero or greater" },
          { status: 400 }
        );
      }
    } else {
      const castRows = normalizedRows.map((r) => ({ name: r.name, price: r.price }));
      const variationErr = validateVariationRows(castRows);
      if (variationErr) {
        return NextResponse.json({ error: variationErr }, { status: 400 });
      }
    }

    const branch = await prisma.branch.findUnique({
      where: { branch_id: Number(branchId) },
    });
    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    await assertBranchWriteAccess(auth, branch.branch_id);

    const categoryRecord = await prisma.category.findFirst({
      where: {
        branch_id: Number(branchId),
        name: category.trim(),
      },
      select: { category_id: true },
    });
    if (!categoryRecord) {
      return NextResponse.json(
        { error: "Selected category is not available for this branch" },
        { status: 400 }
      );
    }

    const created = await prisma.menuItem.create({
      data: {
        name: itemName.trim(),
        description: description?.trim() || null,
        branch_id: Number(branchId),
        category_id: categoryRecord.category_id,
        has_variations: hasVars,
        base_price: hasVars ? null : basePriceNum,
        // `price` is kept compatible with order-side readers; for variable
        // items we store the minimum variation price as the display price.
        price: hasVars
          ? Math.min(...normalizedRows.map((r) => r.price))
          : basePriceNum ?? 0,
        status: status === "inactive" ? "INACTIVE" : "ACTIVE",
        show_in_menu: true,
        variations: hasVars
          ? {
              create: normalizedRows.map((row, idx) => ({
                name: row.name,
                price: row.price,
                sortOrder: idx,
              })),
            }
          : undefined,
      },
      include: {
        branch: { select: { branch_id: true, branch_name: true } },
        category: { select: { category_id: true, name: true } },
        variations: { orderBy: { sortOrder: "asc" } },
      },
    });

    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/menu error:", err);
    return NextResponse.json(
      { error: "Failed to create menu item" },
      { status: 500 }
    );
  }
}
