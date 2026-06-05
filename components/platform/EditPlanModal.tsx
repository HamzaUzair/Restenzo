"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/auth-client";
import { validatePlanInput, type PlanFormInput } from "@/lib/plan-validation";
import type { AdminPlan } from "@/types/plan";

interface EditPlanModalProps {
  plan: AdminPlan | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (plan: AdminPlan, warning: string | null) => void;
}

function toForm(plan: AdminPlan): PlanFormInput {
  return {
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    currency: plan.currency,
    billingLabel: plan.billingLabel ?? "",
    ctaLabel: plan.ctaLabel ?? "",
    isActive: plan.isActive,
    isPopular: plan.isPopular,
    isCustom: plan.isCustom,
    maxBranches: plan.maxBranches,
    features: plan.features.length ? [...plan.features] : [""],
    stripeMonthlyPriceId: plan.stripeMonthlyPriceId ?? "",
    stripeYearlyPriceId: plan.stripeYearlyPriceId ?? "",
  };
}

const labelCls =
  "block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1";
const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#ff5a1f] focus:outline-none focus:ring-1 focus:ring-[#ff5a1f]";

const EditPlanModal: React.FC<EditPlanModalProps> = ({
  plan,
  isOpen,
  onClose,
  onSaved,
}) => {
  const [form, setForm] = useState<PlanFormInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    if (plan && isOpen) {
      setForm(toForm(plan));
      setErrors([]);
      setServerError("");
    }
  }, [plan, isOpen]);

  const liveValidation = useMemo(
    () => (form ? validatePlanInput(form) : null),
    [form]
  );

  if (!isOpen || !plan || !form) return null;

  const update = <K extends keyof PlanFormInput>(
    key: K,
    value: PlanFormInput[K]
  ) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const updateFeature = (idx: number, value: string) =>
    setForm((f) =>
      f
        ? { ...f, features: f.features.map((x, i) => (i === idx ? value : x)) }
        : f
    );

  const addFeature = () =>
    setForm((f) => (f ? { ...f, features: [...f.features, ""] } : f));

  const removeFeature = (idx: number) =>
    setForm((f) =>
      f ? { ...f, features: f.features.filter((_, i) => i !== idx) } : f
    );

  const moveFeature = (idx: number, dir: -1 | 1) =>
    setForm((f) => {
      if (!f) return f;
      const next = [...f.features];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return f;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...f, features: next };
    });

  const handleSave = async () => {
    if (!form) return;
    const result = validatePlanInput(form);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setServerError("");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/platform/plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.normalized),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update plan");
      }
      onSaved(data.plan as AdminPlan, data.stripeWarning ?? null);
      onClose();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Failed to update plan");
    } finally {
      setSaving(false);
    }
  };

  const isUnsaved = plan.id < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Edit plan · {plan.name}
            </h2>
            <p className="text-xs text-gray-500">
              Changes apply to the admin panel, the marketing site and new
              checkouts.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {isUnsaved && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              This plan has not been seeded into the database yet. Run{" "}
              <code>npm run seed:plans</code> before editing.
            </div>
          )}

          {(errors.length > 0 || serverError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {serverError && <p>{serverError}</p>}
              {errors.map((e) => (
                <p key={e}>• {e}</p>
              ))}
            </div>
          )}

          {/* Name + description */}
          <div>
            <label className={labelCls}>Plan name</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Description / subtitle</label>
            <textarea
              className={inputCls}
              rows={2}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          {/* Prices */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Monthly price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={form.monthlyPrice}
                onChange={(e) =>
                  update("monthlyPrice", Number(e.target.value))
                }
                disabled={form.isCustom}
              />
            </div>
            <div>
              <label className={labelCls}>Yearly price /mo</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={form.yearlyPrice}
                onChange={(e) => update("yearlyPrice", Number(e.target.value))}
                disabled={form.isCustom}
              />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <input
                className={inputCls}
                value={form.currency}
                onChange={(e) => update("currency", e.target.value)}
              />
            </div>
          </div>

          {/* Branch limit + billing label */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>
                Max branches (blank = unlimited)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                className={inputCls}
                value={form.maxBranches ?? ""}
                placeholder="Unlimited"
                onChange={(e) =>
                  update(
                    "maxBranches",
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
            </div>
            <div>
              <label className={labelCls}>CTA label</label>
              <input
                className={inputCls}
                value={form.ctaLabel}
                onChange={(e) => update("ctaLabel", e.target.value)}
              />
            </div>
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => update("isActive", e.target.checked)}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isPopular}
                onChange={(e) => update("isPopular", e.target.checked)}
              />
              Popular badge
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isCustom}
                onChange={(e) => update("isCustom", e.target.checked)}
              />
              Custom / contact sales
            </label>
          </div>

          {/* Features */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={labelCls + " mb-0"}>Checklist / features</label>
              <button
                type="button"
                onClick={addFeature}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Plus size={13} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {form.features.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    className={inputCls}
                    value={f}
                    placeholder="Feature text"
                    onChange={(e) => updateFeature(idx, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => moveFeature(idx, -1)}
                    disabled={idx === 0}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveFeature(idx, 1)}
                    disabled={idx === form.features.length - 1}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFeature(idx)}
                    className="rounded-md p-1.5 text-red-400 hover:bg-red-50"
                    aria-label="Delete feature"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <p className="text-[11px] text-gray-400">
                Empty items are dropped automatically when you save.
              </p>
            </div>
          </div>

          {/* Stripe section */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-700">
              Stripe price ids
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-gray-400">
                  Monthly
                </span>
                <p className="truncate text-xs text-gray-600">
                  {form.stripeMonthlyPriceId || "—"}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-gray-400">
                  Yearly
                </span>
                <p className="truncate text-xs text-gray-600">
                  {form.stripeYearlyPriceId || "—"}
                </p>
              </div>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-gray-500">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
              Changing the display price does not update existing Stripe
              subscriptions. A new Stripe test price is created automatically for
              new checkouts when you change an amount.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isUnsaved || (liveValidation ? !liveValidation.valid : false)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#ff5a1f] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e04e18] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPlanModal;
