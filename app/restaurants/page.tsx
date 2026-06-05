"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  Search,
  Loader2,
  RefreshCw,
  Building2,
  CheckCircle2,
  CircleSlash,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import RestaurantModal, {
  type RestaurantEditAdmin,
} from "@/components/restaurants/RestaurantModal";
import StatusBadge, {
  type PlatformBadgeTone,
} from "@/components/platform/StatusBadge";
import StatCard from "@/components/platform/StatCard";
import TenantActionsMenu, {
  type TenantAction,
} from "@/components/platform/TenantActionsMenu";
import type { ApiError } from "@/types/branch";
import type {
  Restaurant,
  RestaurantDetail,
  RestaurantFormData,
} from "@/types/restaurant";
import type { PlatformTenantRow } from "@/types/platform";
import { apiFetch, getAuthSession } from "@/lib/auth-client";
import { usePlatformOverview } from "@/components/platform/usePlatformOverview";
import { formatUSD } from "@/lib/platform";

type StatusFilter = "all" | "Active" | "Inactive" | "Suspended";
type TypeFilter = "all" | "single" | "multi";

function statusTone(status: string): PlatformBadgeTone {
  if (status === "Active") return "active";
  if (status === "Suspended") return "suspended";
  return "inactive";
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

export default function RestaurantsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const { data, loading, error, refresh } = usePlatformOverview(authorized);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Restaurant | null>(null);
  const [editingAdmin, setEditingAdmin] =
    useState<RestaurantEditAdmin | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [busyRestaurantId, setBusyRestaurantId] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<TenantAction | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  useEffect(() => {
    const session = getAuthSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.role !== "SUPER_ADMIN") {
      router.replace("/dashboard");
      return;
    }
    setAuthorized(true);
  }, [router]);

  // Honor the ?status= query filter so deep links from the dashboard
  // land on a pre-filtered list.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s === "Active" || s === "Inactive" || s === "Suspended") {
      setStatusFilter(s);
    }
  }, []);

  const tenants: PlatformTenantRow[] = useMemo(() => data?.tenants ?? [], [data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (typeFilter === "single" && t.hasMultipleBranches) return false;
      if (typeFilter === "multi" && !t.hasMultipleBranches) return false;
      if (needle) {
        const hay = `${t.name} ${t.slug} ${t.owner?.fullName ?? ""} ${t.owner?.username ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [tenants, search, statusFilter, typeFilter]);

  const overview = data?.platformOverview;

  const openEditById = useCallback(async (restaurantId: number) => {
    setLoadingEdit(true);
    try {
      const res = await apiFetch(`/api/restaurants/${restaurantId}`);
      if (!res.ok) return;
      const detail: RestaurantDetail = await res.json();
      setEditing({
        restaurant_id: detail.restaurant_id,
        name: detail.name,
        slug: detail.slug,
        phone: detail.phone,
        address: detail.address,
        status: detail.status,
        has_multiple_branches: detail.has_multiple_branches,
        branch_count: detail.branch_count,
        admin_count: detail.admin_count,
        created_at: detail.created_at,
        updated_at: detail.updated_at,
      });
      setEditingAdmin(detail.primary_admin ?? null);
      setModalOpen(true);
    } finally {
      setLoadingEdit(false);
    }
  }, []);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setEditingAdmin(null);
  };

  const handleSubmit = async (formData: RestaurantFormData) => {
    if (!editing) return;
    const res = await apiFetch(`/api/restaurants/${editing.restaurant_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const body: ApiError = await res.json();
      throw new Error(body.error || "Failed to update restaurant");
    }
    closeModal();
    await refresh();
  };

  const changeStatus = async (
    restaurantId: number,
    nextStatus: "Active" | "Inactive" | "Suspended",
    action: TenantAction
  ) => {
    setBusyRestaurantId(restaurantId);
    setBusyAction(action);
    try {
      const res = await apiFetch(`/api/restaurants/${restaurantId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const body: ApiError = await res.json().catch(() => ({}));
        alert(body.error || "Failed to update status");
        return;
      }
      await refresh();
    } finally {
      setBusyRestaurantId(null);
      setBusyAction(null);
    }
  };

  const deleteRestaurant = async (restaurantId: number, name: string) => {
    const confirmed = window.confirm(
      `Delete restaurant "${name}"? All its branches and users will also be removed. This cannot be undone.`
    );
    if (!confirmed) return;
    setBusyRestaurantId(restaurantId);
    setBusyAction("delete");
    try {
      const res = await apiFetch(`/api/restaurants/${restaurantId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body: ApiError = await res.json().catch(() => ({}));
        alert(body.error || "Failed to delete restaurant");
        return;
      }
      await refresh();
    } finally {
      setBusyRestaurantId(null);
      setBusyAction(null);
    }
  };

  const handleAction = async (tenant: PlatformTenantRow, action: TenantAction) => {
    switch (action) {
      case "view":
      case "edit":
        await openEditById(tenant.restaurantId);
        break;
      case "activate":
        await changeStatus(tenant.restaurantId, "Active", "activate");
        break;
      case "deactivate":
        await changeStatus(tenant.restaurantId, "Inactive", "deactivate");
        break;
      case "suspend":
        if (
          window.confirm(
            `Suspend "${tenant.name}"? All operational modules will freeze until reactivated.`
          )
        ) {
          await changeStatus(tenant.restaurantId, "Suspended", "suspend");
        }
        break;
      case "delete":
        await deleteRestaurant(tenant.restaurantId, tenant.name);
        break;
      case "support":
        router.push(`/support?restaurantId=${tenant.restaurantId}`);
        break;
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#ff5a1f]" />
      </div>
    );
  }

  return (
    <DashboardLayout title="Restaurants">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Tenant management
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage tenants, owners, and subscription status across the Restenzo
            platform.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:self-center"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Tenants"
          value={(overview?.totalRestaurants ?? 0).toLocaleString()}
          icon={<Store size={18} />}
          tint="text-slate-700 bg-slate-100"
          hint={`${overview?.totalBranches ?? 0} branches`}
        />
        <StatCard
          label="Active"
          value={(overview?.activeRestaurants ?? 0).toLocaleString()}
          icon={<CheckCircle2 size={18} />}
          tint="text-emerald-700 bg-emerald-100"
        />
        <StatCard
          label="Suspended"
          value={(overview?.suspendedRestaurants ?? 0).toLocaleString()}
          icon={<CircleSlash size={18} />}
          tint="text-rose-700 bg-rose-100"
          hint={`${overview?.inactiveRestaurants ?? 0} inactive`}
        />
        <StatCard
          label="Branches"
          value={(overview?.totalBranches ?? 0).toLocaleString()}
          icon={<Building2 size={18} />}
          tint="text-slate-700 bg-slate-100"
          hint="Across all tenants"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search restaurants, owners or slugs"
              className="w-full rounded-lg border border-gray-200 bg-white px-9 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ff5a1f] focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterGroup
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { value: "all", label: "All status" },
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
                { value: "Suspended", label: "Suspended" },
              ]}
            />
            <FilterGroup
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as TypeFilter)}
              options={[
                { value: "all", label: "All types" },
                { value: "single", label: "Single" },
                { value: "multi", label: "Multi" },
              ]}
            />
          </div>
        </div>
      </div>

      {error && !loading && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button
            onClick={refresh}
            className="ml-auto text-xs font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading && !data ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16">
            <Loader2 size={28} className="animate-spin text-[#ff5a1f]" />
            <p className="text-sm text-gray-400">Loading tenants…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Store size={28} className="text-gray-400" />
            </div>
            <p className="max-w-xs text-sm text-gray-500">
              {tenants.length === 0
                ? "No tenants yet. New restaurants are created through the commercial onboarding flow."
                : "No tenants match the current filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Restaurant</th>
                  <th className="px-5 py-3 text-left font-semibold">Owner</th>
                  <th className="px-5 py-3 text-left font-semibold">Type</th>
                  <th className="px-5 py-3 text-left font-semibold">Status</th>
                  <th className="px-5 py-3 text-left font-semibold">Plan</th>
                  <th className="px-5 py-3 text-left font-semibold">Billing</th>
                  <th className="px-5 py-3 text-left font-semibold">Branches</th>
                  <th className="px-5 py-3 text-left font-semibold">Created</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((t) => (
                  <tr
                    key={t.restaurantId}
                    className="hover:bg-gray-50/70"
                  >
                    <td className="px-5 py-4 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-gray-400" />
                        {t.name}
                      </div>
                      <p className="text-[11px] text-gray-400">{t.slug}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      {t.owner ? (
                        <>
                          <p className="font-medium">{t.owner.fullName}</p>
                          <p className="text-[11px] text-gray-400">{t.owner.username}</p>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        label={t.type}
                        tone={t.hasMultipleBranches ? "info" : "neutral"}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge label={t.status} tone={statusTone(t.status)} />
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-800">
                        {t.subscription.planName}
                      </p>
                      <p className="text-[11px] text-gray-400 capitalize">
                        {t.subscription.billingCycle}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        label={t.subscription.status}
                        tone={subscriptionTone(t.subscription.status)}
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        {t.subscription.status === "Trial"
                          ? `Trial ends ${new Date(
                              t.subscription.trialEndsAt ?? t.subscription.renewalDate
                            ).toLocaleDateString()}`
                          : `${formatUSD(t.subscription.monthlyPrice)}/mo`}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-gray-700">{t.branchCount}</td>
                    <td className="px-5 py-4 text-xs text-gray-500">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <TenantActionsMenu
                        currentStatus={t.status}
                        busy={
                          busyRestaurantId === t.restaurantId
                            ? busyAction
                            : null
                        }
                        onAction={(action) => handleAction(t, action)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RestaurantModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSubmit={handleSubmit}
        editRestaurant={editing}
        editAdmin={editingAdmin}
        editBranchCount={editing?.branch_count ?? 0}
      />
      {loadingEdit && modalOpen && editing && !editingAdmin && (
        <div className="fixed bottom-4 right-4 z-[120] rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs text-gray-500 shadow-lg">
          Loading admin details…
        </div>
      )}
    </DashboardLayout>
  );
}

function FilterGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-xs">
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
