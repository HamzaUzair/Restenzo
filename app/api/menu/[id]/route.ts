import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Decimal } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import {
  assertBranchWriteAccess,
  AuthError,
  requireAuth,
} from "@/lib/server-auth";

type IncomingVariation = { name?: string; price?: number | string };

function normalizeVariations(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
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
  price: Decimal | number | string;
  base_price: Decimal | number | string | null;
  has_variations: boolean;
  status: "ACTIVE" | "INACTIVE";
  branch_id: number;
  branch: { branch_id: number; branch_name: string };
  category: { category_id: number; name: string };
  variations: Array<{
    id: number;
    name: string;
    price: Decimal | number | string;
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
    })),
    status: item.status === "ACTIVE" ? "active" : "inactive",
    createdAt: item.created_at.toISOString(),
    updatedAt: item.updated_at.toISOString(),
  };
}

/* ── PUT /api/menu/[id] ── */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth.role === "ORDER_TAKER") {
      return NextResponse.json(
        { error: "Order Taker cannot manage menu items" },
        { status: 403 }
      );
    }
    const { id } = await params;
    const menuId = parseInt(id, 10);

    if (isNaN(menuId)) {
      return NextResponse.json({ error: "Invalid menu ID" }, { status: 400 });
    }

    const body = await request.json();
    const {
      itemName,
      description,
      status,
      category,
      hasVariations,
      basePrice,
      variations,
    } = body as {
      itemName?: string;
      description?: string | null;
      status?: string;
      category?: string;
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
    if (!category?.trim()) {
      return NextResponse.json(
        { error: "Category is required" },
        { status: 400 }
      );
    }
    if (status !== "active" && status !== "inactive") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await prisma.menuItem.findUnique({
      where: { dish_id: menuId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }
    await assertBranchWriteAccess(auth, existing.branch_id);

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

    const categoryRecord = await prisma.category.findFirst({
      where: {
        branch_id: existing.branch_id,
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

    const updated = await prisma.$transaction(async (tx) => {
      await tx.menuVariation.deleteMany({ where: { menuId } });

      return tx.menuItem.update({
        where: { dish_id: menuId },
        data: {
          name: itemName.trim(),
          description: description?.trim() || null,
          category_id: categoryRecord.category_id,
          has_variations: hasVars,
          base_price: hasVars ? null : basePriceNum,
          price: hasVars
            ? Math.min(...normalizedRows.map((r) => r.price))
            : basePriceNum ?? 0,
          status: status === "inactive" ? "INACTIVE" : "ACTIVE",
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
    });

    return NextResponse.json(serialize(updated));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PUT /api/menu/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update menu item" },
      { status: 500 }
    );
  }
}

/* ── DELETE /api/menu/[id] ── */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth.role === "ORDER_TAKER") {
      return NextResponse.json(
        { error: "Order Taker cannot manage menu items" },
        { status: 403 }
      );
    }
    const { id } = await params;
    const menuId = parseInt(id, 10);

    if (isNaN(menuId)) {
      return NextResponse.json({ error: "Invalid menu ID" }, { status: 400 });
    }

    const existing = await prisma.menuItem.findUnique({
      where: { dish_id: menuId },
      select: { dish_id: true, branch_id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }
    await assertBranchWriteAccess(auth, existing.branch_id);

    // Order / deal history refs `menu_items.dish_id`. To avoid deleting past
    // records we perform a soft-delete: hide from the menu UI and mark the
    // item inactive so future orders can't pick it.
    await prisma.menuItem.update({
      where: { dish_id: menuId },
      data: { show_in_menu: false, status: "INACTIVE" },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("DELETE /api/menu/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete menu item" },
      { status: 500 }
    );
  }
}
