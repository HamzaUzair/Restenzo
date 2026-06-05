import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  requireAuth,
  requireSuperAdmin,
} from "@/lib/server-auth";
import { getPlans } from "@/lib/plans";

/**
 * GET /api/platform/plans
 *
 * Returns the full plan catalog (admin shape, incl. Stripe ids + inactive
 * plans). SUPER_ADMIN only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);
    const plans = await getPlans();
    return NextResponse.json({ plans });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/platform/plans error:", err);
    return NextResponse.json(
      { error: "Failed to load plans" },
      { status: 500 }
    );
  }
}
