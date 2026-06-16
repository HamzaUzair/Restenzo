import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuth, requireSuperAdmin } from "@/lib/server-auth";
import { generateUniqueBranchCode } from "@/lib/branch-code";
import { seedDefaultCategoriesForBranch } from "@/lib/seedDefaultCategories";
import { hashPassword } from "@/lib/password";

function slugify(input: string) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type CreateRestaurantBody = {
  name?: string;
  slug?: string;
  phone?: string | null;
  address?: string | null;
  status?: string;
  /**
   * When false, the tenant is single-branch and we auto-create one default
   * branch so every branch-scoped module (menu, orders, halls, etc.) keeps
   * working without exposing branch management to the Restaurant Admin.
   */
  has_multiple_branches?: boolean;
  admin_full_name?: string;
  admin_username?: string;
  admin_password?: string;
  admin_confirm_password?: string;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const restaurants = await prisma.restaurant.findMany({
      orderBy: { created_at: "desc" },
      include: {
        _count: { select: { branches: true, users: true } },
      },
    });

    return NextResponse.json(
      restaurants.map((r) => ({
        restaurant_id: r.restaurant_id,
        name: r.name,
        slug: r.slug,
        phone: r.phone,
        address: r.address,
        status: r.status,
        has_multiple_branches: r.has_multiple_branches,
        branch_count: r._count.branches,
        admin_count: r._count.users,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      }))
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/restaurants error:", err);
    return NextResponse.json(
      { error: "Failed to fetch restaurants" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const body = (await request.json()) as CreateRestaurantBody;
    const name = String(body.name ?? "").trim();
    const slugInput = String(body.slug ?? "").trim();
    const slug = slugify(slugInput || name);
    const status =
      body.status === "Inactive"
        ? "Inactive"
        : body.status === "Suspended"
        ? "Suspended"
        : "Active";
    // Default to multi-branch when the flag isn't supplied — matches the
    // existing behavior (all previously created restaurants were multi-branch).
    const hasMultipleBranches =
      typeof body.has_multiple_branches === "boolean"
        ? body.has_multiple_branches
        : true;

    if (!name) {
      return NextResponse.json(
        { error: "Restaurant name is required" },
        { status: 400 }
      );
    }
    if (!slug) {
      return NextResponse.json(
        { error: "Restaurant code / slug is required" },
        { status: 400 }
      );
    }

    const duplicate = await prisma.restaurant.findUnique({ where: { slug } });
    if (duplicate) {
      return NextResponse.json(
        { error: `Restaurant code "${slug}" already exists` },
        { status: 409 }
      );
    }

    /* Optional: also create a Restaurant Admin in the same transaction */
    const wantsAdmin =
      body.admin_username ||
      body.admin_password ||
      body.admin_full_name ||
      body.admin_confirm_password;

    let adminUsername = "";
    let adminFullName = "";
    let adminPassword = "";

    if (wantsAdmin) {
      adminUsername = String(body.admin_username ?? "").trim();
      adminFullName = String(body.admin_full_name ?? "").trim();
      adminPassword = String(body.admin_password ?? "");
      const adminConfirm = String(body.admin_confirm_password ?? "");

      if (!adminUsername || !adminFullName || !adminPassword) {
        return NextResponse.json(
          {
            error:
              "Admin full name, username/email and password are required to assign an admin.",
          },
          { status: 400 }
        );
      }
      if (adminPassword.length < 6) {
        return NextResponse.json(
          { error: "Admin password must be at least 6 characters." },
          { status: 400 }
        );
      }
      if (adminPassword !== adminConfirm) {
        return NextResponse.json(
          { error: "Admin passwords do not match." },
          { status: 400 }
        );
      }

      const usernameTaken = await prisma.user.findFirst({
        where: { username: { equals: adminUsername, mode: "insensitive" } },
        select: { id: true },
      });
      if (usernameTaken) {
        return NextResponse.json(
          { error: `Username "${adminUsername}" already exists` },
          { status: 409 }
        );
      }
    }

    // Single create/update flow — wrapped in a transaction so auto-created
    // branch / admin / restaurant either all land or none do.
    const created = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name,
          slug,
          phone: body.phone?.toString().trim() || null,
          address: body.address?.toString().trim() || null,
          status,
          has_multiple_branches: hasMultipleBranches,
        },
      });

      // Single-branch tenant → auto-provision one default branch so all
      // branch-scoped modules (menu / orders / halls / expenses) keep working
      // without ever exposing branch management to the Restaurant Admin.
      if (!hasMultipleBranches) {
        const branchCode = await generateUniqueBranchCode(slug, {
          suffix: "MAIN",
        });
        const mainBranch = await tx.branch.create({
          data: {
            branch_name: "Main Branch",
            branch_code: branchCode,
            restaurant_id: restaurant.restaurant_id,
            address: body.address?.toString().trim() || "",
            city: "",
            status: "Active",
          },
        });
        await seedDefaultCategoriesForBranch(mainBranch.branch_id, tx);
      }

      if (wantsAdmin) {
        await tx.user.create({
          data: {
            username: adminUsername,
            password: await hashPassword(adminPassword),
            fullname: adminFullName,
            role: "RESTAURANT_ADMIN",
            restaurant_id: restaurant.restaurant_id,
            branch_id: null,
            terminal: 1,
            status: "Active",
          },
        });
      }

      return restaurant;
    });

    return NextResponse.json(
      {
        restaurant_id: created.restaurant_id,
        name: created.name,
        slug: created.slug,
        phone: created.phone,
        address: created.address,
        status: created.status,
        has_multiple_branches: created.has_multiple_branches,
        branch_count: hasMultipleBranches ? 0 : 1,
        admin_count: wantsAdmin ? 1 : 0,
        created_at: created.created_at.toISOString(),
        updated_at: created.updated_at.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/restaurants error:", err);
    return NextResponse.json(
      { error: "Failed to create restaurant" },
      { status: 500 }
    );
  }
}
