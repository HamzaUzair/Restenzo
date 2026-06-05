"use client";

import type { AuthSession } from "@/types/auth";

const AUTH_STORAGE_KEY = "auth_session";

/** Routes visible in the Super Admin platform panel.
 *
 * The Restenzo Admin panel is a SaaS platform owner control center, so the
 * allowed routes are scoped to tenant management, billing, subscriptions,
 * plans, setup health and support — never to restaurant operational data.
 */
export const SUPER_ADMIN_ALLOWED_PATHS = new Set([
  "/dashboard",
  "/restaurants",
  "/subscriptions",
  "/plans",
  "/billing",
  "/support",
]);

/** Routes visible in the Restaurant Admin operational panel. */
export const RESTAURANT_ADMIN_ALLOWED_PATHS = new Set([
  "/dashboard",
  "/branches",
  "/categories",
  "/menu",
  "/deals",
  "/kitchen",
  "/orders",
  "/create-order",
  "/sales-list",
  "/sales-report",
  "/menu-sales",
  "/expenses",
  "/dayend",
  "/halls",
  "/roles",
  "/analytics",
  "/seating",
]);

/**
 * Routes visible in the Branch Admin operational panel. Branch Admins get the
 * full per-branch operational toolkit minus restaurant-wide concerns such as
 * multi-branch management or the Branches list.
 *
 * The legacy "/analytics" (Advanced Analytics) route has been merged into the
 * Branch Admin Dashboard, so it is intentionally excluded here — direct URL
 * hits bounce to /dashboard via DashboardLayout's role guard.
 */
export const BRANCH_ADMIN_ALLOWED_PATHS = new Set([
  "/dashboard",
  "/categories",
  "/menu",
  "/deals",
  "/kitchen",
  "/orders",
  "/sales-list",
  "/sales-report",
  "/menu-sales",
  "/expenses",
  "/dayend",
  "/halls",
  "/roles",
  "/seating",
]);

/**
 * Build the allowed-paths set for the Restaurant Admin, honoring the
 * tenant's "has multiple branches" flag. Single-branch tenants have the
 * `/branches` route hidden *and* blocked, so typing the URL directly
 * redirects to the dashboard instead of exposing branch management.
 *
 * Multi-branch (Head Office) tenants have the legacy `/analytics`
 * (Advanced Analytics) route hidden and blocked — that drilldown is now
 * merged into the Dashboard, so hitting the URL directly redirects to
 * the Head Office Dashboard rather than exposing a duplicate module.
 */
export function getRestaurantAdminAllowedPaths(
  session: AuthSession | null
): Set<string> {
  const paths = new Set(RESTAURANT_ADMIN_ALLOWED_PATHS);
  if (session?.restaurantHasMultipleBranches === false) {
    paths.delete("/branches");
    paths.delete("/create-order");
    paths.delete("/analytics");
  }
  if (session?.restaurantHasMultipleBranches === true) {
    paths.delete("/analytics");
    paths.delete("/create-order");
  }
  return paths;
}

export const STAFF_ALLOWED_PATHS = new Set(["/dashboard"]);
export const ORDER_TAKER_ALLOWED_PATHS = new Set(["/create-order", "/order-deals"]);
export const LIVE_KITCHEN_ALLOWED_PATHS = new Set(["/kitchen"]);
/**
 * Routes visible in the Accountant finance/reporting panel. The Accountant
 * is a *view-only* finance role — they can open Sales List, Sales Report,
 * Menu Sales and Expenses but they cannot mutate expenses (Add / Edit /
 * Delete are all hidden in the UI and rejected by the API). Every module
 * here is branch-scoped server-side via `isBranchScopedRole(ACCOUNTANT)`,
 * so both single-branch tenants (internal default branch) and multi-branch
 * tenants (assigned branch only) get the correct slice of data.
 */
export const ACCOUNTANT_ALLOWED_PATHS = new Set([
  "/sales-list",
  "/sales-report",
  "/menu-sales",
  "/expenses",
]);
// Cashiers can reach the Orders module (their main workspace), the Expenses
// module (to log branch-level expenses like cash refills, utilities paid at
// the counter, etc.), and the Day End module for their own branch. Every
// other path falls back to /orders via the DashboardLayout role guard. The
// backing APIs re-enforce branch ownership on the server via
// `assertBranchWriteAccess` + `buildBranchScopeFilter`, so even if this
// client-side whitelist were bypassed the data would still be locked to the
// cashier's assigned branch.
export const CASHIER_ALLOWED_PATHS = new Set([
  "/orders",
  "/expenses",
  "/dayend",
]);

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function setAuthSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem("isAuthenticated", "true");
  localStorage.setItem("userRole", session.role.toLowerCase());
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem("isAuthenticated");
  localStorage.removeItem("userRole");
}

export function isSuperAdmin(session: AuthSession | null) {
  return session?.role === "SUPER_ADMIN";
}

export function isRestaurantAdmin(session: AuthSession | null) {
  return session?.role === "RESTAURANT_ADMIN";
}

export function isBranchAdmin(session: AuthSession | null) {
  return session?.role === "BRANCH_ADMIN";
}

export function isAccountant(session: AuthSession | null) {
  return session?.role === "ACCOUNTANT";
}

/**
 * Single source of truth for "can this session mutate expenses?". The
 * Accountant is a view-only finance role, so Add / Edit / Delete actions
 * are hidden in the UI and rejected server-side. All other role logic
 * (Restaurant Admin read-only in multi-branch mode, etc.) still applies.
 */
export function canMutateExpenses(session: AuthSession | null): boolean {
  if (isAccountant(session)) return false;
  return canEditOperational(session);
}

/**
 * Single source of truth for "can this session edit branch-scoped operational
 * data?". Mirrors the server-side `assertBranchWriteAccess`.
 *
 *   - Super Admin                           → editable
 *   - Restaurant Admin (single-branch)      → editable
 *   - Restaurant Admin (multi-branch)       → read-only (head-office view)
 *   - Branch Admin / Order Taker / Cashier /
 *     Accountant                            → editable within their branch
 */
export function isOperationalReadOnly(session: AuthSession | null): boolean {
  if (!session) return true;
  if (session.role === "RESTAURANT_ADMIN") {
    return session.restaurantHasMultipleBranches === true;
  }
  return false;
}

/** Convenience inverse of {@link isOperationalReadOnly}. */
export function canEditOperational(session: AuthSession | null): boolean {
  return !isOperationalReadOnly(session);
}

/**
 * Best-effort inference of the "effective" branch filter value for UI selects.
 *
 *   - Super Admin                          → "all" (platform scope)
 *   - Restaurant Admin (multi-branch)      → "all" (head-office view)
 *   - Restaurant Admin (single-branch)     → the tenant's internal branch
 *     (login auto-populates `session.branchId` so branch-scoped modules do
 *      not show awkward "All Branches" dropdowns)
 *   - Branch-pinned roles                  → their assigned branch
 */
export function getEffectiveBranchId(session: AuthSession | null): number | "all" {
  if (!session) return "all";
  if (
    session.role === "BRANCH_ADMIN" ||
    session.role === "ORDER_TAKER" ||
    session.role === "CASHIER" ||
    session.role === "ACCOUNTANT" ||
    session.role === "LIVE_KITCHEN"
  ) {
    return session.branchId ?? "all";
  }
  if (
    session.role === "RESTAURANT_ADMIN" &&
    session.restaurantHasMultipleBranches === false &&
    session.branchId != null
  ) {
    return session.branchId;
  }
  return "all";
}

/**
 * UI must not offer "All branches" for this session.
 *
 *   - Branch-scoped staff roles are always locked to their assigned branch.
 *   - Single-branch Restaurant Admins are also locked: there is only one
 *     internal branch and branch management is hidden from them entirely,
 *     so every branch-owned module auto-scopes to that single branch
 *     (mirrors server `isBranchScopedRole` + single-branch tenancy).
 */
export function isBranchFilterLocked(session: AuthSession | null): boolean {
  if (!session) return false;
  if (
    session.role === "RESTAURANT_ADMIN" &&
    session.restaurantHasMultipleBranches === false
  ) {
    return true;
  }
  return (
    session.role === "BRANCH_ADMIN" ||
    session.role === "ORDER_TAKER" ||
    session.role === "CASHIER" ||
    session.role === "ACCOUNTANT" ||
    session.role === "LIVE_KITCHEN"
  );
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const session = getAuthSession();
  const headers = new Headers(init.headers ?? {});
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }
  return fetch(input, { ...init, headers });
}
