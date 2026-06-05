"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  LifeBuoy,
  PlayCircle,
  PauseCircle,
  Ban,
  RefreshCw,
  Search,
  AlertTriangle,
  Store,
  Building2,
} from "lucide-react";
import PlatformShell from "@/components/platform/PlatformShell";
import StatCard from "@/components/platform/StatCard";
import StatusBadge, {
  type PlatformBadgeTone,
} from "@/components/platform/StatusBadge";
import { usePlatformOverview } from "@/components/platform/usePlatformOverview";
import { apiFetch } from "@/lib/auth-client";
import type { ApiError } from "@/types/branch";
import type { PlatformTenantRow } from "@/types/platform";

function statusTone(status: string): PlatformBadgeTone {
  if (status === "Active") return "active";
  if (status === "Suspended") return "suspended";
  return "inactive";
}

export default function SupportPage() {
  const { data, loading, refresh } = usePlatformOverview();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("restaurantId");
    if (id) setHighlightId(Number(id));
  }, []);

  const tenants = useMemo(() => data?.tenants ?? [], [data]);

  const attention = useMemo(() => {
    return tenants.filter(
      (t) =>
        t.status !== "Active" ||
        t.subscription.status === "Past Due" ||
        t.subscription.status === "Trial"
    );
  }, [tenants]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return attention;
    return attention.filter((t) =>
      `${t.name} ${t.slug} ${t.owner?.fullName ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [attention, search]);

  const inactive = tenants.filter((t) => t.status === "Inactive").length;
  const suspended = tenants.filter((t) => t.status === "Suspended").length;
  const expiring = tenants.filter(
    (t) => t.subscription.status === "Trial"
  ).length;

  const changeStatus = async (
    restaurantId: number,
    next: "Active" | "Inactive" | "Suspended"
  ) => {
    setBusyId(restaurantId);
    try {
      const res = await apiFetch(
        `/api/restaurants/${restaurantId}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        }
      );
      if (!res.ok) {
        const body: ApiError = await res.json().catch(() => ({}));
        alert(body.error || "Failed to update status");
        return;
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PlatformShell
      title="Support & Controls"
      subtitle="Operational console for the platform team — quickly reactivate, suspend or investigate any tenant that needs attention."
      headerExtra={
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Need Attention"
          value={attention.length.toLocaleString()}
          icon={<LifeBuoy size={18} />}
          tint="text-[#ff5a1f] bg-[#ff5a1f]/10"
          hint="Across all tenants"
        />
        <StatCard
          label="Inactive"
          value={inactive.toLocaleString()}
          icon={<PauseCircle size={18} />}
          tint="text-slate-700 bg-slate-100"
        />
        <StatCard
          label="Suspended"
          value={suspended.toLocaleString()}
          icon={<Ban size={18} />}
          tint="text-rose-700 bg-rose-100"
        />
        <StatCard
          label="Trials Expiring"
          value={expiring.toLocaleString()}
          icon={<AlertTriangle size={18} />}
          tint="text-amber-700 bg-amber-100"
          hint="Trial accounts"
        />
      </div>

      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="relative w-full md:max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tenants needing support"
            className="w-full rounded-lg border border-gray-200 bg-white px-9 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ff5a1f] focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {loading && !data ? (
          <p className="col-span-full px-6 py-10 text-center text-sm text-gray-400">
            Loading…
          </p>
        ) : filtered.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center text-sm text-emerald-700">
            Nothing to do. No tenants currently need support attention.
          </p>
        ) : (
          filtered.map((t) => (
            <SupportCard
              key={t.restaurantId}
              tenant={t}
              busy={busyId === t.restaurantId}
              highlight={highlightId === t.restaurantId}
              onActivate={() => changeStatus(t.restaurantId, "Active")}
              onDeactivate={() => changeStatus(t.restaurantId, "Inactive")}
              onSuspend={() => changeStatus(t.restaurantId, "Suspended")}
            />
          ))
        )}
      </div>
    </PlatformShell>
  );
}

function SupportCard({
  tenant,
  busy,
  highlight,
  onActivate,
  onDeactivate,
  onSuspend,
}: {
  tenant: PlatformTenantRow;
  busy: boolean;
  highlight: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onSuspend: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
        highlight
          ? "border-[#ff5a1f] ring-2 ring-[#ff5a1f]/30"
          : "border-gray-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Store size={14} className="text-gray-400" />
            <span className="truncate">{tenant.name}</span>
          </div>
          <p className="text-xs text-gray-400">{tenant.slug}</p>
        </div>
        <StatusBadge
          label={tenant.status}
          tone={statusTone(tenant.status)}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-xs">
        <div>
          <dt className="font-semibold uppercase tracking-wider text-gray-500">
            Plan
          </dt>
          <dd className="mt-0.5 text-gray-800">{tenant.subscription.planName}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wider text-gray-500">
            Subscription
          </dt>
          <dd className="mt-0.5">
            <StatusBadge
              label={tenant.subscription.status}
              tone={
                tenant.subscription.status === "Active"
                  ? "active"
                  : tenant.subscription.status === "Trial"
                  ? "trial"
                  : tenant.subscription.status === "Suspended"
                  ? "suspended"
                  : tenant.subscription.status === "Canceled"
                  ? "canceled"
                  : "inactive"
              }
            />
          </dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wider text-gray-500">
            Type
          </dt>
          <dd className="mt-0.5 flex items-center gap-1 text-gray-800">
            <Building2 size={12} className="text-gray-400" />
            {tenant.type}
          </dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wider text-gray-500">
            Branches
          </dt>
          <dd className="mt-0.5 text-gray-800">{tenant.branchCount}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {tenant.status !== "Active" && (
          <button
            onClick={onActivate}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            <PlayCircle size={13} /> Activate
          </button>
        )}
        {tenant.status === "Active" && (
          <button
            onClick={onDeactivate}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <PauseCircle size={13} /> Deactivate
          </button>
        )}
        {tenant.status !== "Suspended" && (
          <button
            onClick={onSuspend}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <Ban size={13} /> Suspend
          </button>
        )}
      </div>
    </div>
  );
}
