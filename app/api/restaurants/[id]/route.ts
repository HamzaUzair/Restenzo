import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuth, requireSuperAdmin } from "@/lib/server-auth";
import { seedDefaultCategoriesForBranch } from "@/lib/seedDefaultCategories";

function slugify(input: string) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const { id } = await params;
    const restaurantId = Number(id);
    if (Number.isNaN(restaurantId)) {
      return NextResponse.json({ error: "Invalid restaurant id" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { restaurant_id: restaurantId },
      include: {
        branches: {
          select: {
            branch_id: true,
            branch_name: true,
            branch_code: true,
            status: true,
          },
          orderBy: { branch_name: "asc" },
        },
        users: {
          where: { role: "RESTAURANT_ADMIN" },
          orderBy: { id: "asc" },
          select: {
            id: true,
            username: true,
            fullname: true,
            password: true,
            status: true,
          },
        },
      },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const admins = restaurant.users.map((u) => ({
      user_id: u.id,
      username: u.username,
      full_name: u.fullname ?? "",
      status: u.status,
    }));

    // Surface the primary admin credentials to the Super Admin edit modal.
    // Passwords are stored in plain text in the User model today (see the
    // login route), so we can safely return them here for the platform owner.
    const primary = restaurant.users[0] ?? null;
    const primary_admin = primary
      ? {
          user_id: primary.id,
          username: primary.username,
          full_name: primary.fullname ?? "",
          password: primary.password,
          status: primary.status,
        }
      : null;

    return NextResponse.json({
      restaurant_id: restaurant.restaurant_id,
      name: restaurant.name,
      slug: restaurant.slug,
      phone: restaurant.phone,
      address: restaurant.address,
      status: restaurant.status,
      has_multiple_branches: restaurant.has_multiple_branches,
      branch_count: restaurant.branches.length,
      admin_count: admins.length,
      created_at: restaurant.created_at.toISOString(),
      updated_at: restaurant.updated_at.toISOString(),
      branches: restaurant.branches,
      admins,
      primary_admin,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/restaurants/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch restaurant" },
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
    requireSuperAdmin(auth);

    const { id } = await params;
    const restaurantId = Number(id);
    if (Number.isNaN(restaurantId)) {
      return NextResponse.json({ error: "Invalid restaurant id" }, { status: 400 });
    }

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const slugInput = String(body.slug ?? "").trim();
    const slug = slugify(slugInput || name);
    const status =
      body.status === "Inactive"
        ? "Inactive"
        : body.status === "Suspended"
        ? "Suspended"
        : "Active";

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
    if (duplicate && duplicate.restaurant_id !== restaurantId) {
      return NextResponse.json(
        { error: `Restaurant code "${slug}" already exists` },
        { status: 409 }
      );
    }

    // ── Multi-branch flag ─────────────────────────────────────────────
    // Optional in the payload. When omitted we keep the existing value.
    // When flipping multi-branch OFF while the tenant already owns more
    // than one branch we refuse — the operator must merge/remove branches
    // first or leave the flag on.
    const currentRestaurant = await prisma.restaurant.findUnique({
      where: { restaurant_id: restaurantId },
      select: {
        has_multiple_branches: true,
        _count: { select: { branches: true } },
      },
    });
    if (!currentRestaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }
    let nextHasMultipleBranches = currentRestaurant.has_multiple_branches;
    if (typeof body.has_multiple_branches === "boolean") {
      nextHasMultipleBranches = body.has_multiple_branches;
      if (
        nextHasMultipleBranches === false &&
        currentRestaurant._count.branches > 1
      ) {
        return NextResponse.json(
          {
            error:
              "Cannot switch to single-branch: this restaurant already has more than one branch. Remove extra branches first.",
          },
          { status: 409 }
        );
      }
    }

    // ── Optional admin fields: the Super Admin can also rotate the tenant's
    // Restaurant Admin credentials directly from the Edit modal. Empty strings
    // mean "don't touch". A non-empty password (with matching confirm) rotates
    // the password; username / full name updates follow the same rule.
    const adminFullName =
      typeof body.admin_full_name === "string" ? body.admin_full_name.trim() : "";
    const adminUsername =
      typeof body.admin_username === "string" ? body.admin_username.trim() : "";
    const adminPassword =
      typeof body.admin_password === "string" ? body.admin_password : "";
    const adminConfirm =
      typeof body.admin_confirm_password === "string"
        ? body.admin_confirm_password
        : "";

    const hasAnyAdminField =
      adminFullName || adminUsername || adminPassword || adminConfirm;

    if (hasAnyAdminField) {
      if (adminPassword || adminConfirm) {
        if (adminPassword.length < 6) {
          return NextResponse.json(
            { error: "Admin password must be at least 6 characters" },
            { status: 400 }
          );
        }
        if (adminPassword !== adminConfirm) {
          return NextResponse.json(
            { error: "Admin password and confirm password do not match" },
            { status: 400 }
          );
        }
      }
      if (adminUsername && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminUsername)) {
        return NextResponse.json(
          { error: "Please enter a valid admin email address" },
          { status: 400 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedRestaurant = await tx.restaurant.update({
        where: { restaurant_id: restaurantId },
        data: {
          name,
          slug,
          phone: body.phone?.toString().trim() || null,
          address: body.address?.toString().trim() || null,
          status,
          has_multiple_branches: nextHasMultipleBranches,
        },
      });

      // Switching a restaurant into "single-branch" mode should always leave
      // it with at least one branch — otherwise every operational module
      // (menu, orders, halls, expenses, …) would have nowhere to live.
      if (
        nextHasMultipleBranches === false &&
        currentRestaurant._count.branches === 0
      ) {
        const base = (updatedRestaurant.slug || "main")
          .toUpperCase()
          .slice(0, 16);
        const desiredCode = `${base}-MAIN`;
        // Find a unique code.
        let branchCode = desiredCode;
        let i = 2;
        while (i < 1000) {
          const clash = await tx.branch.findUnique({
            where: { branch_code: branchCode },
          });
          if (!clash) break;
          branchCode = `${desiredCode}-${i}`;
          i += 1;
        }
        const mainBranch = await tx.branch.create({
          data: {
            branch_name: "Main Branch",
            branch_code: branchCode,
            restaurant_id: updatedRestaurant.restaurant_id,
            address: updatedRestaurant.address ?? "",
            city: "",
            status: "Active",
          },
        });
        await seedDefaultCategoriesForBranch(mainBranch.branch_id, tx);
      }

      if (hasAnyAdminField) {
        const existingAdmin = await tx.user.findFirst({
          where: { restaurant_id: restaurantId, role: "RESTAURANT_ADMIN" },
          orderBy: { id: "asc" },
        });

        if (existingAdmin) {
          // Updating the existing Restaurant Admin. Ensure the new username is
          // not already taken by a different user.
          if (adminUsername && adminUsername !== existingAdmin.username) {
            const clash = await tx.user.findFirst({
              where: {
                username: { equals: adminUsername, mode: "insensitive" },
                NOT: { id: existingAdmin.id },
              },
              select: { id: true },
            });
            if (clash) {
              throw new Error(
                `Username "${adminUsername}" is already in use by another account`
              );
            }
          }
          await tx.user.update({
            where: { id: existingAdmin.id },
            data: {
              ...(adminUsername ? { username: adminUsername } : {}),
              ...(adminFullName ? { fullname: adminFullName } : {}),
              ...(adminPassword ? { password: adminPassword } : {}),
            },
          });
        } else {
          // No admin exists yet — create one, but only if the caller provided
          // everything needed for a valid login.
          if (!adminFullName || !adminUsername || !adminPassword) {
            throw new Error(
              "To add a Restaurant Admin, please provide full name, email/username and password."
            );
          }
          const clash = await tx.user.findFirst({
            where: { username: { equals: adminUsername, mode: "insensitive" } },
            select: { id: true },
          });
          if (clash) {
            throw new Error(`Username "${adminUsername}" already exists`);
          }
          await tx.user.create({
            data: {
              username: adminUsername,
              password: adminPassword,
              fullname: adminFullName,
              role: "RESTAURANT_ADMIN",
              status: "Active",
              terminal: 1,
              restaurant_id: restaurantId,
              branch_id: null,
            },
          });
        }
      }

      return updatedRestaurant;
    });

    return NextResponse.json({
      restaurant_id: result.restaurant_id,
      name: result.name,
      slug: result.slug,
      phone: result.phone,
      address: result.address,
      status: result.status,
      has_multiple_branches: result.has_multiple_branches,
      created_at: result.created_at.toISOString(),
      updated_at: result.updated_at.toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PUT /api/restaurants/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update restaurant" },
      { status: 500 }
    );
  }
}

/**
 * Hard-delete a tenant (restaurant) and every piece of data that belongs to it.
 *
 * The raw FK graph has lots of `ON DELETE RESTRICT` edges (orders, categories,
 * menu, halls, expenses, etc. all reference branches without a cascade), so a
 * naive `prisma.restaurant.delete()` blows up the moment a tenant has any
 * history. We instead explicitly wipe every child table inside a single
 * transaction, in reverse dependency order, before dropping the restaurant
 * row itself (which then cascades the remaining branches).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const { id } = await params;
    const restaurantId = Number(id);
    if (Number.isNaN(restaurantId)) {
      return NextResponse.json({ error: "Invalid restaurant id" }, { status: 400 });
    }

    const existing = await prisma.restaurant.findUnique({
      where: { restaurant_id: restaurantId },
      select: { restaurant_id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const branches = await tx.branch.findMany({
        where: { restaurant_id: restaurantId },
        select: { branch_id: true },
      });
      const branchIds = branches.map((b) => b.branch_id);

      // 1. Orders + their dependents. Match by restaurant_id OR branch membership
      //    so we also sweep up any orders whose restaurant_id was somehow null.
      const orders = await tx.order.findMany({
        where: {
          OR: [
            { restaurant_id: restaurantId },
            branchIds.length ? { branch_id: { in: branchIds } } : { order_id: -1 },
          ],
        },
        select: { order_id: true },
      });
      const orderIds = orders.map((o) => o.order_id);
      if (orderIds.length) {
        await tx.payment.deleteMany({ where: { order_id: { in: orderIds } } });
        await tx.orderItem.deleteMany({ where: { order_id: { in: orderIds } } });
        await tx.order.deleteMany({ where: { order_id: { in: orderIds } } });
      }

      if (branchIds.length) {
        // 2. Deal items reference menu items; delete them first.
        await tx.dealItem.deleteMany({
          where: { deal: { branch_id: { in: branchIds } } },
        });
        await tx.deal.deleteMany({ where: { branch_id: { in: branchIds } } });

        // 3. Menu items (drops variations via cascade) + categories.
        await tx.menuVariation.deleteMany({
          where: { menu: { branch_id: { in: branchIds } } },
        });
        await tx.menuItem.deleteMany({ where: { branch_id: { in: branchIds } } });
        await tx.category.deleteMany({ where: { branch_id: { in: branchIds } } });

        // 4. Floor plan
        await tx.table.deleteMany({ where: { branch_id: { in: branchIds } } });
        await tx.hall.deleteMany({ where: { branch_id: { in: branchIds } } });

        // 5. Finance / operations
        await tx.expense.deleteMany({ where: { branch_id: { in: branchIds } } });
        await tx.dayEnd.deleteMany({ where: { branch_id: { in: branchIds } } });

        // 6. Branch-pinned staff users (super admins are global and preserved).
        await tx.user.deleteMany({
          where: {
            branch_id: { in: branchIds },
            role: { not: "SUPER_ADMIN" },
          },
        });
      }

      // 7. Restaurant-level admins (tenant users with no branch pin).
      await tx.user.deleteMany({
        where: {
          restaurant_id: restaurantId,
          role: { not: "SUPER_ADMIN" },
        },
      });

      // 8. Finally drop the restaurant. Branches cascade automatically via FK.
      await tx.restaurant.delete({ where: { restaurant_id: restaurantId } });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("DELETE /api/restaurants/[id] error:", err);
    const message =
      err instanceof Error && err.message
        ? `Failed to delete restaurant: ${err.message}`
        : "Failed to delete restaurant";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
