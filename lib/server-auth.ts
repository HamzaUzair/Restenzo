import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateUniqueBranchCode } from "@/lib/branch-code";
import { seedDefaultCategoriesForBranch } from "@/lib/seedDefaultCategories";

export type ServerAuthRole =
  | "SUPER_ADMIN"
  | "RESTAURANT_ADMIN"
  | "BRANCH_ADMIN"
  | "ORDER_TAKER"
  | "CASHIER"
  | "ACCOUNTANT"
  | "LIVE_KITCHEN";

export type ServerAuthUser = {
  id: number;
  username: string;
  role: ServerAuthRole;
  restaurantId: number | null;
  /**
   * Mirror of `restaurant.has_multiple_branches` for the caller's tenant.
   * Drives the 3-level admin permission model (Restaurant Admin becomes
   * read-only on branch-scoped operational data when this is `true`).
   * `null` for SUPER_ADMIN or users without a restaurant.
   */
  restaurantHasMultipleBranches: boolean | null;
  restaurantStatus: string | null;
  branchId: number | null;
  status: string;
};

/**
 * Permission mode for branch-scoped operational modules
 * (categories, menu, deals, halls, etc.).
 *
 *   - "full"        → may create / edit / delete anywhere in scope
 *   - "branch_edit" → may create / edit / delete only within assigned branch
 *   - "read_only"   → may read & filter but never mutate
 */
export type OperationalEditMode = "full" | "branch_edit" | "read_only";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function normalizeRole(role?: string): ServerAuthRole {
  const normalized = role?.toUpperCase();
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (normalized === "ORDER_TAKER") return "ORDER_TAKER";
  if (normalized === "CASHIER") return "CASHIER";
  if (normalized === "ACCOUNTANT") return "ACCOUNTANT";
  if (normalized === "LIVE_KITCHEN") return "LIVE_KITCHEN";
  if (normalized === "BRANCH_ADMIN") return "BRANCH_ADMIN";
  if (normalized === "RESTAURANT_ADMIN") return "RESTAURANT_ADMIN";
  return "RESTAURANT_ADMIN";
}

export function isTenantScopedRole(role: ServerAuthRole) {
  return role !== "SUPER_ADMIN";
}

/**
 * Roles whose identity is pinned to a single branch. Branch Admin plus the
 * operational staff roles all fall under this bucket — they may only see
 * (and mutate) the branch they belong to.
 */
export function isBranchScopedRole(role: ServerAuthRole) {
  return (
    role === "BRANCH_ADMIN" ||
    role === "ORDER_TAKER" ||
    role === "CASHIER" ||
    role === "ACCOUNTANT" ||
    role === "LIVE_KITCHEN"
  );
}

/**
 * Returns the permission mode that applies to branch-scoped operational
 * modules (categories, menu, deals, halls, etc.).
 *
 * This is the single source of truth for the 3-level admin model:
 *   - Super Admin                       → full
 *   - Restaurant Admin (single-branch)  → full
 *   - Restaurant Admin (multi-branch)   → read_only (head-office view)
 *   - Branch Admin                      → branch_edit (their branch only)
 *   - Staff (Order Taker / Cashier / Accountant) → branch_edit
 */
export function getOperationalEditMode(
  user: ServerAuthUser
): OperationalEditMode {
  if (user.role === "SUPER_ADMIN") return "full";
  if (user.role === "RESTAURANT_ADMIN") {
    if (user.restaurantStatus !== "Active") return "read_only";
    return user.restaurantHasMultipleBranches === true ? "read_only" : "full";
  }
  return "branch_edit";
}

export async function requireAuth(request: NextRequest): Promise<ServerAuthUser> {
  const method = request.method.toUpperCase();
  const isMutatingMethod =
    method === "POST" ||
    method === "PUT" ||
    method === "PATCH" ||
    method === "DELETE";
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new AuthError("Unauthorized", 401);

  const user = await prisma.user.findFirst({
    where: { token },
    select: {
      id: true,
      username: true,
      role: true,
      restaurant_id: true,
      branch_id: true,
      status: true,
      restaurant: {
        select: { has_multiple_branches: true, status: true },
      },
    },
  });
  if (!user) throw new AuthError("Unauthorized", 401);
  if (user.status !== "Active") throw new AuthError("User inactive", 403);
  if (
    isMutatingMethod &&
    user.role !== "SUPER_ADMIN" &&
    user.restaurant_id &&
    user.restaurant?.status !== "Active"
  ) {
    throw new AuthError(
      "This restaurant is inactive. You can view data only until it is reactivated by Restenzo Admin.",
      423
    );
  }

  return {
    id: user.id,
    username: user.username,
    role: normalizeRole(user.role),
    restaurantId: user.restaurant_id ?? null,
    restaurantHasMultipleBranches:
      user.restaurant?.has_multiple_branches ?? null,
    restaurantStatus: user.restaurant?.status ?? null,
    branchId: user.branch_id ?? null,
    status: user.status,
  };
}

/**
 * Tenant users can still log in when their restaurant is inactive, but they
 * are forced into read-only mode and cannot perform writes.
 */
export function assertTenantWriteAccess(user: ServerAuthUser) {
  if (user.role === "SUPER_ADMIN") return;
  if (!user.restaurantId) return;
  if (user.restaurantStatus !== "Active") {
    throw new AuthError(
      "This restaurant is inactive. You can view data only until it is reactivated by Restenzo Admin.",
      423
    );
  }
}

export function requireSuperAdmin(user: ServerAuthUser) {
  if (user.role !== "SUPER_ADMIN") {
    throw new AuthError("Forbidden", 403);
  }
}

export function requireRestaurantAdmin(user: ServerAuthUser) {
  if (user.role !== "RESTAURANT_ADMIN") {
    throw new AuthError("Forbidden", 403);
  }
  if (!user.restaurantId) {
    throw new AuthError("Restaurant assignment missing", 403);
  }
}

export function requireBranchAdmin(user: ServerAuthUser) {
  if (user.role !== "BRANCH_ADMIN") {
    throw new AuthError("Forbidden", 403);
  }
  if (!user.restaurantId) {
    throw new AuthError("Restaurant assignment missing", 403);
  }
  if (!user.branchId) {
    throw new AuthError("Branch assignment missing", 403);
  }
}

/**
 * Resolve which restaurant the caller is allowed to query.
 *   - SUPER_ADMIN: can pass `?restaurantId=` to filter, or null for platform-wide
 *   - Tenant roles: always locked to their own restaurant
 */
export function getScopedRestaurantId(
  user: ServerAuthUser,
  requestedRestaurantId?: number | null
): number | undefined {
  if (isTenantScopedRole(user.role)) {
    if (!user.restaurantId) throw new AuthError("Restaurant assignment missing", 403);
    return user.restaurantId;
  }
  if (requestedRestaurantId === null || requestedRestaurantId === undefined) return undefined;
  return requestedRestaurantId;
}

/**
 * Resolve which branch the caller is allowed to query.
 *   - SUPER_ADMIN + RESTAURANT_ADMIN: optional branch filter (null = all branches in scope)
 *   - Branch-scoped staff: always locked to their own branch
 */
export function getScopedBranchId(
  user: ServerAuthUser,
  requestedBranchId?: number | null
): number | undefined {
  if (isBranchScopedRole(user.role)) {
    if (!user.branchId) throw new AuthError("Branch assignment missing", 403);
    return user.branchId;
  }
  if (requestedBranchId === null || requestedBranchId === undefined) return undefined;
  return requestedBranchId;
}

export function assertRestaurantAccess(
  user: ServerAuthUser,
  restaurantId: number | null | undefined
) {
  if (user.role === "SUPER_ADMIN") return;
  if (!user.restaurantId) throw new AuthError("Restaurant assignment missing", 403);
  if (restaurantId !== user.restaurantId) {
    throw new AuthError("Forbidden restaurant access", 403);
  }
}

/**
 * Verify that the caller may operate on the given branch. This both:
 *   1. Pins branch-scoped staff to their assigned branch.
 *   2. Pins RESTAURANT_ADMIN to branches inside their restaurant
 *      (requires a DB lookup).
 *   3. SUPER_ADMIN is allowed everywhere.
 *
 * Async because we may need to read the branch's restaurant_id.
 */
export async function assertBranchAccess(
  user: ServerAuthUser,
  branchId: number | null | undefined
) {
  if (user.role === "SUPER_ADMIN") return;
  if (branchId === null || branchId === undefined) {
    throw new AuthError("Branch is required", 400);
  }
  if (isBranchScopedRole(user.role)) {
    if (!user.branchId) throw new AuthError("Branch assignment missing", 403);
    if (branchId !== user.branchId) {
      throw new AuthError("Forbidden branch access", 403);
    }
    return;
  }
  if (user.role === "RESTAURANT_ADMIN") {
    if (!user.restaurantId) throw new AuthError("Restaurant assignment missing", 403);
    const branch = await prisma.branch.findUnique({
      where: { branch_id: branchId },
      select: { restaurant_id: true },
    });
    if (!branch || branch.restaurant_id !== user.restaurantId) {
      throw new AuthError("Forbidden branch access", 403);
    }
  }
}

/**
 * Verify that the owning tenant (restaurant) is currently `Active`.
 *
 * Restaurants are marked `Inactive` from the Restenzo / Super Admin panel
 * when the entire tenant is being suspended (non-payment, offboarding,
 * …). When that happens every child entity — Head Office, all branches,
 * and every staff role under them — must freeze. This helper lets any
 * tenant-scoped mutation enforce that rule without having to load the
 * branch first.
 *
 * SUPER_ADMIN is intentionally exempt so platform admins can still clean
 * up or re-activate a suspended tenant. Everyone else is rejected with a
 * 423 "Locked" so the client can show the correct "Restaurant Inactive"
 * copy instead of a generic 403.
 */
export async function assertRestaurantActive(
  user: ServerAuthUser,
  restaurantId: number | null | undefined
) {
  if (user.role === "SUPER_ADMIN") return;
  if (restaurantId === null || restaurantId === undefined) return;
  const restaurant = await prisma.restaurant.findUnique({
    where: { restaurant_id: restaurantId },
    select: { status: true },
  });
  if (!restaurant) throw new AuthError("Restaurant not found", 404);
  if (restaurant.status !== "Active") {
    throw new AuthError(
      "This restaurant is inactive. Operational actions are disabled until it is reactivated.",
      423
    );
  }
}

/**
 * Verify that a branch **and its owning restaurant** are both currently
 * `Active`. Inactive branches (or inactive tenants) are treated as
 * non-operational: every branch-scoped write (new orders, kitchen status
 * changes, cashier payments, expense CRUD, day-end closure, menu /
 * category / deal / hall mutations, …) is rejected so the branch
 * effectively freezes until a Restaurant / Super Admin reactivates it.
 *
 * Restaurant-level suspension takes priority: if the whole tenant is
 * inactive we surface the "Restaurant Inactive" message so Head Office
 * understands the suspension is global, not branch-specific.
 *
 * SUPER_ADMIN is intentionally exempt — platform admins need to be able
 * to clean up data on any branch, active or not. Everyone else
 * (including the Restaurant Admin that owns the branch) is blocked so
 * nobody can bypass the UI guard and keep writing against an archived
 * branch or a suspended tenant.
 *
 * Throws a 423 "Locked" so the frontend can distinguish an inactive
 * rejection from a generic 403 permissions failure and surface a
 * tailored message.
 */
export async function assertBranchActive(
  user: ServerAuthUser,
  branchId: number | null | undefined
) {
  if (user.role === "SUPER_ADMIN") return;
  if (branchId === null || branchId === undefined) return;
  const branch = await prisma.branch.findUnique({
    where: { branch_id: branchId },
    select: {
      status: true,
      restaurant: { select: { status: true } },
    },
  });
  if (!branch) throw new AuthError("Branch not found", 404);
  // Restaurant-level suspension wins so the client can show a
  // tenant-wide banner instead of a branch-only one.
  if (branch.restaurant.status !== "Active") {
    throw new AuthError(
      "This restaurant is inactive. Operational actions are disabled until it is reactivated.",
      423
    );
  }
  if (branch.status !== "Active") {
    throw new AuthError(
      "This branch is inactive. Operational actions are disabled until it is reactivated.",
      423
    );
  }
}

/**
 * Gate for any **mutating** call on branch-scoped operational data
 * (categories, menu, deals, halls, dishes …).
 *
 * Enforces the 3-level admin model on the backend so API manipulation
 * cannot bypass the UI:
 *   - SUPER_ADMIN                        → allowed
 *   - RESTAURANT_ADMIN (single-branch)   → allowed (still via assertBranchAccess)
 *   - RESTAURANT_ADMIN (multi-branch)    → blocked (view-only head office)
 *   - BRANCH_ADMIN                       → allowed for their own branch
 *   - Staff (OT / Cashier / Accountant)  → allowed for their own branch
 *
 * Also refuses every write to an **inactive** branch (see
 * `assertBranchActive`) so the branch's operational surface goes dark as
 * soon as it is archived, regardless of the caller's role.
 *
 * Always call `assertBranchAccess(user, branchId)` before this helper so
 * tenant isolation is verified first.
 */
export async function assertBranchWriteAccess(
  user: ServerAuthUser,
  branchId: number | null | undefined
) {
  await assertBranchAccess(user, branchId);
  const mode = getOperationalEditMode(user);
  if (mode === "read_only") {
    throw new AuthError(
      "Restaurant Admin is view-only for multi-branch restaurants. Ask the assigned Branch Admin to make this change.",
      403
    );
  }
  await assertBranchActive(user, branchId);
}

/**
 * Verify that a given branch belongs to the caller's restaurant. For SUPER_ADMIN
 * this is a no-op. For every tenant role we fetch the branch and compare its
 * restaurant_id to the caller's restaurantId.
 */
/**
 * Build a Prisma `where` filter that scopes branch-owned operational data
 * (Category, Menu, Deal, Order, Hall, etc.) to the caller's tenancy.
 *
 *   - SUPER_ADMIN: optional `branch_id` filter; all branches otherwise.
 *   - RESTAURANT_ADMIN: limited to their restaurant's branches; an explicit
 *     branch filter is verified to belong to that restaurant before being
 *     applied (otherwise it is ignored and we still scope by restaurant).
 *   - Branch-scoped staff: pinned to their assigned branch only.
 *
 * The returned object can be spread into a Prisma `where` clause for any
 * model that has either a `branch_id` column or a `branch` relation.
 */
export type BranchScopeFilter<TKey extends string> =
  | Partial<Record<TKey, number>>
  | { branch: { restaurant_id: number } };

export async function buildBranchScopeFilter(
  user: ServerAuthUser,
  requestedBranchId?: number | null,
  branchKey: "branch_id" | "branchId" = "branch_id"
): Promise<Record<string, unknown>> {
  if (isBranchScopedRole(user.role)) {
    if (!user.branchId) throw new AuthError("Branch assignment missing", 403);
    return { [branchKey]: user.branchId };
  }
  if (user.role === "RESTAURANT_ADMIN") {
    if (!user.restaurantId) throw new AuthError("Restaurant assignment missing", 403);
    if (requestedBranchId) {
      const branch = await prisma.branch.findUnique({
        where: { branch_id: requestedBranchId },
        select: { restaurant_id: true },
      });
      if (branch && branch.restaurant_id === user.restaurantId) {
        return { [branchKey]: requestedBranchId };
      }
    }
    return { branch: { restaurant_id: user.restaurantId } };
  }
  if (requestedBranchId) {
    return { [branchKey]: requestedBranchId };
  }
  return {};
}

/**
 * Resolve the hidden "default" branch for a single-branch tenant so that
 * branch-scoped staff roles (Order Taker, Cashier, Accountant, Live Kitchen)
 * can be created without forcing the Restaurant Admin to pick a branch in a
 * UI that does not expose branch management at all.
 *
 * Contract:
 *   - Restaurant must exist and be `has_multiple_branches = false`.
 *   - Returns the active branch if present; otherwise the first branch.
 *   - Legacy safety net: if a single-branch restaurant somehow has zero
 *     branches (e.g. rows created before the auto-provisioning landed),
 *     a hidden "Main Branch" row is auto-created on the fly so downstream
 *     inserts always succeed.
 *
 * Throws `AuthError` for multi-branch tenants — callers must require an
 * explicit branchId in that case.
 */
export async function resolveDefaultBranchForSingleBranch(
  restaurantId: number
): Promise<number> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { restaurant_id: restaurantId },
    select: {
      restaurant_id: true,
      slug: true,
      address: true,
      has_multiple_branches: true,
      branches: {
        orderBy: { branch_id: "asc" },
        select: { branch_id: true, status: true },
      },
    },
  });
  if (!restaurant) throw new AuthError("Restaurant not found", 404);
  if (restaurant.has_multiple_branches) {
    throw new AuthError("Branch is required for this role", 400);
  }

  const active = restaurant.branches.find((b) => b.status === "Active");
  if (active) return active.branch_id;
  if (restaurant.branches.length > 0) return restaurant.branches[0].branch_id;

  // Legacy data repair: manufacture the hidden Main Branch so single-branch
  // restaurants created before auto-provisioning still work end-to-end.
  const branchCode = await generateUniqueBranchCode(restaurant.slug, {
    suffix: "MAIN",
  });
  const created = await prisma.branch.create({
    data: {
      branch_name: "Main Branch",
      branch_code: branchCode,
      restaurant_id: restaurant.restaurant_id,
      address: restaurant.address ?? "",
      city: "",
      status: "Active",
    },
  });
  // The hidden Main Branch is brand new — give it the same starter
  // categories every other newly created branch gets so the Categories
  // page isn't empty the first time the Restaurant Admin opens it.
  await seedDefaultCategoriesForBranch(created.branch_id);
  return created.branch_id;
}

export async function assertBranchWithinRestaurant(
  user: ServerAuthUser,
  branchId: number
) {
  if (user.role === "SUPER_ADMIN") return;
  if (!user.restaurantId) throw new AuthError("Restaurant assignment missing", 403);

  const branch = await prisma.branch.findUnique({
    where: { branch_id: branchId },
    select: { restaurant_id: true },
  });
  if (!branch) throw new AuthError("Branch not found", 404);
  if (branch.restaurant_id !== user.restaurantId) {
    throw new AuthError("Forbidden branch access", 403);
  }

  if (isBranchScopedRole(user.role)) {
    if (user.branchId !== branchId) throw new AuthError("Forbidden branch access", 403);
  }
}
