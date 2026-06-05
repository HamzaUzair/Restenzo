import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertBranchWriteAccess,
  AuthError,
  buildBranchScopeFilter,
  requireAuth,
} from "@/lib/server-auth";
import {
  buildDealItemData,
  dealLineDisplayName,
  normalizeDealLines,
  type IncomingDealLine,
} from "@/lib/deal-line";
import type { Prisma } from "@prisma/client";

/** Serialize a deal (with items) into the UI/API shape. */
type DealWithItems = Prisma.DealGetPayload<{
  include: {
    branch: { select: { branch_id: true; branch_name: true } };
    items: {
      include: {
        menu_item: { select: { dish_id: true; name: true } };
        variation: { select: { id: true; name: true } };
      };
    };
  };
}>;

function serializeDeal(d: DealWithItems) {
  return {
    id: String(d.id),
    name: d.name,
    type: d.discount_type,
    description: d.description,
    branchId: d.branch_id ?? 0,
    branchName: d.branch?.branch_name ?? "All Branches",
    price: Number(d.discount_value),
    status: d.status === "Active" ? "active" : "inactive",
    items: d.items.map((item) => {
      const itemName = item.item_name_snapshot ?? item.menu_item.name;
      const variationName =
        item.variation_name_snapshot ?? item.variation?.name ?? null;
      return {
        lineId: String(item.id),
        id: String(item.dish_id),
        name: dealLineDisplayName(itemName, variationName),
        itemName,
        variationId: item.variation_id ?? null,
        variationName,
        unitPrice:
          item.unit_price_snapshot != null
            ? Number(item.unit_price_snapshot)
            : undefined,
        quantity: item.quantity,
      };
    }),
  };
}

const dealItemInclude = {
  branch: { select: { branch_id: true, branch_name: true } },
  items: {
    include: {
      menu_item: { select: { dish_id: true, name: true } },
      variation: { select: { id: true, name: true } },
    },
  },
} as const;

/* ── GET /api/deals ── */
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
    const where: Prisma.DealWhereInput = { ...(scope as Prisma.DealWhereInput) };
    if (auth.role === "ORDER_TAKER") {
      where.status = "Active";
    } else if (statusParam === "active" || statusParam === "inactive") {
      where.status = statusParam === "active" ? "Active" : "Draft";
    }
    if (searchParam) {
      where.OR = [{ name: { contains: searchParam, mode: "insensitive" } }];
    }

    const deals = await prisma.deal.findMany({
      where,
      include: dealItemInclude,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(deals.map(serializeDeal));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/deals error:", err);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

/* ── POST /api/deals ── */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role === "ORDER_TAKER") {
      return NextResponse.json(
        { error: "Order Taker cannot manage deals" },
        { status: 403 }
      );
    }
    const body = await request.json();
    const { name, type, description, branchId, price, status, items } = body as {
      name?: string;
      type?: string;
      description?: string;
      branchId?: number | string;
      price?: number | string;
      status?: "active" | "inactive";
      items?: IncomingDealLine[];
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Deal name is required" }, { status: 400 });
    }
    if (!type?.trim()) {
      return NextResponse.json({ error: "Deal type is required" }, { status: 400 });
    }
    if (branchId === undefined || branchId === null || branchId === "") {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    const branchIdNum = Number(branchId);
    if (Number.isNaN(branchIdNum)) {
      return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
    }
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      return NextResponse.json(
        { error: "Valid deal price is required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Select at least one included menu item" },
        { status: 400 }
      );
    }

    const branch = await prisma.branch.findUnique({
      where: { branch_id: branchIdNum },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    await assertBranchWriteAccess(auth, branch.branch_id);

    const normalizedLines = normalizeDealLines(items);
    if (normalizedLines.length === 0) {
      return NextResponse.json(
        { error: "Select at least one included menu item" },
        { status: 400 }
      );
    }

    const dealId = await prisma.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: {
          branch_id: branchIdNum,
          name: name.trim(),
          description: description?.trim() || null,
          status: status === "inactive" ? "Draft" : "Active",
          discount_type: type.trim(),
          discount_value: priceNum,
        },
      });

      const rows: Prisma.DealItemCreateManyInput[] = [];
      for (const line of normalizedLines) {
        const data = await buildDealItemData(tx, branchIdNum, line);
        if (data) rows.push({ ...data, deal_id: created.id });
      }
      if (rows.length === 0) {
        // Every line resolved to an invalid/inactive item or variation.
        throw new AuthError(
          "Select at least one valid active menu item or variation",
          400
        );
      }
      await tx.dealItem.createMany({ data: rows });

      return created.id;
    });

    const created = await prisma.deal.findUnique({
      where: { id: dealId },
      include: dealItemInclude,
    });
    if (!created) {
      return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
    }

    return NextResponse.json(serializeDeal(created), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/deals error:", err);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}

