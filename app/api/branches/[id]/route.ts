import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  assertTenantWriteAccess,
  assertBranchWithinRestaurant,
  requireAuth,
} from "@/lib/server-auth";
import { validateBranchTextField } from "@/lib/branch-field-validation";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "SUPER_ADMIN" && auth.role !== "RESTAURANT_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    assertTenantWriteAccess(auth);

    const { id } = await params;
    const branchId = parseInt(id, 10);
    if (isNaN(branchId)) {
      return NextResponse.json({ error: "Invalid branch ID" }, { status: 400 });
    }

    const branch = await prisma.branch.findUnique({
      where: { branch_id: branchId },
    });
    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    await assertBranchWithinRestaurant(auth, branchId);

    await prisma.branch.delete({ where: { branch_id: branchId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("DELETE /api/branches/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete branch" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.role !== "RESTAURANT_ADMIN" &&
      auth.role !== "BRANCH_ADMIN"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    assertTenantWriteAccess(auth);

    const { id } = await params;
    const branchId = parseInt(id, 10);
    if (isNaN(branchId)) {
      return NextResponse.json({ error: "Invalid branch ID" }, { status: 400 });
    }

    const existing = await prisma.branch.findUnique({
      where: { branch_id: branchId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    await assertBranchWithinRestaurant(auth, branchId);

    const body = await request.json();
    const { branch_name, address, city, status } = body;

    const branchNameError = validateBranchTextField(
      branch_name,
      "Branch name is required"
    );
    if (branchNameError) {
      return NextResponse.json(
        { error: branchNameError },
        { status: 400 }
      );
    }

    const addressError = validateBranchTextField(
      address,
      "Complete address is required"
    );
    if (addressError) {
      return NextResponse.json(
        { error: addressError },
        { status: 400 }
      );
    }

    const cityError = validateBranchTextField(city, "City is required");
    if (cityError) {
      return NextResponse.json(
        { error: cityError },
        { status: 400 }
      );
    }

    // `branch_code` is an internal, auto-generated identifier and must not
    // be editable from the branch management UI — whatever the payload
    // carries is ignored, and the existing code stays untouched.

    // Super Admin can reassign the branch to a different restaurant via restaurant_id
    let restaurantIdUpdate: { restaurant_id: number } | undefined;
    if (auth.role === "SUPER_ADMIN" && body.restaurant_id) {
      const nextRestaurantId = Number(body.restaurant_id);
      if (!Number.isNaN(nextRestaurantId) && nextRestaurantId !== existing.restaurant_id) {
        const restaurant = await prisma.restaurant.findUnique({
          where: { restaurant_id: nextRestaurantId },
        });
        if (!restaurant) {
          return NextResponse.json(
            { error: "Restaurant not found" },
            { status: 404 }
          );
        }
        restaurantIdUpdate = { restaurant_id: nextRestaurantId };
      }
    }

    const updated = await prisma.branch.update({
      where: { branch_id: branchId },
      data: {
        branch_name: branch_name.trim(),
        address: address.trim(),
        city: city.trim(),
        status: status === "Inactive" ? "Inactive" : "Active",
        ...(restaurantIdUpdate ?? {}),
      },
      include: {
        restaurant: { select: { restaurant_id: true, name: true } },
      },
    });

    return NextResponse.json({
      branch_id: updated.branch_id,
      branch_name: updated.branch_name,
      branch_code: updated.branch_code,
      restaurant_id: updated.restaurant_id,
      restaurant_name: updated.restaurant?.name ?? null,
      address: updated.address,
      city: updated.city,
      status: updated.status,
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PUT /api/branches/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update branch" },
      { status: 500 }
    );
  }
}
