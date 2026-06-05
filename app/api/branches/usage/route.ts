import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/server-auth";
import { getBranchUsage, type BranchUsage } from "@/lib/branch-limits";

/**
 * GET /api/branches/usage
 *
 * Returns the caller's restaurant branch usage + plan limit for the Branch
 * Management UI ("Branches: X / Y used"). Super Admins (platform-wide scope)
 * get an unlimited result unless they pass ?restaurantId=.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("restaurantId");

    let restaurantId: number | null = auth.restaurantId ?? null;
    if (auth.role === "SUPER_ADMIN") {
      restaurantId =
        requested && requested !== "all" ? Number(requested) : null;
    }

    if (!restaurantId || Number.isNaN(restaurantId)) {
      const unlimited: BranchUsage = {
        used: 0,
        max: null,
        planSlug: "all",
        planName: "All restaurants",
        canCreate: true,
      };
      return NextResponse.json(unlimited);
    }

    const usage = await getBranchUsage(restaurantId);
    return NextResponse.json(usage);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/branches/usage error:", err);
    return NextResponse.json(
      { error: "Failed to load branch usage" },
      { status: 500 }
    );
  }
}
