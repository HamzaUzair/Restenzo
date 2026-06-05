"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SalesTrendChart from "@/components/dashboard/SalesTrendChart";
import SystemAlertsPanel from "@/components/dashboard/SystemAlertsPanel";
import BranchOrderStatusOverview from "@/components/dashboard/BranchOrderStatusOverview";
import PlatformDashboard from "@/components/platform/PlatformDashboard";
import { usePlatformOverview } from "@/components/platform/usePlatformOverview";
import {
  Building2,
  BadgePercent,
  UtensilsCrossed,
  ClipboardList,
  PlusCircle,
  Landmark,
  TrendingUp,
  DollarSign,
  Package,
  ShoppingCart,
  BarChart3,
  Trophy,
  TrendingDown,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Wallet,
  UserRound,
  Tag,
  ChefHat,
  Receipt,
  PieChart,
  CalendarCheck,
  Grid3X3,
  ArrowUpRight,
} from "lucide-react";
import type { DashboardStats } from "@/types/dashboard";
import { apiFetch, getAuthSession } from "@/lib/auth-client";

function formatPKR(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString("en-PK")}`;
}

type HeadOfficeRange = "today" | "7days" | "30days";

interface HeadOfficeBranchRow {
  branch_id: number;
  branch_name: string;
  branch_code: string;
  status: string;
  sales: number;
  orders: number;
  avgOrderValue: number;
}

/**
 * Shape used by the dual "Top Selling Items" cards. Both ranked lists
 * (`topSellingByQuantity` / `topSellingBySales`) carry the full numeric
 * payload so each card can render its primary metric *and* the secondary
 * one (e.g. by-quantity card shows units sold + revenue underneath).
 */
interface TopSellingApiItem {
  dish_id: number;
  name: string;
  category: string;
  quantity: number;
  total: number;
}

interface HeadOfficeOverview {
  level: "restaurant";
  range: HeadOfficeRange;
  restaurant: {
    restaurant_id: number;
    name: string;
    slug: string;
    status: string;
    branchCount: number;
    userCount: number;
    hasMultipleBranches?: boolean;
  };
  kpis: {
    totalSales: number;
    totalOrders: number;
    avgOrderValue: number;
    totalBranches: number;
    paidOrders?: number;
    cancelledOrders?: number;
    netRevenue?: number;
    cancelledRevenue?: number;
  };
  branches: HeadOfficeBranchRow[];
  topBranch: { branch_name: string; sales: number } | null;
  lowestBranch: { branch_name: string; sales: number } | null;
  /** Legacy (sales-ranked) list — still emitted for backwards-compat. */
  topSellingItems?: TopSellingApiItem[];
  topSellingByQuantity?: TopSellingApiItem[];
  topSellingBySales?: TopSellingApiItem[];
}

interface BranchAdminOverview {
  level: "branch";
  range: HeadOfficeRange;
  branch: {
    branch_id: number;
    branch_name: string;
    branch_code: string;
    status: string;
    restaurant: {
      restaurant_id: number;
      name: string;
      slug: string;
    } | null;
  };
  kpis: {
    totalSales: number;
    totalOrders: number;
    avgOrderValue: number;
    activeMenuItems: number;
    activeDeals: number;
    expenses: number;
  };
  topSellingItems: TopSellingApiItem[];
  topSellingByQuantity?: TopSellingApiItem[];
  topSellingBySales?: TopSellingApiItem[];
}

/* ?? Quick action buttons (no Create Order) ?? */
const quickActions = [
  { label: "Branches", icon: <Building2 size={22} />, href: "/branches", color: "text-[#ff5a1f]", bg: "bg-[#ff5a1f]/10" },
  { label: "New Order / POS", icon: <PlusCircle size={22} />, href: "/create-order", color: "text-blue-600", bg: "bg-blue-50" },
  { label: "Deals", icon: <BadgePercent size={22} />, href: "/deals", color: "text-purple-600", bg: "bg-purple-50" },
  { label: "Menu Items", icon: <UtensilsCrossed size={22} />, href: "/menu", color: "text-green-600", bg: "bg-green-50" },
  { label: "Orders", icon: <ClipboardList size={22} />, href: "/orders", color: "text-amber-600", bg: "bg-amber-50" },
  { label: "Accounts", icon: <Landmark size={22} />, href: "/users", color: "text-rose-600", bg: "bg-rose-50" },
];

const orderTakerQuickActions = quickActions.filter(
  (x) => x.href === "/create-order" || x.href === "/orders"
);

export default function DashboardPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [sessionBranchId, setSessionBranchId] = useState<number | null>(null);
  const [sessionRole, setSessionRole] = useState<string>("SUPER_ADMIN");
  const [sessionRestaurantHasMultipleBranches, setSessionRestaurantHasMultipleBranches] =
    useState<boolean | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const session = getAuthSession();
    if (!session) {
      router.replace("/login");
    } else {
      if (session.role === "ORDER_TAKER") {
        router.replace("/create-order");
        return;
      }
      setSessionBranchId(session.branchId ?? null);
      setSessionRole(session.role);
      setSessionRestaurantHasMultipleBranches(
        session.restaurantHasMultipleBranches ?? null
      );
      setAuthorized(true);
    }
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const qs =
          sessionBranchId
            ? `?branchId=${sessionBranchId}`
            : "";
        const res = await apiFetch(`/api/stats/dashboard${qs}`);
        if (res.ok) {
          const data: DashboardStats = await res.json();
          setStats(data);
        }
      } catch {
        // silently fail
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [authorized, sessionBranchId, sessionRole]);

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (sessionRole === "SUPER_ADMIN") {
    return <SuperAdminDashboardWrapper />;
  }

  // Head Office (multi-branch Restaurant Admin) gets a dedicated overview
  // page that merges the former "Advanced Analytics" module into the Dashboard.
  if (
    sessionRole === "RESTAURANT_ADMIN" &&
    sessionRestaurantHasMultipleBranches === true
  ) {
    return <HeadOfficeDashboard />;
  }

  // Single-branch Restaurant Admin also gets an analytics-first dashboard
  // (Advanced Analytics module merged in), adapted for the one-branch tenant.
  if (
    sessionRole === "RESTAURANT_ADMIN" &&
    sessionRestaurantHasMultipleBranches === false
  ) {
    return <SingleBranchDashboard />;
  }

  // Branch Admin (inside a multi-branch restaurant) gets an operational
  // overview focused strictly on their own branch. Advanced Analytics is
  // merged in ? no cross-branch ranking or head-office widgets leak here.
  if (sessionRole === "BRANCH_ADMIN") {
    return <BranchAdminDashboard />;
  }

  const statCards = [
    {
      label: "Today's Sales",
      value: statsLoading ? "?" : formatPKR(stats?.todaySales ?? 0),
      icon: <DollarSign size={24} />,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Orders Today",
      value: statsLoading ? "?" : String(stats?.ordersToday ?? 0),
      icon: <ShoppingCart size={24} />,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Avg Order Value",
      value: statsLoading ? "?" : formatPKR(stats?.avgOrderValue ?? 0),
      icon: <BarChart3 size={24} />,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Total Branches",
      value: statsLoading ? "?" : String(stats?.totalBranches ?? 0),
      icon: <Building2 size={24} />,
      color: "text-[#ff5a1f]",
      bg: "bg-[#ff5a1f]/10",
      href: "/branches#branches-table",
    },
    {
      label: "Menu Items",
      value: statsLoading ? "?" : String(stats?.menuItems ?? 0),
      icon: <Package size={24} />,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      label: "Active Deals",
      value: statsLoading ? "?" : String(stats?.activeDeals ?? 0),
      icon: <BadgePercent size={24} />,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  const visibleQuickActions =
    sessionRole === "ORDER_TAKER"
      ? orderTakerQuickActions
      : sessionRole === "RESTAURANT_ADMIN"
      ? quickActions.filter(
          (x) =>
            x.href !== "/users" &&
            !(
              sessionRestaurantHasMultipleBranches === false &&
              x.href === "/create-order"
            )
        )
      : sessionRole === "BRANCH_ADMIN"
      ? quickActions.filter((x) => x.href !== "/users" && x.href !== "/create-order")
      : sessionRole === "SUPER_ADMIN"
      ? quickActions.filter(
          (x) => x.href === "/restaurants" || x.href === "/users"
        )
      : quickActions;

  return (
    <DashboardLayout title="Dashboard">
      {/* ?? Page heading ?? */}
      <div className="mb-8">
        {sessionRole === "ORDER_TAKER" && (
          <h2 className="text-2xl font-bold text-gray-800">Order Taker Dashboard</h2>
        )}
        {sessionRole === "RESTAURANT_ADMIN" && (
          <h2 className="text-2xl font-bold text-gray-800">Restaurant Admin Dashboard</h2>
        )}
        {sessionRole === "SUPER_ADMIN" && (
          <h2 className="text-2xl font-bold text-gray-800">Restenzo Dashboard</h2>
        )}
        <p className="text-sm text-gray-500 mt-1">
          {sessionRole === "ORDER_TAKER"
            ? "Take branch orders quickly and accurately"
            : sessionRole === "RESTAURANT_ADMIN"
            ? "Restaurant-level monitoring and analytics"
            : "Platform monitoring, analytics, and restaurant performance"}
        </p>
      </div>

      {/* ?? Section 1: Top Business Overview Cards ?? */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5 mb-8">
        {statCards.map((s) => {
          const cardContent = (
            <>
              <div
                className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0 ${s.color}`}
              >
                {s.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wider truncate">
                  {s.label}
                </p>
                <p className="text-xl font-bold text-gray-800 mt-0.5 truncate">
                  {s.value}
                </p>
              </div>
            </>
          );

          if (s.href) {
            return (
              <Link
                key={s.label}
                href={s.href}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:ring-offset-2"
              >
                {cardContent}
              </Link>
            );
          }

          return (
            <div
              key={s.label}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow"
            >
              {cardContent}
            </div>
          );
        })}
      </div>

      {/* ?? Section 2: Sales Trend Chart ?? */}
      <div className="mb-8">
        <SalesTrendChart
          data={stats?.salesLast7Days ?? []}
          loading={statsLoading}
        />
      </div>

      {/* ?? Section 3 & 5 & 6: Branch table + Best/Lowest branch cards ?? */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Branch Performance Table ?? */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <TrendingUp size={20} className="text-[#ff5a1f]" />
            <h3 className="text-base font-semibold text-gray-800">
              Branch Performance
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-gray-50">
                  {[
                    "Branch Name",
                    "Today's Sales",
                    "Orders Today",
                    "Running",
                    "Completed",
                    "Avg Order",
                  ].map((col) => (
                    <th
                      key={col}
                      className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <Loader2 size={24} className="animate-spin text-[#ff5a1f] mx-auto" />
                    </td>
                  </tr>
                ) : !stats?.branchPerformance?.length ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 size={32} className="text-gray-300" />
                        <span className="text-sm">No data available</span>
                        <span className="text-xs text-gray-300">
                          Add branches and start taking orders to see analytics
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  stats.branchPerformance.map((b) => (
                    <tr key={b.branchId} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-800">{b.branchName}</td>
                      <td className="px-6 py-4 text-gray-600">{formatPKR(b.todaySales)}</td>
                      <td className="px-6 py-4 text-gray-600">{b.ordersToday}</td>
                      <td className="px-6 py-4 text-amber-600">{b.runningOrders}</td>
                      <td className="px-6 py-4 text-green-600">{b.completedOrders}</td>
                      <td className="px-6 py-4 text-gray-600">{formatPKR(b.avgOrderValue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Best & Lowest Branch + Alerts ?? */}
        <div className="space-y-6">
          {/* Best Branch ?? */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={18} className="text-amber-500" />
              <h3 className="text-sm font-bold text-gray-800">Top Branch Today</h3>
            </div>
            {statsLoading ? (
              <Loader2 size={20} className="animate-spin text-gray-400" />
            ) : stats?.bestBranch ? (
              <div>
                <p className="font-semibold text-gray-800">{stats.bestBranch.branchName}</p>
                <p className="text-lg font-bold text-[#ff5a1f] mt-1">
                  {formatPKR(stats.bestBranch.todaySales)}
                </p>
                <p className="text-xs text-gray-400">{stats.bestBranch.ordersToday} orders</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No sales data yet</p>
            )}
          </div>

          {/* Lowest Branch ?? */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown size={18} className="text-gray-500" />
              <h3 className="text-sm font-bold text-gray-800">Lowest Branch Today</h3>
            </div>
            {statsLoading ? (
              <Loader2 size={20} className="animate-spin text-gray-400" />
            ) : stats?.lowestBranch ? (
              <div>
                <p className="font-semibold text-gray-800">{stats.lowestBranch.branchName}</p>
                <p className="text-lg font-bold text-gray-600 mt-1">
                  {formatPKR(stats.lowestBranch.todaySales)}
                </p>
                <p className="text-xs text-gray-400">{stats.lowestBranch.ordersToday} orders</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No sales data yet</p>
            )}
          </div>

          {/* System Alerts ?? */}
          <SystemAlertsPanel alerts={stats?.alerts ?? []} />
        </div>
      </div>

      {/* ?? Section 4: Top Selling Items ?? */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-8">
        <h3 className="text-base font-semibold text-gray-800 mb-4">
          Top Selling Items Today
        </h3>
        {statsLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 size={24} className="animate-spin text-[#ff5a1f]" />
          </div>
        ) : !stats?.topSellingItems?.length ? (
          <div className="py-8 text-center text-gray-400">
            <UtensilsCrossed size={32} className="mx-auto mb-2 text-gray-200" />
            <p className="text-sm">No sales data available yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.topSellingItems.map((item, i) => (
              <div
                key={item.name}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#ff5a1f]/10 flex items-center justify-center text-xs font-bold text-[#ff5a1f]">
                    {i + 1}
                  </span>
                  <span className="font-medium text-gray-800">{item.name}</span>
                </div>
                <span className="text-sm text-gray-500">{item.quantity} orders</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ?? Section 8: Quick Actions (no Create Order) ?? */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Quick Navigation</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {visibleQuickActions.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col items-center gap-3 hover:shadow-md hover:border-[#ff5a1f]/30 transition-all cursor-pointer group"
            >
              <div
                className={`w-12 h-12 rounded-xl ${a.bg} flex items-center justify-center ${a.color} group-hover:scale-110 transition-transform`}
              >
                {a.icon}
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-[#ff5a1f] transition-colors">
                {a.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ??????????????????????????????????????????????????????????????????????
 * Head Office Dashboard (multi-branch Restaurant Admin)
 *
 * Replaces the legacy "Advanced Analytics" module and becomes the single
 * overview page for head-office users. All figures are restaurant-scoped
 * on the server (see /api/analytics/overview) so no cross-tenant data
 * can leak into this view.
 * ?????????????????????????????????????????????????????????????????????? */

function HeadOfficeDashboard() {
  const [range, setRange] = useState<HeadOfficeRange>("7days");
  const [data, setData] = useState<HeadOfficeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/analytics/overview?range=${range}`);
      if (!res.ok) throw new Error("Failed to load dashboard");
      const body = (await res.json()) as HeadOfficeOverview;
      if (body.level !== "restaurant") {
        throw new Error("Unexpected analytics scope");
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const rangeLabel =
    range === "today"
      ? "Today"
      : range === "30days"
      ? "Last 30 days"
      : "Last 7 days";

  return (
    <DashboardLayout title="Dashboard">
      {/* ?? Section 1: Top overview ?? */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp size={22} className="text-[#ff5a1f]" />
              <h2 className="text-2xl font-bold text-gray-800 truncate">
                {data?.restaurant.name ?? "Restaurant Analytics"}
              </h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Head Office overview · {rangeLabel}
            </p>
            {data && (
              <p className="text-xs text-gray-400 mt-1">
                {data.restaurant.branchCount} branch
                {data.restaurant.branchCount === 1 ? "" : "es"} ·{" "}
                {data.restaurant.userCount} user
                {data.restaurant.userCount === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <select
                className="border border-gray-200 rounded-lg pl-8 pr-3.5 py-2 text-sm text-gray-700 bg-white cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30"
                value={range}
                onChange={(e) => setRange(e.target.value as HeadOfficeRange)}
              >
                <option value="today">Today</option>
                <option value="7days">Last 7 days</option>
                <option value="30days">Last 30 days</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 size={28} className="animate-spin text-[#ff5a1f]" />
        </div>
      ) : error || !data ? (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          {error || "No data"}
        </div>
      ) : (
        <>
          {/* ?? Section 2: Summary cards ?? */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <HeadOfficeKpiCard
              label="Total Sales"
              value={formatPKR(data.kpis.totalSales)}
              icon={<DollarSign size={20} />}
              tone="text-green-600 bg-green-50"
            />
            <HeadOfficeKpiCard
              label="Total Orders"
              value={String(data.kpis.totalOrders)}
              icon={<ShoppingCart size={20} />}
              tone="text-blue-600 bg-blue-50"
            />
            <HeadOfficeKpiCard
              label="Avg Order"
              value={formatPKR(data.kpis.avgOrderValue)}
              icon={<BarChart3 size={20} />}
              tone="text-purple-600 bg-purple-50"
            />
            <HeadOfficeKpiCard
              label="Branches"
              value={String(data.kpis.totalBranches)}
              icon={<Building2 size={20} />}
              tone="text-[#ff5a1f] bg-[#ff5a1f]/10"
            />
          </div>

          {/* ?? Section 3: Highlights ?? */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <HeadOfficeSpotlightCard
              title="Top Branch"
              icon={<Trophy size={18} className="text-amber-500" />}
              name={data.topBranch?.branch_name ?? null}
              subtitle={data.topBranch ? formatPKR(data.topBranch.sales) : "?"}
            />
            <HeadOfficeSpotlightCard
              title="Lowest Branch"
              icon={<TrendingDown size={18} className="text-gray-500" />}
              name={data.lowestBranch?.branch_name ?? null}
              subtitle={
                data.lowestBranch ? formatPKR(data.lowestBranch.sales) : "?"
              }
            />
          </div>

          {/* ?? Section 4: Branch Performance ?? */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <TrendingUp size={20} className="text-[#ff5a1f]" />
              <h3 className="text-base font-semibold text-gray-800">
                Branch Performance
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50">
                    {["Branch", "Code", "Status", "Sales", "Orders", "AOV"].map(
                      (c) => (
                        <th
                          key={c}
                          className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                        >
                          {c}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.branches.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-10 text-center text-gray-400 text-sm"
                      >
                        No branches yet for this restaurant.
                      </td>
                    </tr>
                  ) : (
                    data.branches.map((b) => (
                      <tr
                        key={b.branch_id}
                        className="hover:bg-gray-50/60 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-gray-800">
                          {b.branch_name}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {b.branch_code || "?"}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              b.status === "Active"
                                ? "bg-green-50 text-green-600"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {formatPKR(b.sales)}
                        </td>
                        <td className="px-6 py-4 text-gray-600">{b.orders}</td>
                        <td className="px-6 py-4 text-gray-600">
                          {formatPKR(b.avgOrderValue)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

/**
 * Single ranked "Top Selling Items" card used on both the Branch Admin and
 * Single-Branch dashboards. Variant controls which metric is the headline
 * and which one is shown as the muted secondary line beneath it.
 */
function TopSellingItemsCard({
  variant,
  items,
}: {
  variant: "quantity" | "sales";
  items: TopSellingApiItem[];
}) {
  const title =
    variant === "quantity"
      ? "Top Selling Items by Quantity"
      : "Top Selling Items by Sales";
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <UtensilsCrossed size={18} className="text-[#ff5a1f]" />
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No sales data for this period.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((item, i) => {
            const qty = Math.round(item.quantity);
            const primary =
              variant === "quantity"
                ? `${qty} sold`
                : formatPKR(item.total);
            const secondary =
              variant === "quantity"
                ? formatPKR(item.total)
                : `${qty} sold`;
            return (
              <li
                key={item.dish_id}
                className="flex items-center justify-between py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-[#ff5a1f]/10 flex items-center justify-center text-xs font-bold text-[#ff5a1f] shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {item.category || "—"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-semibold text-gray-700">
                    {primary}
                  </p>
                  <p className="text-xs text-gray-400">{secondary}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function HeadOfficeKpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tone}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wider truncate">
          {label}
        </p>
        <p className="text-xl font-bold text-gray-800 mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}

function HeadOfficeSpotlightCard({
  title,
  icon,
  name,
  subtitle,
}: {
  title: string;
  icon: React.ReactNode;
  name: string | null;
  subtitle: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>
      {name ? (
        <>
          <p className="font-semibold text-gray-800">{name}</p>
          <p className="text-lg font-bold text-[#ff5a1f] mt-0.5">{subtitle}</p>
        </>
      ) : (
        <p className="text-sm text-gray-400">No data</p>
      )}
    </div>
  );
}

/* ??????????????????????????????????????????????????????????????????????
 * Single-Branch Restaurant Admin Dashboard
 *
 * Replaces the legacy "Advanced Analytics" module for single-branch
 * tenants and becomes the single main overview page. Because there is
 * only one branch, the multi-branch artifacts (Top Branch / Lowest
 * Branch / Branch comparison table) are dropped in favour of
 * single-branch-friendly highlights (paid / cancelled / net revenue)
 * and a clean branch status summary.
 *
 * All figures come from /api/analytics/overview and are restaurant-
 * scoped on the server, so no cross-tenant data can leak in.
 * ?????????????????????????????????????????????????????????????????????? */

function SingleBranchDashboard() {
  const [range, setRange] = useState<HeadOfficeRange>("7days");
  const [data, setData] = useState<HeadOfficeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/analytics/overview?range=${range}`);
      if (!res.ok) throw new Error("Failed to load dashboard");
      const body = (await res.json()) as HeadOfficeOverview;
      if (body.level !== "restaurant") {
        throw new Error("Unexpected analytics scope");
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const rangeLabel =
    range === "today"
      ? "Today"
      : range === "30days"
      ? "Last 30 days"
      : "Last 7 days";

  const branch = data?.branches[0] ?? null;
  const kpis = data?.kpis;
  const paidOrders = kpis?.paidOrders ?? 0;
  const cancelledOrders = kpis?.cancelledOrders ?? 0;
  const netRevenue = kpis?.netRevenue ?? 0;
  const cancelRate =
    kpis && kpis.totalOrders > 0
      ? Math.round((cancelledOrders / kpis.totalOrders) * 100)
      : 0;

  return (
    <DashboardLayout title="Dashboard">
      {/* ?? Section 1: Top overview ?? */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp size={22} className="text-[#ff5a1f]" />
              <h2 className="text-2xl font-bold text-gray-800 truncate">
                {data?.restaurant.name ?? "Restaurant Analytics"}
              </h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Restaurant overview · {rangeLabel}
            </p>
            {branch && (
              <p className="text-xs text-gray-400 mt-1">
                {branch.branch_name}
                {branch.status ? ` · ${branch.status}` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <select
                className="border border-gray-200 rounded-lg pl-8 pr-3.5 py-2 text-sm text-gray-700 bg-white cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30"
                value={range}
                onChange={(e) => setRange(e.target.value as HeadOfficeRange)}
              >
                <option value="today">Today</option>
                <option value="7days">Last 7 days</option>
                <option value="30days">Last 30 days</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 size={28} className="animate-spin text-[#ff5a1f]" />
        </div>
      ) : error || !data ? (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          {error || "No data"}
        </div>
      ) : (
        <>
          {/* ?? Section 2: Summary cards ?? */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <HeadOfficeKpiCard
              label="Total Sales"
              value={formatPKR(data.kpis.totalSales)}
              icon={<DollarSign size={20} />}
              tone="text-green-600 bg-green-50"
            />
            <HeadOfficeKpiCard
              label="Total Orders"
              value={String(data.kpis.totalOrders)}
              icon={<ShoppingCart size={20} />}
              tone="text-blue-600 bg-blue-50"
            />
            <HeadOfficeKpiCard
              label="Avg Order"
              value={formatPKR(data.kpis.avgOrderValue)}
              icon={<BarChart3 size={20} />}
              tone="text-purple-600 bg-purple-50"
            />
            <HeadOfficeKpiCard
              label="Net Revenue"
              value={formatPKR(netRevenue)}
              icon={<Landmark size={20} />}
              tone="text-emerald-600 bg-emerald-50"
            />
          </div>

          {/* ?? Section 3: Highlights (single-branch friendly) ?? */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <HeadOfficeKpiCard
              label="Paid Orders"
              value={String(paidOrders)}
              icon={<CheckCircle2 size={20} />}
              tone="text-emerald-600 bg-emerald-50"
            />
            <HeadOfficeKpiCard
              label="Cancelled Orders"
              value={String(cancelledOrders)}
              icon={<AlertTriangle size={20} />}
              tone="text-rose-600 bg-rose-50"
            />
            <HeadOfficeKpiCard
              label="Cancellation Rate"
              value={`${cancelRate}%`}
              icon={<TrendingDown size={20} />}
              tone="text-amber-600 bg-amber-50"
            />
          </div>

          {/* ?? Section 4: Branch summary ?? */}
          <div className="mb-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-[#ff5a1f]" />
                <h3 className="text-sm font-bold text-gray-800">
                  Branch Summary
                </h3>
              </div>
              {branch ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Branch
                    </p>
                    <p className="text-base font-semibold text-gray-800 truncate">
                      {branch.branch_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        branch.status === "Active"
                          ? "bg-green-50 text-green-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {branch.status}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {data.restaurant.userCount} user
                      {data.restaurant.userCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        Sales
                      </p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">
                        {formatPKR(branch.sales)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        Orders
                      </p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">
                        {branch.orders}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        AOV
                      </p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">
                        {formatPKR(branch.avgOrderValue)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        Cancelled
                      </p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">
                        {cancelledOrders}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No branch data.</p>
              )}
            </div>
          </div>

          {/* ?? Section 5: Top Selling Items (Quantity / Sales) ??
           * Two ranked cards side-by-side on lg+ screens, stacked on
           * narrow ones. Both gracefully fall back to the legacy
           * `topSellingItems` field if a stale API version omits the
           * dual lists. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-2">
            <TopSellingItemsCard
              variant="quantity"
              items={
                data.topSellingByQuantity ?? data.topSellingItems ?? []
              }
            />
            <TopSellingItemsCard
              variant="sales"
              items={data.topSellingBySales ?? data.topSellingItems ?? []}
            />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

/**
 * Branch Admin module navigation tiles.
 *
 * These are shortcut cards shown on the Branch Admin Dashboard in place
 * of the older summary KPI strip. Each entry maps 1:1 to a Branch Admin
 * sidebar module so the dashboard acts as a "control center" for the
 * branch. Keep this list in sync with `branchAdminMenu` in
 * `components/layout/Sidebar.tsx`.
 */
const BRANCH_MODULE_CARDS: Array<{
  label: string;
  subtitle: string;
  href: string;
  icon: React.ReactNode;
  tone: string;
}> = [
  {
    label: "Categories",
    subtitle: "Manage categories",
    href: "/categories",
    icon: <Tag size={20} />,
    tone: "text-pink-600 bg-pink-50",
  },
  {
    label: "Menu",
    subtitle: "View menu items",
    href: "/menu",
    icon: <UtensilsCrossed size={20} />,
    tone: "text-green-600 bg-green-50",
  },
  {
    label: "Deals",
    subtitle: "Promotions & combos",
    href: "/deals",
    icon: <BadgePercent size={20} />,
    tone: "text-purple-600 bg-purple-50",
  },
  {
    label: "Kitchen",
    subtitle: "Live kitchen view",
    href: "/kitchen",
    icon: <ChefHat size={20} />,
    tone: "text-orange-600 bg-orange-50",
  },
  {
    label: "Orders",
    subtitle: "Track orders",
    href: "/orders",
    icon: <ClipboardList size={20} />,
    tone: "text-blue-600 bg-blue-50",
  },
  {
    label: "Sales List",
    subtitle: "Transaction history",
    href: "/sales-list",
    icon: <Receipt size={20} />,
    tone: "text-indigo-600 bg-indigo-50",
  },
  {
    label: "Sales Report",
    subtitle: "Sales analytics",
    href: "/sales-report",
    icon: <BarChart3 size={20} />,
    tone: "text-cyan-600 bg-cyan-50",
  },
  {
    label: "Menu Sales",
    subtitle: "Item-wise sales",
    href: "/menu-sales",
    icon: <PieChart size={20} />,
    tone: "text-teal-600 bg-teal-50",
  },
  {
    label: "Expenses",
    subtitle: "Track expenses",
    href: "/expenses",
    icon: <Wallet size={20} />,
    tone: "text-rose-600 bg-rose-50",
  },
  {
    label: "Day End",
    subtitle: "Close the day",
    href: "/dayend",
    icon: <CalendarCheck size={20} />,
    tone: "text-emerald-600 bg-emerald-50",
  },
  {
    label: "Halls",
    subtitle: "Halls & tables",
    href: "/halls",
    icon: <Grid3X3 size={20} />,
    tone: "text-amber-600 bg-amber-50",
  },
  {
    label: "Roles",
    subtitle: "Users & access",
    href: "/roles",
    icon: <ShieldCheck size={20} />,
    tone: "text-slate-600 bg-slate-100",
  },
];

/* ??????????????????????????????????????????????????????????????????????
 * Branch Admin Dashboard (multi-branch restaurant)
 *
 * Replaces the legacy "Advanced Analytics" module for Branch Admins and
 * becomes the single main overview page for their branch. All figures are
 * branch-scoped on the server (see /api/analytics/overview ? BRANCH_ADMIN
 * auth path) so no cross-branch or cross-tenant data can leak in. There
 * are intentionally no Top Branch / Lowest Branch / multi-branch
 * comparison widgets ? this is an operational view of one branch only.
 * ?????????????????????????????????????????????????????????????????????? */

function BranchAdminDashboard() {
  const [range, setRange] = useState<HeadOfficeRange>("7days");
  const [data, setData] = useState<BranchAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // The API auto-scopes BRANCH_ADMIN to their assigned branch server-side,
      // so we intentionally do NOT pass branchId from the client.
      const res = await apiFetch(`/api/analytics/overview?range=${range}`);
      if (!res.ok) throw new Error("Failed to load dashboard");
      const body = (await res.json()) as BranchAdminOverview;
      if (body.level !== "branch") {
        throw new Error("Unexpected analytics scope");
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const rangeLabel =
    range === "today"
      ? "Today"
      : range === "30days"
      ? "Last 30 days"
      : "Last 7 days";

  const restaurantName = data?.branch.restaurant?.name ?? "";
  const branchName = data?.branch.branch_name ?? "";

  return (
    <DashboardLayout title="Dashboard">
      {/* ?? Section 1: Top overview ?? */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUp size={22} className="text-[#ff5a1f]" />
              <h2 className="text-2xl font-bold text-gray-800 truncate">
                {branchName || "Branch Analytics"}
              </h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {restaurantName
                ? `${restaurantName} · Branch overview · ${rangeLabel}`
                : `Branch overview · ${rangeLabel}`}
            </p>
            {data && (
              <p className="text-xs text-gray-400 mt-1">
                {data.branch.branch_code
                  ? `Code ${data.branch.branch_code} · `
                  : ""}
                {data.branch.status || "?"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <select
                className="border border-gray-200 rounded-lg pl-8 pr-3.5 py-2 text-sm text-gray-700 bg-white cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30"
                value={range}
                onChange={(e) => setRange(e.target.value as HeadOfficeRange)}
              >
                <option value="today">Today</option>
                <option value="7days">Last 7 days</option>
                <option value="30days">Last 30 days</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 size={28} className="animate-spin text-[#ff5a1f]" />
        </div>
      ) : error || !data ? (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          {error || "No data"}
        </div>
      ) : (
        <>
          {/* ?? Section 2: Module navigation cards ??
           * Quick-access shortcuts to every branch-scoped module in the
           * Branch Admin sidebar. Each card is a full-size clickable Link
           * so the entire tile routes cleanly, with a hover lift + icon
           * scale for a control-center feel. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            {BRANCH_MODULE_CARDS.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group relative bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5 hover:border-[#ff5a1f]/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:ring-offset-2"
                aria-label={`Open ${m.label}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-lg shrink-0 transition-transform duration-200 group-hover:scale-110 ${m.tone}`}
                  >
                    {m.icon}
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="text-gray-300 group-hover:text-[#ff5a1f] transition-colors"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-[#ff5a1f] transition-colors truncate">
                    {m.label}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {m.subtitle}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {/* ?? Section 2b: Order Status Overview ??
           * Live per-status card grid (Pending / Running / Served / Paid /
           * Cancelled / Credit / Total). Polls silently every 25s, respects
           * the dashboard's date range, and every card deep-links into
           * /orders?status=<status> with the branch scoped server-side. */}
          <BranchOrderStatusOverview range={range} />

          {/* ?? Section 3: Branch summary ?? */}
          <div className="mb-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={18} className="text-[#ff5a1f]" />
                <h3 className="text-sm font-bold text-gray-800">
                  Branch Summary
                </h3>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Branch
                  </p>
                  <p className="text-base font-semibold text-gray-800 truncate">
                    {data.branch.branch_name}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      data.branch.status === "Active"
                        ? "bg-green-50 text-green-600"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {data.branch.status}
                  </span>
                  {data.branch.branch_code && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      Code {data.branch.branch_code}
                    </span>
                  )}
                  {restaurantName && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      <UserRound size={11} />
                      {restaurantName}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Sales
                    </p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">
                      {formatPKR(data.kpis.totalSales)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Orders
                    </p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">
                      {data.kpis.totalOrders}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      AOV
                    </p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">
                      {formatPKR(data.kpis.avgOrderValue)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Expenses
                    </p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">
                      {formatPKR(data.kpis.expenses)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ?? Section 4: Top Selling Items (Quantity / Sales) ??
           * Two ranked cards side-by-side on lg+ screens, stacked on
           * narrow ones. Both fall back to the legacy `topSellingItems`
           * field if a stale API version omits the dual lists, so the
           * branch admin never sees an empty card just because of a
           * deploy-order race. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-2">
            <TopSellingItemsCard
              variant="quantity"
              items={
                data.topSellingByQuantity ?? data.topSellingItems ?? []
              }
            />
            <TopSellingItemsCard
              variant="sales"
              items={data.topSellingBySales ?? data.topSellingItems ?? []}
            />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}


/* ----------------------------------------------------------------------
 * Super Admin (Restenzo Platform Owner) Dashboard
 *
 * The SUPER_ADMIN branch now pulls from /api/platform/overview and
 * renders the polished Platform Control Center. All numbers come from
 * real DB rows and no fake placeholder values anywhere.
 * ---------------------------------------------------------------------- */

function SuperAdminDashboardWrapper() {
  const { data, loading, error, refresh } = usePlatformOverview(true);
  return (
    <PlatformDashboard
      data={data}
      loading={loading}
      error={error}
      onRefresh={refresh}
    />
  );
}