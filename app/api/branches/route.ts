import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  getScopedRestaurantId,
  requireAuth,
} from "@/lib/server-auth";
import { generateUniqueBranchCode } from "@/lib/branch-code";
import { seedDefaultCategoriesForBranch } from "@/lib/seedDefaultCategories";
import { getBranchUsage, branchLimitMessage } from "@/lib/branch-limits";
import { validateBranchTextField } from "@/lib/branch-field-validation";

/* ── GET /api/branches ──
 *   Super Admin    → all branches (optional ?restaurantId= filter)
 *   Restaurant Admin → branches of their restaurant
 *   Staff          → their single assigned branch
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const requestedRestaurantIdParam = searchParams.get("restaurantId");
    const requestedRestaurantId =
      requestedRestaurantIdParam && requestedRestaurantIdParam !== "all"
        ? Number(requestedRestaurantIdParam)
        : null;

    const scopedRestaurantId = getScopedRestaurantId(auth, requestedRestaurantId);

    const where: { restaurant_id?: number; branch_id?: number } = {};
    if (scopedRestaurantId) where.restaurant_id = scopedRestaurantId;

    // branch-scoped roles (Branch Admin + staff) see only their branch
    if (
      auth.role === "BRANCH_ADMIN" ||
      auth.role === "ORDER_TAKER" ||
      auth.role === "CASHIER" ||
      auth.role === "ACCOUNTANT"
    ) {
      if (!auth.branchId) {
        throw new AuthError("Branch assignment missing", 403);
      }
      where.branch_id = auth.branchId;
    }

    const branches = await prisma.branch.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        restaurant: { select: { restaurant_id: true, name: true, slug: true } },
        users: {
          where: { role: "BRANCH_ADMIN", status: "Active" },
          select: {
            id: true,
            username: true,
            fullname: true,
          },
          orderBy: { created_at: "asc" },
          take: 1,
        },
      },
    });

    return NextResponse.json(
      branches.map((b) => {
        const admin = b.users[0] ?? null;
        return {
          branch_id: b.branch_id,
          branch_name: b.branch_name,
          branch_code: b.branch_code,
          restaurant_id: b.restaurant_id,
          restaurant_name: b.restaurant?.name ?? null,
          address: b.address,
          city: b.city,
          status: b.status,
          branch_admin: admin
            ? {
                user_id: admin.id,
                username: admin.username,
                full_name: admin.fullname ?? admin.username,
              }
            : null,
          created_at: b.created_at.toISOString(),
          updated_at: b.updated_at.toISOString(),
        };
      })
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/branches error:", err);
    return NextResponse.json(
      { error: "Failed to fetch branches" },
      { status: 500 }
    );
  }
}

/* ── POST /api/branches ──
 *   Super Admin: can create a branch in any restaurant (restaurant_id required)
 *   Restaurant Admin: can create branches only in their own restaurant
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "SUPER_ADMIN" && auth.role !== "RESTAURANT_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { branch_name, address, city, status } = body;
    const requestedRestaurantId = body.restaurant_id
      ? Number(body.restaurant_id)
      : null;

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

    let restaurantId: number;
    let restaurantSlug: string | null = null;
    if (auth.role === "RESTAURANT_ADMIN") {
      if (!auth.restaurantId) {
        return NextResponse.json({ error: "Restaurant missing" }, { status: 403 });
      }
      restaurantId = auth.restaurantId;
    } else {
      if (!requestedRestaurantId || Number.isNaN(requestedRestaurantId)) {
        return NextResponse.json(
          { error: "Restaurant is required" },
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
      restaurantId = restaurant.restaurant_id;
      restaurantSlug = restaurant.slug;
    }

    // ── Single-branch tenant guard ─────────────────────────────────────
    // Restaurants flagged as single-branch are not allowed to hold more
    // than one branch. The Restaurant Admin UI hides branch creation for
    // them; this is the backend guarantee in case anyone crafts the call
    // manually (or for Super Admin acting on behalf of a tenant).
    const targetRestaurant = await prisma.restaurant.findUnique({
      where: { restaurant_id: restaurantId },
      select: {
        slug: true,
        has_multiple_branches: true,
        _count: { select: { branches: true } },
      },
    });
    if (!targetRestaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }
    if (
      targetRestaurant.has_multiple_branches === false &&
      targetRestaurant._count.branches >= 1
    ) {
      return NextResponse.json(
        {
          error:
            "This restaurant is configured as single-branch. Enable \"Has Multiple Branches\" on the restaurant before adding another branch.",
        },
        { status: 403 }
      );
    }

    // ── Plan branch-limit guard ────────────────────────────────────────
    // Hard backend enforcement based on the tenant's subscribed plan.
    // Single Branch → 1, Multi Branch → 10, Enterprise/custom → unlimited
    // (max_branches = null). Existing over-limit tenants keep their branches
    // but cannot create new ones until they are back under the limit.
    const usage = await getBranchUsage(restaurantId);
    if (!usage.canCreate) {
      return NextResponse.json(
        { error: branchLimitMessage(usage) },
        { status: 403 }
      );
    }
    restaurantSlug = restaurantSlug ?? targetRestaurant.slug;

    // `branch_code` is an internal identifier now — it is no longer collected
    // from the UI and is auto-generated per-restaurant so two different
    // tenants can happily have their own "first branch" without a global
    // collision (Restaurant A's B1 vs Restaurant X's B1 live under separate
    // slug prefixes).
    const branchCode = await generateUniqueBranchCode(restaurantSlug, {
      restaurantId,
    });

    // Wrap branch creation + default-category seeding in one transaction so
    // the new branch never lands without its starter categories (or vice
    // versa). The seeded categories are plain rows — Branch Admin can edit
    // or permanently delete any of them through the existing Categories UI.
    const branch = await prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({
        data: {
          branch_name: branch_name.trim(),
          branch_code: branchCode,
          restaurant_id: restaurantId,
          address: address.trim(),
          city: city.trim(),
          status: status === "Inactive" ? "Inactive" : "Active",
        },
        include: {
          restaurant: { select: { restaurant_id: true, name: true } },
        },
      });
      await seedDefaultCategoriesForBranch(created.branch_id, tx);
      return created;
    });

    return NextResponse.json(
      {
        branch_id: branch.branch_id,
        branch_name: branch.branch_name,
        branch_code: branch.branch_code,
        restaurant_id: branch.restaurant_id,
        restaurant_name: branch.restaurant?.name ?? null,
        address: branch.address,
        city: branch.city,
        status: branch.status,
        created_at: branch.created_at.toISOString(),
        updated_at: branch.updated_at.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/branches error:", err);
    return NextResponse.json(
      { error: "Failed to create branch" },
      { status: 500 }
    );
  }
}
