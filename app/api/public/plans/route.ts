import { NextResponse } from "next/server";
import { getPublicPlans } from "@/lib/plans";

/**
 * GET /api/public/plans
 *
 * Public, unauthenticated plan catalog for the marketing site and signup
 * flow. Returns only public-safe fields (no Stripe ids, no inactive plans).
 * Always reflects the latest values the Platform Admin has saved.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const plans = await getPublicPlans();
    return NextResponse.json({ plans });
  } catch (err) {
    console.error("GET /api/public/plans error:", err);
    return NextResponse.json(
      { error: "Failed to load plans" },
      { status: 500 }
    );
  }
}
