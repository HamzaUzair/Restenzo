import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  assertBranchWithinRestaurant,
  assertRestaurantAccess,
  normalizeRole,
  requireAuth,
  resolveDefaultBranchForSingleBranch,
} from "@/lib/server-auth";
import {
  validateEmailUsername,
  validateNameWithLetters,
} from "@/lib/user-validation";

type ApiUserRole =
  | "SUPER_ADMIN"
  | "RESTAURANT_ADMIN"
  | "BRANCH_ADMIN"
  | "ORDER_TAKER"
  | "CASHIER"
  | "ACCOUNTANT"
  | "LIVE_KITCHEN";

const STAFF_ROLES: ApiUserRole[] = [
  "ORDER_TAKER",
  "CASHIER",
  "ACCOUNTANT",
  "LIVE_KITCHEN",
];
const BRANCH_PINNED_ROLES: ApiUserRole[] = ["BRANCH_ADMIN", ...STAFF_ROLES];

function canManageRole(
  authRole: ApiUserRole,
  targetRole: ApiUserRole,
  restaurantHasMultipleBranches: boolean | null
) {
  if (authRole === "SUPER_ADMIN") return targetRole === "RESTAURANT_ADMIN";
  if (authRole === "RESTAURANT_ADMIN") {
    if (restaurantHasMultipleBranches === true) {
      // Head office can only manage Branch Admin accounts.
      return targetRole === "BRANCH_ADMIN";
    }
    // Single-branch Restaurant Admin can manage branch staff.
    return STAFF_ROLES.includes(targetRole);
  }
  if (authRole === "BRANCH_ADMIN") {
    return STAFF_ROLES.includes(targetRole);
  }
  return false;
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

    const { id } = await params;
    const userId = Number(id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        restaurant_id: true,
        branch_id: true,
        role: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (auth.role === "BRANCH_ADMIN") {
      if (!auth.branchId || existing.branch_id !== auth.branchId) {
        return NextResponse.json({ error: "Forbidden branch access" }, { status: 403 });
      }
    }

    if (auth.role === "RESTAURANT_ADMIN" || auth.role === "BRANCH_ADMIN") {
      assertRestaurantAccess(auth, existing.restaurant_id);
      if (
        !canManageRole(
          auth.role,
          normalizeRole(existing.role),
          auth.restaurantHasMultipleBranches
        )
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (normalizeRole(existing.role) !== "RESTAURANT_ADMIN") {
      return NextResponse.json(
        { error: "Platform Admin can manage Restaurant Admin records only from this panel" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const role = normalizeRole(body.role);
    const username = String(body.username ?? "").trim();
    const fullName = String(body.fullName ?? "").trim();

    const usernameError = validateEmailUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }
    const fullNameError = validateNameWithLetters(fullName);
    if (fullNameError) {
      return NextResponse.json({ error: fullNameError }, { status: 400 });
    }

    if (!canManageRole(auth.role, role, auth.restaurantHasMultipleBranches)) {
      return NextResponse.json(
        { error: "You cannot assign this role" },
        { status: 403 }
      );
    }

    const requestedRestaurantId =
      body.restaurantId === "" || body.restaurantId === null || body.restaurantId === undefined
        ? null
        : Number(body.restaurantId);
    const requestedBranchId =
      body.branchId === "" || body.branchId === null || body.branchId === undefined
        ? null
        : Number(body.branchId);

    let restaurantId: number | null = null;
    let branchId: number | null = null;

    if (role === "RESTAURANT_ADMIN") {
      if (!requestedRestaurantId) {
        return NextResponse.json(
          { error: "Restaurant is required for Restaurant Admin" },
          { status: 400 }
        );
      }
      const restaurant = await prisma.restaurant.findUnique({
        where: { restaurant_id: requestedRestaurantId },
      });
      if (!restaurant) {
        return NextResponse.json(
          { error: "Restaurant not found" },
          { status: 404 }
        );
      }
      restaurantId = requestedRestaurantId;
      branchId = null;
    } else {
      if (auth.role !== "RESTAURANT_ADMIN" && auth.role !== "BRANCH_ADMIN") {
        return NextResponse.json(
          { error: "Platform Admin can assign Restaurant Admin only" },
          { status: 403 }
        );
      }
      restaurantId = auth.restaurantId!;

      if (BRANCH_PINNED_ROLES.includes(role)) {
        if (auth.role === "BRANCH_ADMIN") {
          if (!auth.branchId) {
            return NextResponse.json(
              { error: "Branch assignment missing" },
              { status: 403 }
            );
          }
          if (requestedBranchId && requestedBranchId !== auth.branchId) {
            return NextResponse.json(
              { error: "You cannot assign users to another branch" },
              { status: 403 }
            );
          }
          branchId = auth.branchId;
        } else if (
          auth.role === "RESTAURANT_ADMIN" &&
          auth.restaurantHasMultipleBranches === false
        ) {
          // Single-branch tenant: the UI does not surface a branch field so
          // the payload has no branchId. Resolve the hidden default branch
          // on the server (auto-creating it if legacy data is missing one).
          branchId = await resolveDefaultBranchForSingleBranch(restaurantId);
        } else if (!requestedBranchId) {
          return NextResponse.json(
            { error: "Branch is required for this role" },
            { status: 400 }
          );
        } else {
          const branch = await prisma.branch.findUnique({
            where: { branch_id: requestedBranchId },
          });
          if (!branch) {
            return NextResponse.json(
              { error: "Branch not found" },
              { status: 404 }
            );
          }
          if (branch.restaurant_id !== restaurantId) {
            return NextResponse.json(
              { error: "Branch does not belong to the selected restaurant" },
              { status: 400 }
            );
          }
          await assertBranchWithinRestaurant(auth, requestedBranchId);
          branchId = requestedBranchId;
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        username,
        fullname: fullName,
        role,
        restaurant_id: restaurantId,
        branch_id: branchId,
        terminal: Math.max(1, Number(body.terminal) || 1),
        status: body.status === "Inactive" ? "Inactive" : "Active",
        ...(body.password ? { password: String(body.password) } : {}),
      },
      include: {
        restaurant: { select: { restaurant_id: true, name: true } },
        branch: {
          select: { branch_id: true, branch_name: true, branch_code: true },
        },
      },
    });

    return NextResponse.json({
      id: String(updated.id),
      userId: updated.id,
      username: updated.username,
      fullName: updated.fullname ?? "",
      role: normalizeRole(updated.role),
      restaurantId: updated.restaurant_id,
      restaurantName: updated.restaurant?.name ?? "",
      branchId: updated.branch_id,
      branchName: updated.branch?.branch_name ?? "No Branch",
      branchCode: updated.branch?.branch_code ?? "—",
      status: updated.status === "Inactive" ? "Inactive" : "Active",
      terminal: updated.terminal,
      createdAt: new Date(updated.created_at).getTime(),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PUT /api/users/[id] error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
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

    const { id } = await params;
    const userId = Number(id);
    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, restaurant_id: true, branch_id: true, role: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (auth.role === "BRANCH_ADMIN") {
      if (!auth.branchId || existing.branch_id !== auth.branchId) {
        return NextResponse.json({ error: "Forbidden branch access" }, { status: 403 });
      }
    }

    if (auth.role === "RESTAURANT_ADMIN" || auth.role === "BRANCH_ADMIN") {
      assertRestaurantAccess(auth, existing.restaurant_id);
      if (
        !canManageRole(
          auth.role,
          normalizeRole(existing.role),
          auth.restaurantHasMultipleBranches
        )
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (normalizeRole(existing.role) !== "RESTAURANT_ADMIN") {
      return NextResponse.json(
        { error: "Platform Admin can delete Restaurant Admin records only from this panel" },
        { status: 403 }
      );
    }

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("DELETE /api/users/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
