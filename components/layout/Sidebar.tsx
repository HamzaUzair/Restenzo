"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  BadgePercent,
  UtensilsCrossed,
  Tag,
  ChefHat,
  ClipboardList,
  Receipt,
  BarChart3,
  PieChart,
  Wallet,
  CalendarCheck,
  Grid3X3,
  ShieldCheck,
  TrendingUp,
  Store,
  CreditCard,
  Package,
  LifeBuoy,
  X,
} from "lucide-react";
import { getAuthSession } from "@/lib/auth-client";

interface SidebarItem {
  label: string;
  icon: React.ReactNode;
  href?: string;
}

/* ══════════════ Platform (Super Admin) sidebar ══════════════
 * Restenzo Admin is the platform owner control center. The sidebar is
 * intentionally focused on SaaS concerns (tenants, subscriptions, plans,
 * billing, setup health, support) and never exposes restaurant-level
 * operational modules (menu, orders, kitchen, cashier, etc.).
 */
const superAdminMenu: SidebarItem[] = [
  { label: "Dashboard", icon: <LayoutDashboard size={20} />, href: "/dashboard" },
  { label: "Restaurants", icon: <Store size={20} />, href: "/restaurants" },
  { label: "Subscriptions", icon: <CreditCard size={20} />, href: "/subscriptions" },
  { label: "Plans", icon: <Package size={20} />, href: "/plans" },
  { label: "Billing", icon: <Wallet size={20} />, href: "/billing" },
  { label: "Support", icon: <LifeBuoy size={20} />, href: "/support" },
];

/* ══════════════ Restaurant Admin operational sidebar ══════════════ */
const restaurantAdminMenu: SidebarItem[] = [
  { label: "Dashboard", icon: <LayoutDashboard size={20} />, href: "/dashboard" },
  { label: "Branches", icon: <Building2 size={20} />, href: "/branches" },
  { label: "Categories", icon: <Tag size={20} />, href: "/categories" },
  { label: "Menu", icon: <UtensilsCrossed size={20} />, href: "/menu" },
  { label: "Deals", icon: <BadgePercent size={20} />, href: "/deals" },
  { label: "Kitchen", icon: <ChefHat size={20} />, href: "/kitchen" },
  { label: "Orders", icon: <ClipboardList size={20} />, href: "/orders" },
  { label: "New Order / POS", icon: <ClipboardList size={20} />, href: "/create-order" },
  { label: "Sales List", icon: <Receipt size={20} />, href: "/sales-list" },
  { label: "Sales Report", icon: <BarChart3 size={20} />, href: "/sales-report" },
  { label: "Menu Sales", icon: <PieChart size={20} />, href: "/menu-sales" },
  { label: "Expenses", icon: <Wallet size={20} />, href: "/expenses" },
  { label: "Day End", icon: <CalendarCheck size={20} />, href: "/dayend" },
  { label: "Halls", icon: <Grid3X3 size={20} />, href: "/halls" },
  { label: "Roles", icon: <ShieldCheck size={20} />, href: "/roles" },
  { label: "Advanced Analytics", icon: <TrendingUp size={20} />, href: "/analytics" },
];

/* ══════════════ Branch Admin operational sidebar ══════════════ *
 * Branch Admins run a single branch inside a multi-branch restaurant —
 * same operational toolbox as a single-branch Restaurant Admin, but
 * without the "Branches" switcher (they don't manage peers).
 */
const branchAdminMenu: SidebarItem[] = [
  { label: "Dashboard", icon: <LayoutDashboard size={20} />, href: "/dashboard" },
  { label: "Categories", icon: <Tag size={20} />, href: "/categories" },
  { label: "Menu", icon: <UtensilsCrossed size={20} />, href: "/menu" },
  { label: "Deals", icon: <BadgePercent size={20} />, href: "/deals" },
  { label: "Kitchen", icon: <ChefHat size={20} />, href: "/kitchen" },
  { label: "Orders", icon: <ClipboardList size={20} />, href: "/orders" },
  { label: "Sales List", icon: <Receipt size={20} />, href: "/sales-list" },
  { label: "Sales Report", icon: <BarChart3 size={20} />, href: "/sales-report" },
  { label: "Menu Sales", icon: <PieChart size={20} />, href: "/menu-sales" },
  { label: "Expenses", icon: <Wallet size={20} />, href: "/expenses" },
  { label: "Day End", icon: <CalendarCheck size={20} />, href: "/dayend" },
  { label: "Halls", icon: <Grid3X3 size={20} />, href: "/halls" },
  { label: "Roles", icon: <ShieldCheck size={20} />, href: "/roles" },
  // "Advanced Analytics" has been merged into the Branch Admin Dashboard.
  // The /analytics route is also removed from BRANCH_ADMIN_ALLOWED_PATHS so
  // direct URL hits safely redirect to /dashboard.
];

/* ══════════════ Order Taker limited menu ══════════════ */
const orderTakerMenu: SidebarItem[] = [
  { label: "New Order / POS", icon: <ClipboardList size={20} />, href: "/create-order" },
  { label: "Deals", icon: <BadgePercent size={20} />, href: "/order-deals" },
];

const liveKitchenMenu: SidebarItem[] = [
  { label: "Kitchen", icon: <ChefHat size={20} />, href: "/kitchen" },
];

/* ══════════════ Cashier limited menu ══════════════ *
 * Cashiers handle served orders + collect payments, and can run Day End
 * for their assigned branch. Day End reuses the exact same page as the
 * Branch Admin / single-branch Restaurant Admin (see `app/dayend/page.tsx`);
 * branch locking is enforced via `isBranchFilterLocked(CASHIER) === true`,
 * so they cannot view or close another branch's day.
 */
const cashierMenu: SidebarItem[] = [
  { label: "Orders", icon: <ClipboardList size={20} />, href: "/orders" },
  { label: "Expenses", icon: <Wallet size={20} />, href: "/expenses" },
  { label: "Day End", icon: <CalendarCheck size={20} />, href: "/dayend" },
];

/* ══════════════ Accountant finance-only menu ══════════════ *
 * Accountant is a read-only finance/reporting role. They can browse every
 * finance module but cannot mutate expenses (Add/Edit/Delete are hidden in
 * the UI and rejected by the API). Operational modules — categories, menu,
 * deals, kitchen, orders/POS, halls, day-end closing, roles — are
 * intentionally excluded so this panel feels like a proper finance view.
 * Branch scope is enforced server-side via `isBranchScopedRole(ACCOUNTANT)`
 * so single-branch tenants see their internal default branch and
 * multi-branch tenants only see the accountant's assigned branch.
 */
const accountantMenu: SidebarItem[] = [
  { label: "Sales List", icon: <Receipt size={20} />, href: "/sales-list" },
  { label: "Sales Report", icon: <BarChart3 size={20} />, href: "/sales-report" },
  { label: "Menu Sales", icon: <PieChart size={20} />, href: "/menu-sales" },
  { label: "Expenses", icon: <Wallet size={20} />, href: "/expenses" },
];

const staffMenu: SidebarItem[] = [
  { label: "Dashboard", icon: <LayoutDashboard size={20} />, href: "/dashboard" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const session = getAuthSession();
  const role = session?.role ?? "SUPER_ADMIN";

  // Single-branch restaurants don't manage branches from the UI — the tenant
  // operates on its single auto-provisioned default branch behind the scenes.
  // Multi-branch (Head Office) restaurants hide the legacy "Advanced Analytics"
  // module because its content has been merged into the Dashboard.
  const restaurantAdminMenuForSession = (() => {
    if (role !== "RESTAURANT_ADMIN") return restaurantAdminMenu;
    if (session?.restaurantHasMultipleBranches === false) {
      // Single-branch tenants don't expose Branches management, don't need
      // the extra "New Order / POS" shortcut (they operate from /orders and
      // role-assigned POS users), and the Advanced Analytics module is
      // merged into the Dashboard.
      return restaurantAdminMenu.filter(
        (item) =>
          item.href !== "/branches" &&
          item.href !== "/create-order" &&
          item.href !== "/analytics"
      );
    }
    if (session?.restaurantHasMultipleBranches === true) {
      // Head Office users don't take orders themselves and the Advanced
      // Analytics module has been merged into the Dashboard.
      return restaurantAdminMenu.filter(
        (item) => item.href !== "/analytics" && item.href !== "/create-order"
      );
    }
    return restaurantAdminMenu;
  })();

  const menuItems =
    role === "SUPER_ADMIN"
      ? superAdminMenu
      : role === "RESTAURANT_ADMIN"
      ? restaurantAdminMenuForSession
      : role === "BRANCH_ADMIN"
      ? branchAdminMenu
      : role === "ORDER_TAKER"
      ? orderTakerMenu
      : role === "LIVE_KITCHEN"
      ? liveKitchenMenu
      : role === "CASHIER"
      ? cashierMenu
      : role === "ACCOUNTANT"
      ? accountantMenu
      : staffMenu;

  const panelLabel =
    role === "SUPER_ADMIN"
      ? "Restenzo"
      : role === "RESTAURANT_ADMIN"
      ? "Restaurant Admin"
      : role === "BRANCH_ADMIN"
      ? "Branch Admin"
      : role === "ORDER_TAKER"
      ? "Order Taker"
      : role === "LIVE_KITCHEN"
      ? "Live Kitchen"
      : role === "CASHIER"
      ? "Cashier"
      : role === "ACCOUNTANT"
      ? "Accountant"
      : "Staff Panel";

  const baseClasses =
    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer";
  const activeClasses = "bg-[#ff5a1f] text-white shadow-sm";
  const inactiveClasses = "text-gray-600 hover:bg-gray-100 hover:text-gray-900";

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#ff5a1f] flex items-center justify-center">
              <UtensilsCrossed size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold text-[#ff5a1f] tracking-wide">
              {panelLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        {role === "RESTAURANT_ADMIN" && session?.restaurantName && (
          <div className="mx-3 mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Restaurant
            </p>
            <p className="text-sm font-semibold text-gray-800 truncate">
              {session.restaurantName}
            </p>
            {session.restaurantHasMultipleBranches === true && (
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[#ff5a1f]">
                Head Office · View only
              </p>
            )}
          </div>
        )}

        {(role === "BRANCH_ADMIN" || role === "ACCOUNTANT") &&
          (session?.restaurantName || session?.branchName) && (
            <div className="mx-3 mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              {session?.restaurantName && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Restaurant
                  </p>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {session.restaurantName}
                  </p>
                </>
              )}
              {session?.branchName && (
                <>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Branch
                  </p>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {session.branchName}
                  </p>
                </>
              )}
            </div>
          )}

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {menuItems.map((item) => {
            const isActive = item.href ? pathname === item.href : false;
            const classes = `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={classes}
                  onClick={onClose}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            }

            return (
              <button key={item.label} className={classes}>
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <p className="text-[11px] text-gray-400 text-center">
            © 2024 Restenzo
          </p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
