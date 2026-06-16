"use client";

import React from "react";
import Link from "next/link";
import {
  Store,
  CheckCircle2,
  Building2,
  GitBranch,
  ShieldCheck,
  AlertTriangle,
  DollarSign,
  Clock3,
  ArrowRight,
  PauseCircle,
  Timer,
  Wallet,
  CreditCard,
  Loader2,
  RefreshCw,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatCard from "@/components/platform/StatCard";
import StatusBadge, {
  type PlatformBadgeTone,
} from "@/components/platform/StatusBadge";
import { formatUSD } from "@/lib/platform";
import type {
  PlatformOverviewPayload,
  PlatformTenantRow,
} from "@/types/platform";

interface PlatformDashboardProps {
  data: PlatformOverviewPayload | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

function subscriptionTone(
  status: PlatformTenantRow["subscription"]["status"]
): PlatformBadgeTone {
  switch (status) {
    case "Active":
      return "active";
    case "Trial":
      return "trial";
    case "Suspended":
      return "suspended";
    case "Inactive":
      return "inactive";
    case "Canceled":
      return "canceled";
    case "Past Due":
      return "warning";
    default:
      return "neutral";
  }
}

function restaurantStatusTone(status: string): PlatformBadgeTone {
  if (status === "Active") return "active";
  if (status === "Suspended") return "suspended";
  return "inactive";
}

const PlatformDashboard: React.FC<PlatformDashboardProps> = ({
  data,
  loading,
  error,
  onRefresh,
}) => {
  if (loading && !data) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="py-24 flex justify-center">
          <Loader2 size={32} className="animate-spin text-[#ff5a1f]" />
        </div>
      </DashboardLayout>
    );
  }

  if (error && !data) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="max-w-md mx-auto mt-16 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-rose-600" />
          <p className="text-sm font-semibold text-rose-700">
            Could not load Platform Control Center
          </p>
          <p className="mt-1 text-xs text-rose-600">{error}</p>
          <button
            onClick={onRefresh}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  const overview = data.platformOverview;
  const billing = data.billing;
  const subStatus = data.subscriptionsByStatus;

  /* ── Top summary cards ── */
  const topCards = [
    {
      label: "Total Restaurants",
      value: overview.totalRestaurants,
      icon: <Store size={18} />,
      tint: "text-slate-700 bg-slate-100",
      href: "/restaurants",
      hint: `${overview.singleBranchRestaurants} single · ${overview.multiBranchRestaurants} multi`,
    },
    {
      label: "Active Restaurants",
      value: overview.activeRestaurants,
      icon: <CheckCircle2 size={18} />,
      tint: "text-emerald-700 bg-emerald-100",
      href: "/restaurants?status=Active",
      hint: overview.totalRestaurants
        ? `${Math.round(
            (overview.activeRestaurants / overview.totalRestaurants) * 100
          )}% of tenants`
        : "",
    },
    {
      label: "Inactive / Suspended",
      value: overview.inactiveRestaurants + overview.suspendedRestaurants,
      icon: <PauseCircle size={18} />,
      tint: "text-rose-700 bg-rose-100",
      href: "/restaurants?status=Suspended",
      hint: `${overview.suspendedRestaurants} suspended · ${overview.inactiveRestaurants} inactive`,
    },
    {
      label: "Total Branches",
      value: overview.totalBranches,
      icon: <Building2 size={18} />,
      tint: "text-[#ff5a1f] bg-[#ff5a1f]/10",
      hint: "Across all tenants",
    },
    {
      label: "Active Subscriptions",
      value: subStatus.active,
      icon: <CreditCard size={18} />,
      tint: "text-indigo-700 bg-indigo-100",
      href: "/subscriptions",
      hint: "Paying customers",
    },
    {
      label: "On Trial",
      value: subStatus.trial,
      icon: <Timer size={18} />,
      tint: "text-sky-700 bg-sky-100",
      href: `/subscriptions?status=Trial`,
      hint: `${overview.trialDays} day free trial`,
    },
    {
      label: "Monthly Recurring Revenue",
      value: formatUSD(billing.mrr),
      icon: <DollarSign size={18} />,
      tint: "text-emerald-700 bg-emerald-100",
      href: "/billing",
      hint: `${formatUSD(billing.arr)} ARR`,
    },
  ];

  /* ── Mid cards: breakdowns ── */
  const tenantTypeMax = Math.max(
    overview.singleBranchRestaurants,
    overview.multiBranchRestaurants,
    1
  );
  const statusMax = Math.max(
    overview.activeRestaurants,
    overview.inactiveRestaurants,
    overview.suspendedRestaurants,
    1
  );

  /* ── Tables ── */
  const tenantsNeedingAttention = data.tenants
    .filter(
      (t) =>
        t.status !== "Active" ||
        t.subscription.status === "Suspended" ||
        t.subscription.status === "Past Due"
    )
    .slice(0, 6);

  const recentRestaurants = [...data.tenants]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 6);

  return (
    <DashboardLayout title="Dashboard">
      {/* Hero / title card */}
      <div className="mb-6 relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#1f2a3d] dark:!bg-[#0b1220]">
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#ff5a1f]/8 via-white to-indigo-50 dark:from-[#ff5a1f]/12 dark:via-[#0b1220] dark:to-[#111827]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full bg-[#ff5a1f]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#ff5a1f]">
              Platform Control Center
            </div>
            <h2 className="mt-3 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-slate-100">
              Restenzo Admin
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-slate-300">
              Live SaaS visibility across every restaurant, subscription,
              billing status and customer activity on the platform.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/restaurants"
              className="inline-flex items-center gap-2 rounded-lg bg-[#ff5a1f] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e04e18]"
            >
              <Store size={16} /> Manage tenants
            </Link>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50 dark:border-[#2a3a55] dark:!bg-[#111b2c] dark:text-slate-300 dark:hover:!bg-[#162238]"
              aria-label="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {topCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={
              typeof card.value === "number"
                ? card.value.toLocaleString()
                : card.value
            }
            icon={card.icon}
            tint={card.tint}
            hint={card.hint}
            href={card.href}
          />
        ))}
      </div>

      {/* Mid: breakdowns + setup alerts */}
      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Tenant type */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-[#1f2a3d] dark:!bg-[#0b1220]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
              Tenants by type
            </h3>
            <GitBranch size={16} className="text-gray-400 dark:text-slate-500" />
          </div>
          <div className="space-y-4">
            <BarRow
              label="Single Branch"
              value={overview.singleBranchRestaurants}
              max={tenantTypeMax}
              tone="bg-blue-500"
            />
            <BarRow
              label="Multi Branch"
              value={overview.multiBranchRestaurants}
              max={tenantTypeMax}
              tone="bg-violet-500"
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <MiniStat
              label="Restaurant Admins"
              value={overview.restaurantAdmins}
              icon={<ShieldCheck size={12} />}
            />
            <MiniStat
              label="Branch Admins"
              value={overview.branchAdmins}
              icon={<ShieldCheck size={12} />}
            />
          </div>
        </div>

        {/* Status breakdown */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-[#1f2a3d] dark:!bg-[#0b1220]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
              Tenants by status
            </h3>
            <AlertTriangle size={16} className="text-gray-400 dark:text-slate-500" />
          </div>
          <div className="space-y-4">
            <BarRow
              label="Active"
              value={overview.activeRestaurants}
              max={statusMax}
              tone="bg-emerald-500"
            />
            <BarRow
              label="Inactive"
              value={overview.inactiveRestaurants}
              max={statusMax}
              tone="bg-gray-400"
            />
            <BarRow
              label="Suspended"
              value={overview.suspendedRestaurants}
              max={statusMax}
              tone="bg-rose-500"
            />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
            <MiniStat label="Trial" value={subStatus.trial} icon={<Timer size={12} />} />
            <MiniStat
              label="Monthly"
              value={billing.monthlyCustomers}
              icon={<Clock3 size={12} />}
            />
            <MiniStat
              label="Yearly"
              value={billing.yearlyCustomers}
              icon={<Clock3 size={12} />}
            />
          </div>
        </div>

        {/* Billing overview */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-[#1f2a3d] dark:!bg-[#0b1220]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
              Billing overview
            </h3>
            <Wallet size={16} className="text-gray-400 dark:text-slate-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-slate-100">
            {formatUSD(billing.mrr)}
            <span className="ml-1 text-sm font-medium text-gray-400 dark:text-slate-500">
              / mo
            </span>
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            {billing.activePayingCustomers} active paying customers ·{" "}
            {formatUSD(billing.arr)} ARR
          </p>
          <div className="mt-4 space-y-3">
            {billing.byPlan.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:!bg-[#111b2c] dark:text-slate-400">
                No paying customers yet. Revenue will appear once trials convert.
              </p>
            ) : (
              billing.byPlan.map((p) => (
                <div
                  key={p.planId}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-[#2a3a55] dark:!bg-[#111b2c]"
                >
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">
                      {p.planName}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">
                      {p.customers} customer{p.customers === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                    {formatUSD(p.mrr)}
                    <span className="text-[11px] font-normal text-gray-400 dark:text-slate-500">
                      /mo
                    </span>
                  </p>
                </div>
              ))
            )}
          </div>
          <Link
            href="/billing"
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#ff5a1f] hover:underline"
          >
            Open billing <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* Growth chart */}
      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-[#1f2a3d] dark:!bg-[#0b1220]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
              Restaurants created · last 6 months
            </h3>
            <Store size={16} className="text-gray-400 dark:text-slate-500" />
          </div>
          <BarSeries
            points={data.charts.restaurantsCreated}
            tone="bg-[#ff5a1f]"
          />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-[#1f2a3d] dark:!bg-[#0b1220]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
              Branches created · last 6 months
            </h3>
            <Building2 size={16} className="text-gray-400 dark:text-slate-500" />
          </div>
          <BarSeries
            points={data.charts.branchesCreated}
            tone="bg-violet-500"
          />
        </div>
      </div>

      {/* Tables: attention + recent signups */}
      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#1f2a3d] dark:!bg-[#0b1220]">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                Restaurants needing attention
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Inactive, suspended, or billing-related issues.
              </p>
            </div>
            <Link
              href="/support"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#ff5a1f] hover:underline"
            >
              Open support <ArrowRight size={12} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">
                    Restaurant
                  </th>
                  <th className="px-5 py-3 text-left font-semibold">Type</th>
                  <th className="px-5 py-3 text-left font-semibold">Status</th>
                  <th className="px-5 py-3 text-left font-semibold">
                    Subscription
                  </th>
                  <th className="px-5 py-3 text-left font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {tenantsNeedingAttention.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center text-sm text-emerald-600"
                    >
                      All restaurants are currently healthy.
                    </td>
                  </tr>
                ) : (
                  tenantsNeedingAttention.map((t) => (
                    <tr
                      key={t.restaurantId}
                      className="border-t border-gray-100 hover:bg-gray-50/70"
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {t.name}
                        <p className="text-[11px] text-gray-400">
                          {t.branchCount} branch
                          {t.branchCount === 1 ? "" : "es"}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{t.type}</td>
                      <td className="px-5 py-3">
                        <StatusBadge
                          label={t.status}
                          tone={restaurantStatusTone(t.status)}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge
                          label={t.subscription.status}
                          tone={subscriptionTone(t.subscription.status)}
                        />
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {t.subscription.status === "Past Due"
                          ? "Payment past due"
                          : t.subscription.status === "Suspended"
                            ? "Subscription suspended"
                            : t.status !== "Active"
                              ? `Tenant is ${t.status.toLowerCase()}`
                              : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent signups */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#1f2a3d] dark:!bg-[#0b1220]">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-800">
              Recent signups
            </h3>
            <Clock3 size={14} className="text-gray-400" />
          </div>
          <ul className="divide-y divide-gray-100">
            {data.recentSignups.length === 0 ? (
              <li className="px-5 py-8 text-center text-xs text-gray-400">
                No signups in the last 30 days.
              </li>
            ) : (
              data.recentSignups.map((s) => (
                <li key={s.restaurantId} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {s.name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {s.type} · {s.planName}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge
                        label={s.status}
                        tone={subscriptionTone(s.status)}
                      />
                      <p className="mt-1 text-[10px] text-gray-400">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Latest created restaurants */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#1f2a3d] dark:!bg-[#0b1220]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-800">
            Latest created restaurants
          </h3>
          <Link
            href="/restaurants"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#ff5a1f] hover:underline"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">
                  Restaurant
                </th>
                <th className="px-5 py-3 text-left font-semibold">Plan</th>
                <th className="px-5 py-3 text-left font-semibold">Owner</th>
                <th className="px-5 py-3 text-left font-semibold">Branches</th>
                <th className="px-5 py-3 text-left font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentRestaurants.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-sm text-gray-400"
                  >
                    No restaurants yet.
                  </td>
                </tr>
              ) : (
                recentRestaurants.map((t) => (
                  <tr
                    key={t.restaurantId}
                    className="border-t border-gray-100 hover:bg-gray-50/70"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{t.name}</p>
                      <p className="text-[11px] text-gray-400">{t.slug}</p>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        label={t.subscription.planName}
                        tone={t.type === "Multi Branch" ? "info" : "neutral"}
                      />
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {t.owner?.fullName || (
                        <span className="text-xs text-amber-600">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{t.branchCount}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

function BarRow({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-gray-600 dark:text-slate-300">{label}</span>
        <span className="font-semibold text-gray-800 dark:text-slate-100">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:!bg-[#1a263a]">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-[#2a3a55] dark:!bg-[#111b2c]">
      <div className="flex items-center gap-1 text-gray-500 dark:text-slate-400">
        {icon}
        <span className="truncate text-[10px] uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="mt-1 text-base font-semibold text-gray-900 dark:text-slate-100">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function BarSeries({
  points,
  tone,
}: {
  points: { label: string; count: number }[];
  tone: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="space-y-3">
      {points.map((p) => {
        const width = `${Math.max(6, Math.round((p.count / max) * 100))}%`;
        return (
          <div
            key={p.label}
            className="grid grid-cols-[64px_1fr_32px] items-center gap-3"
          >
            <span className="text-xs text-gray-500">{p.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:!bg-[#1a263a]">
              <div
                className={`h-full rounded-full ${tone}`}
                style={{ width }}
              />
            </div>
            <span className="text-right text-xs font-medium text-gray-700 dark:text-slate-200">
              {p.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default PlatformDashboard;
