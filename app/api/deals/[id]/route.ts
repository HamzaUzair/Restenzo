import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertBranchWriteAccess,
  AuthError,
  requireAuth,
} from "@/lib/server-auth";
import {
  buildDealItemData,
  dealLineDisplayName,
  normalizeDealLines,
  type IncomingDealLine,
} from "@/lib/deal-line";
import type { Prisma } from "@prisma/client";

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

const dealItemInclude = {
  branch: { select: { branch_id: true, branch_name: true } },
  items: {
    include: {
      menu_item: { select: { dish_id: true, name: true } },
      variation: { select: { id: true, name: true } },
    },
  },
} as const;

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

/* ── PUT /api/deals/[id] ── */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth.role === "ORDER_TAKER") {
      return NextResponse.json(
        { error: "Order Taker cannot manage deals" },
        { status: 403 }
      );
    }
    const { id } = await params;
    const dealId = Number(id);
    if (Number.isNaN(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
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

    if (!name?.trim() || !type?.trim()) {
      return NextResponse.json(
        { error: "Deal name and type are required" },
        { status: 400 }
      );
    }
    const branchIdNum = Number(branchId);
    if (Number.isNaN(branchIdNum)) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      return NextResponse.json({ error: "Invalid deal price" }, { status: 400 });
    }

    const existing = await prisma.deal.findUnique({ where: { id: dealId } });
    if (!existing) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    await assertBranchWriteAccess(auth, existing.branch_id);
    // If caller is changing the deal's branch, gate access to the target branch too.
    if (branchIdNum !== existing.branch_id) {
      await assertBranchWriteAccess(auth, branchIdNum);
    }

    const normalizedLines = normalizeDealLines(items);
    if (normalizedLines.length === 0) {
      return NextResponse.json(
        { error: "Select at least one included menu item" },
        { status: 400 }
      );
    }

    const updatedId = await prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id: dealId },
        data: {
          branch_id: branchIdNum,
          name: name.trim(),
          description: description?.trim() || null,
          status: status === "inactive" ? "Draft" : "Active",
          discount_type: type.trim(),
          discount_value: priceNum,
        },
      });

      await tx.dealItem.deleteMany({ where: { deal_id: dealId } });

      const rows: Prisma.DealItemCreateManyInput[] = [];
      for (const line of normalizedLines) {
        const data = await buildDealItemData(tx, branchIdNum, line);
        if (data) rows.push({ ...data, deal_id: dealId });
      }
      if (rows.length === 0) {
        throw new AuthError(
          "Select at least one valid active menu item or variation",
          400
        );
      }
      await tx.dealItem.createMany({ data: rows });

      return dealId;
    });

    const updated = await prisma.deal.findUnique({
      where: { id: updatedId },
      include: dealItemInclude,
    });
    if (!updated) {
      return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
    }

    return NextResponse.json(serializeDeal(updated));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PUT /api/deals/[id] error:", err);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

/* ── DELETE /api/deals/[id] ── */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth.role === "ORDER_TAKER") {
      return NextResponse.json(
        { error: "Order Taker cannot manage deals" },
        { status: 403 }
      );
    }
    const { id } = await params;
    const dealId = Number(id);
    if (Number.isNaN(dealId)) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const existing = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { branch_id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    await assertBranchWriteAccess(auth, existing.branch_id);

    await prisma.$transaction(async (tx) => {
      await tx.dealItem.deleteMany({ where: { deal_id: dealId } });
      await tx.deal.delete({ where: { id: dealId } });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("DELETE /api/deals/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}

