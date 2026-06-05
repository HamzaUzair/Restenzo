"use client";

import React, { useMemo, useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Search,
  RotateCw,
} from "lucide-react";
import PlatformShell from "@/components/platform/PlatformShell";
import StatCard from "@/components/platform/StatCard";
import StatusBadge, {
  type PlatformBadgeTone,
} from "@/components/platform/StatusBadge";
import { usePlatformOverview } from "@/components/platform/usePlatformOverview";
import { apiFetch } from "@/lib/auth-client";
import { formatUSD } from "@/lib/platform";
import type { DerivedSubscription } from "@/lib/platform";

type SubStatusFilter =
  | "all"
  | "Active"
  | "Trial"
  | "Suspended"
  | "Inactive"
  | "Canceled"
  | "Past Due";
type CycleFilter = "all" | "monthly" | "yearly";

function toneFor(status: DerivedSubscription["status"]): PlatformBadgeTone {
  switch (status) {
    case "Active":
      return "active";
    case "Trial":
      return "trial";
    case "Suspended":
      return "suspended";
    case "Canceled":
      return "canceled";
    case "Inactive":
      return "inactive";
    case "Past Due":
      return "warning";
    default:
      return "neutral";
  }
}

function paymentTone(
  status: DerivedSubscription["paymentStatus"]
): PlatformBadgeTone {
  switch (status) {
    case "Paid":
      return "success";
    case "Failed":
      return "danger";
    case "Pending":
      return "warning";
    case "Trial":
      return "trial";
    default:
      return "neutral";
  }
}

export default function SubscriptionsPage() {
  const { data, loading, error, refresh } = usePlatformOverview();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SubStatusFilter>("all");
  const [cycleFilter, setCycleFilter] = useState<CycleFilter>("all");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const syncStripe = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await apiFetch("/api/admin/subscriptions/sync-stripe", {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMessage(body.error || "Stripe sync failed.");
        return;
      }
      setSyncMessage(
        `Synced ${body.updated ?? 0} of ${body.total ?? 0} subscriptions from Stripe.`
      );
      await refresh();
    } catch {
      setSyncMessage("Stripe sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const subs: DerivedSubscription[] = data?.subscriptions ?? [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return subs.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (cycleFilter !== "all" && s.billingCycle !== cycleFilter) return false;
      if (needle) {
        const hay = `${s.restaurantName} ${s.planName} ${s.slug}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [subs, statusFilter, cycleFilter, search]);

  const counts = data?.subscriptionsByStatus;
  const billing = data?.billing;

  return (
    <PlatformShell
      title="Subscriptions"
      subtitle="Monitor every tenant subscription. Stripe billing is wired in — these numbers come straight from your restaurants table."
      headerExtra={
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={syncStripe}
            disabled={syncing || loading}
            title="Pull the latest status & payment state from Stripe for every tenant. Useful in test mode when webhooks are not running."
            className="inline-flex items-center gap-2 rounded-lg bg-[#ff5a1f] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e04e18] disabled:opacity-50"
          >
            <RotateCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Stripe"}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        <StatCard
          label="Active"
          value={(counts?.active ?? 0).toLocaleString()}
          icon={<CheckCircle2 size={18} />}
          tint="text-emerald-700 bg-emerald-100"
          hint={`${billing ? formatUSD(billing.mrr) : "$0"} MRR`}
        />
        <StatCard
          label="On Trial"
          value={(counts?.trial ?? 0).toLocaleString()}
          icon={<Clock3 size={18} />}
          tint="text-sky-700 bg-sky-100"
          hint="14 day window"
        />
        <StatCard
          label="Suspended"
          value={(counts?.suspended ?? 0).toLocaleString()}
          icon={<AlertTriangle size={18} />}
          tint="text-rose-700 bg-rose-100"
        />
        <StatCard
          label="Canceled"
          value={(counts?.canceled ?? 0).toLocaleString()}
          icon={<XCircle size={18} />}
          tint="text-gray-700 bg-gray-100"
        />
        <StatCard
          label="Yearly Plans"
          value={(billing?.yearlyCustomers ?? 0).toLocaleString()}
          icon={<CreditCard size={18} />}
          tint="text-indigo-700 bg-indigo-100"
          hint={`${billing?.monthlyCustomers ?? 0} monthly`}
        />
      </div>

      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by restaurant, plan or slug"
              className="w-full rounded-lg border border-gray-200 bg-white px-9 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ff5a1f] focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pills<SubStatusFilter>
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All status" },
                { value: "Active", label: "Active" },
                { value: "Trial", label: "Trial" },
                { value: "Suspended", label: "Suspended" },
                { value: "Inactive", label: "Inactive" },
                { value: "Canceled", label: "Canceled" },
              ]}
            />
            <Pills<CycleFilter>
              value={cycleFilter}
              onChange={setCycleFilter}
              options={[
                { value: "all", label: "All cycles" },
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {syncMessage && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          {syncMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading && !data ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">
            Loading subscriptions…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">
            No subscriptions match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Restaurant</th>
                  <th className="px-5 py-3 text-left font-semibold">Plan</th>
                  <th className="px-5 py-3 text-left font-semibold">Cycle</th>
                  <th className="px-5 py-3 text-left font-semibold">Status</th>
                  <th className="px-5 py-3 text-left font-semibold">Payment</th>
                  <th className="px-5 py-3 text-left font-semibold">Start</th>
                  <th className="px-5 py-3 text-left font-semibold">Renewal</th>
                  <th className="px-5 py-3 text-right font-semibold">MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => (
                  <tr key={s.restaurantId} className="hover:bg-gray-50/60">
                    <td className="px-5 py-4 font-medium text-gray-900">
                      {s.restaurantName}
                      <p className="text-[11px] text-gray-400">{s.slug}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-700">{s.planName}</td>
                    <td className="px-5 py-4 text-gray-700 capitalize">
                      {s.billingCycle}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge label={s.status} tone={toneFor(s.status)} />
                      {s.status === "Trial" && s.trialEndsAt && (
                        <p className="mt-1 text-[11px] text-gray-500">
                          Ends {new Date(s.trialEndsAt).toLocaleDateString()}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        label={s.paymentStatus}
                        tone={paymentTone(s.paymentStatus)}
                      />
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      {new Date(s.startDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      {new Date(s.renewalDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-900">
                      {formatUSD(s.monthlyPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PlatformShell>
  );
}

function Pills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-white p-1 text-xs">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
            value === opt.value
              ? "bg-[#ff5a1f] text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
