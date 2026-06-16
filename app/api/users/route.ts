import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  assertTenantWriteAccess,
  assertBranchWithinRestaurant,
  normalizeRole,
  requireAuth,
  resolveDefaultBranchForSingleBranch,
} from "@/lib/server-auth";
import {
  validateEmailUsername,
  validateNameWithLetters,
} from "@/lib/user-validation";
import { hashPassword } from "@/lib/password";

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
/** Roles that must be pinned to a specific branch at creation time. */
const BRANCH_PINNED_ROLES: ApiUserRole[] = [
  "BRANCH_ADMIN",
  ...STAFF_ROLES,
];

function canManageRole(
  authRole: ApiUserRole,
  targetRole: ApiUserRole,
  restaurantHasMultipleBranches: boolean | null
) {
  if (authRole === "SUPER_ADMIN") return targetRole === "RESTAURANT_ADMIN";
  if (authRole === "RESTAURANT_ADMIN") {
    if (restaurantHasMultipleBranches === true) {
      // Head office can only assign Branch Admin in multi-branch mode.
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

function serializeUser(u: {
  id: number;
  username: string;
  fullname: string | null;
  role: string;
  restaurant_id: number | null;
  branch_id: number | null;
  status: string;
  terminal: number;
  created_at: Date;
  restaurant: { restaurant_id: number; name: string } | null;
  branch: {
    branch_id: number;
    branch_name: string;
    branch_code: string;
  } | null;
}) {
  return {
    id: String(u.id),
    userId: u.id,
    username: u.username,
    fullName: u.fullname ?? "",
    role: normalizeRole(u.role),
    restaurantId: u.restaurant_id,
    restaurantName: u.restaurant?.name ?? "",
    branchId: u.branch_id,
    branchName: u.branch?.branch_name ?? "No Branch",
    branchCode: u.branch?.branch_code ?? "—",
    status: u.status === "Inactive" ? ("Inactive" as const) : ("Active" as const),
    terminal: u.terminal,
    createdAt: new Date(u.created_at).getTime(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.role !== "RESTAURANT_ADMIN" &&
      auth.role !== "BRANCH_ADMIN"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const restaurantFilter = searchParams.get("restaurantId");

    const raManageableRoles: ApiUserRole[] =
      auth.restaurantHasMultipleBranches === true
        ? ["BRANCH_ADMIN"]
        : STAFF_ROLES;
    const where =
      auth.role === "BRANCH_ADMIN"
        ? {
            restaurant_id: auth.restaurantId ?? -1,
            branch_id: auth.branchId ?? -1,
            role: { in: STAFF_ROLES },
          }
        : auth.role === "RESTAURANT_ADMIN"
        ? {
            restaurant_id: auth.restaurantId ?? -1,
            role: { in: raManageableRoles },
          }
        : restaurantFilter && restaurantFilter !== "all"
        ? { restaurant_id: Number(restaurantFilter), role: "RESTAURANT_ADMIN" }
        : { role: "RESTAURANT_ADMIN" };

    const users = await prisma.user.findMany({
      where,
      include: {
        restaurant: { select: { restaurant_id: true, name: true } },
        branch: {
          select: { branch_id: true, branch_name: true, branch_code: true },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(users.map(serializeUser));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/users error:", err);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const username = String(body.username ?? "").trim();
    const fullName = String(body.fullName ?? "").trim();
    const password = String(body.password ?? "");
    const role = normalizeRole(body.role);
    const terminal = Math.max(1, Number(body.terminal) || 1);
    const status = body.status === "Inactive" ? "Inactive" : "Active";

    const requestedRestaurantId =
      body.restaurantId === "" || body.restaurantId === null || body.restaurantId === undefined
        ? null
        : Number(body.restaurantId);
    const requestedBranchId =
      body.branchId === "" || body.branchId === null || body.branchId === undefined
        ? null
        : Number(body.branchId);

    if (!username || !password || !fullName) {
      return NextResponse.json(
        { error: "Username, full name, and password are required" },
        { status: 400 }
      );
    }

    const usernameError = validateEmailUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }
    const fullNameError = validateNameWithLetters(fullName);
    if (fullNameError) {
      return NextResponse.json({ error: fullNameError }, { status: 400 });
    }

    if (
      !canManageRole(auth.role, role, auth.restaurantHasMultipleBranches)
    ) {
      return NextResponse.json(
        { error: "You cannot create this role" },
        { status: 403 }
      );
    }

    /* Resolve target tenant scope */
    let restaurantId: number | null = null;
    let branchId: number | null = null;

    if (role === "RESTAURANT_ADMIN") {
      // only Super Admin reaches here; restaurant is required
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
      // Non-platform roles can be created by tenant admins only.
      if (auth.role !== "RESTAURANT_ADMIN" && auth.role !== "BRANCH_ADMIN") {
        return NextResponse.json(
          { error: "Platform Admin can create Restaurant Admin accounts only" },
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
          // Single-branch tenant: branch management is hidden in the UI so
          // the client never sends a branchId. Resolve the hidden default
          // branch on the server and ignore whatever the payload carried.
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

    const existing = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    const created = await prisma.user.create({
      data: {
        username,
        fullname: fullName,
        password: await hashPassword(password),
        role,
        restaurant_id: restaurantId,
        branch_id: branchId,
        terminal,
        status,
      },
      include: {
        restaurant: { select: { restaurant_id: true, name: true } },
        branch: {
          select: { branch_id: true, branch_name: true, branch_code: true },
        },
      },
    });

    return NextResponse.json(serializeUser(created), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/users error:", err);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
