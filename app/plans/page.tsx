"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Package,
  Users,
  Check,
  BadgeCheck,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react";
import PlatformShell from "@/components/platform/PlatformShell";
import StatCard from "@/components/platform/StatCard";
import StatusBadge from "@/components/platform/StatusBadge";
import EditPlanModal from "@/components/platform/EditPlanModal";
import { usePlatformOverview } from "@/components/platform/usePlatformOverview";
import { YEARLY_DISCOUNT_PERCENT } from "@/lib/pricing";
import { formatUSD } from "@/lib/platform";
import { apiFetch } from "@/lib/auth-client";
import type { AdminPlan } from "@/types/plan";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

export default function PlansPage() {
  const { data, loading: overviewLoading, refresh } = usePlatformOverview();
  const billing = data?.billing;

  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      const id = Date.now();
      setToasts((p) => [...p, { id, message, type }]);
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
    },
    []
  );

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError("");
    try {
      const res = await apiFetch("/api/platform/plans");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to load plans");
      }
      const body = (await res.json()) as { plans: AdminPlan[] };
      setPlans(body.plans);
    } catch (e) {
      setPlansError(e instanceof Error ? e.message : "Failed to load plans");
    } finally {
      setPlansLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const refreshAll = useCallback(() => {
    loadPlans();
    refresh();
  }, [loadPlans, refresh]);

  const planMetrics = (plan: AdminPlan) => {
    const entry = billing?.byPlan.find((p) => p.planId === plan.slug);
    return { customers: entry?.customers ?? 0, mrr: entry?.mrr ?? 0 };
  };

  const handleSaved = (updated: AdminPlan, warning: string | null) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
    pushToast(`${updated.name} plan updated.`, "success");
    if (warning) pushToast(warning, "error");
    // Recompute MRR / customers off the new prices.
    refresh();
  };

  const totalSubs = data?.subscriptions.length ?? 0;
  const loading = plansLoading || overviewLoading;

  return (
    <PlatformShell
      title="Plans"
      subtitle="All SaaS plans the Restenzo platform offers, with live tenant and revenue counts derived from your database. Edit pricing, features and branch limits here — changes flow to the marketing site automatically."
      headerExtra={
        <button
          onClick={refreshAll}
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
          label="Total Plans"
          value={plans.length.toString()}
          icon={<Package size={18} />}
          tint="text-indigo-700 bg-indigo-100"
        />
        <StatCard
          label="Active Plans"
          value={plans.filter((p) => p.isActive && !p.isCustom).length.toString()}
          icon={<BadgeCheck size={18} />}
          tint="text-emerald-700 bg-emerald-100"
          hint="Paid + active"
        />
        <StatCard
          label="Paying Tenants"
          value={(billing?.activePayingCustomers ?? 0).toLocaleString()}
          icon={<Users size={18} />}
          tint="text-[#ff5a1f] bg-[#ff5a1f]/10"
          hint={`${totalSubs} total`}
        />
        <StatCard
          label="Yearly Discount"
          value={`${YEARLY_DISCOUNT_PERCENT}%`}
          icon={<TrendingUp size={18} />}
          tint="text-amber-700 bg-amber-100"
          hint="Applied to yearly"
        />
      </div>

      {plansError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {plansError}
          <button
            onClick={loadPlans}
            className="ml-auto text-xs font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {plansLoading ? (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw size={22} className="animate-spin text-[#ff5a1f]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const metrics = planMetrics(plan);
            return (
              <div
                key={plan.id}
                className={`relative overflow-hidden rounded-2xl border bg-white p-6 shadow-sm ${
                  plan.isPopular
                    ? "border-[#ff5a1f] ring-1 ring-[#ff5a1f]/30"
                    : "border-gray-100"
                }`}
              >
                {plan.isPopular && (
                  <span className="absolute right-4 top-4 rounded-full bg-[#ff5a1f]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ff5a1f]">
                    Most popular
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {plan.name}
                  </h3>
                  <StatusBadge
                    label={
                      !plan.isActive
                        ? "Inactive"
                        : plan.isCustom
                          ? "Custom"
                          : "Active"
                    }
                    tone={
                      !plan.isActive
                        ? "inactive"
                        : plan.isCustom
                          ? "info"
                          : "active"
                    }
                  />
                </div>
                <p className="mt-1 text-sm text-gray-500">{plan.description}</p>

                <div className="mt-5 flex items-baseline gap-2">
                  {plan.isCustom ? (
                    <span className="text-2xl font-bold text-gray-900">
                      Contact sales
                    </span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-gray-900">
                        ${plan.monthlyPrice}
                      </span>
                      <span className="text-sm text-gray-500">
                        {plan.billingLabel || "/mo"}
                      </span>
                    </>
                  )}
                </div>
                {!plan.isCustom && (
                  <p className="text-xs text-gray-500">
                    or{" "}
                    <span className="font-semibold text-gray-700">
                      ${plan.yearlyPrice}/mo
                    </span>{" "}
                    billed yearly
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Branch limit:{" "}
                  <span className="font-semibold text-gray-600">
                    {plan.maxBranches === null
                      ? "Unlimited"
                      : `${plan.maxBranches} ${plan.maxBranches === 1 ? "branch" : "branches"}`}
                  </span>
                </p>

                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-xs">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Customers
                    </dt>
                    <dd className="mt-0.5 text-lg font-bold text-gray-900">
                      {metrics.customers}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      MRR
                    </dt>
                    <dd className="mt-0.5 text-lg font-bold text-gray-900">
                      {formatUSD(metrics.mrr)}
                    </dd>
                  </div>
                </dl>

                <ul className="mt-5 space-y-2">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-gray-700"
                    >
                      <Check
                        size={15}
                        className="mt-0.5 shrink-0 text-emerald-500"
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex items-center gap-2">
                  <button
                    onClick={() => setEditing(plan)}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Edit plan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-xs text-gray-500">
        <p>
          <span className="font-semibold text-gray-700">How this works:</span>{" "}
          Plans are stored in the database. Editing a plan here updates the{" "}
          <code>plans</code> table, the public marketing site (
          <code>/pricing</code> and <code>/signup</code>) and the price used for
          new Stripe checkouts. Stripe prices are immutable, so changing an
          amount mints a new test price for future checkouts while existing
          subscriptions keep their original price.
        </p>
      </div>

      <EditPlanModal
        plan={editing}
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
              t.type === "success"
                ? "bg-gray-900 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            <span className="max-w-xs">{t.message}</span>
            <button
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              className="ml-1 rounded p-0.5 hover:bg-white/10"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </PlatformShell>
  );
}
