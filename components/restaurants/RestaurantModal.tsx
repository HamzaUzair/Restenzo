"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Building2, Eye, EyeOff, Loader2, Save, Store, X } from "lucide-react";
import type { Restaurant, RestaurantFormData } from "@/types/restaurant";

export interface RestaurantEditAdmin {
  user_id: number;
  username: string;
  full_name: string;
  password: string;
}

const emptyForm: RestaurantFormData = {
  name: "",
  slug: "",
  phone: "",
  address: "",
  status: "Active",
  has_multiple_branches: true,
  admin_full_name: "",
  admin_username: "",
  admin_password: "",
  admin_confirm_password: "",
};

interface RestaurantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RestaurantFormData) => Promise<void>;
  editRestaurant?: Restaurant | null;
  /** Pre-populated admin credentials when editing (Super Admin view). */
  editAdmin?: RestaurantEditAdmin | null;
  /**
   * Current branch count for the tenant being edited. Used to lock the
   * "Has Multiple Branches" toggle when the tenant already owns more than
   * one branch (downgrading is only allowed if there is ≤ 1 branch).
   */
  editBranchCount?: number;
}

const inputBase =
  "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all";
const labelBase = "block text-xs font-medium text-gray-600 mb-1.5";

const RestaurantModal: React.FC<RestaurantModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editRestaurant,
  editAdmin,
  editBranchCount = 0,
}) => {
  const [form, setForm] = useState<RestaurantFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof RestaurantFormData, string>>>({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const isEdit = !!editRestaurant;
  const hasAdmin = isEdit && !!editAdmin;
  // Existing tenant with >1 branches can't be downgraded to single-branch
  // without first removing branches. Lock the toggle on in that case.
  const multiBranchLocked = isEdit && editBranchCount > 1;

  useEffect(() => {
    if (!isOpen) return;
    if (editRestaurant) {
      setForm({
        name: editRestaurant.name,
        slug: editRestaurant.slug,
        phone: editRestaurant.phone ?? "",
        address: editRestaurant.address ?? "",
        status: editRestaurant.status,
        has_multiple_branches: editRestaurant.has_multiple_branches,
        admin_full_name: editAdmin?.full_name ?? "",
        admin_username: editAdmin?.username ?? "",
        admin_password: editAdmin?.password ?? "",
        admin_confirm_password: editAdmin?.password ?? "",
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
    setApiError("");
    setShowPassword(false);
    setShowConfirm(false);
  }, [isOpen, editRestaurant, editAdmin]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !submitting) onClose();
    },
    [isOpen, onClose, submitting]
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof RestaurantFormData, string>> = {};
    if (!form.name.trim()) errs.name = "Restaurant name is required.";
    if (!form.slug.trim()) errs.slug = "Restaurant code / slug is required.";

    const anyAdminField =
      (form.admin_full_name ?? "").trim() ||
      (form.admin_username ?? "").trim() ||
      form.admin_password ||
      form.admin_confirm_password;

    if (isEdit) {
      // When an admin already exists we keep the fields filled, so treat them
      // as required on save. When there isn't one yet we only validate if the
      // Super Admin actually started filling the section in.
      const shouldValidate = hasAdmin || !!anyAdminField;
      if (shouldValidate) {
        if (!form.admin_full_name?.trim())
          errs.admin_full_name = "Admin full name is required.";
        if (!form.admin_username?.trim())
          errs.admin_username = "Admin email/username is required.";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_username.trim()))
          errs.admin_username = "Please enter a valid email address.";
        if (!form.admin_password || form.admin_password.length < 6)
          errs.admin_password = "Minimum 6 characters.";
        if (form.admin_password !== form.admin_confirm_password)
          errs.admin_confirm_password = "Passwords do not match.";
      }
    } else if (anyAdminField) {
      if (!form.admin_full_name?.trim())
        errs.admin_full_name = "Admin full name is required.";
      if (!form.admin_username?.trim())
        errs.admin_username = "Admin email/username is required.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_username.trim()))
        errs.admin_username = "Please enter a valid email address.";
      if (!form.admin_password || form.admin_password.length < 6)
        errs.admin_password = "Minimum 6 characters.";
      if (form.admin_password !== form.admin_confirm_password)
        errs.admin_confirm_password = "Passwords do not match.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setApiError("");
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col z-10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#ff5a1f]/10 flex items-center justify-center">
              <Store size={18} className="text-[#ff5a1f]" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">
              {isEdit ? "Edit Restaurant" : "Add Restaurant"}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
        >
          {apiError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
              {apiError}
            </div>
          )}

          {/* Restaurant details */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">
              Restaurant Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelBase}>
                  Restaurant Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  className={`${inputBase} ${errors.name ? "border-red-400" : ""}`}
                  placeholder="e.g. Restenzo Bistro"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
                {errors.name && (
                  <p className="text-xs text-red-500 mt-1">{errors.name}</p>
                )}
              </div>
              <div>
                <label className={labelBase}>
                  Code / Slug <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  className={`${inputBase} ${errors.slug ? "border-red-400" : ""}`}
                  placeholder="e.g. restenzo-bistro"
                  value={form.slug}
                  onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                />
                {errors.slug && (
                  <p className="text-xs text-red-500 mt-1">{errors.slug}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelBase}>Phone</label>
                <input
                  type="tel"
                  className={inputBase}
                  placeholder="03xx-xxxxxxx"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelBase}>Status</label>
                <select
                  className={`${inputBase} appearance-none bg-white cursor-pointer`}
                  value={form.status}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      status: e.target.value as RestaurantFormData["status"],
                    }))
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelBase}>Address</label>
              <textarea
                className={`${inputBase} min-h-[80px] resize-y`}
                placeholder="Head office / primary address"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>

            {/* ── Has Multiple Branches toggle ───────────────────────── */}
            <label
              className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                multiBranchLocked
                  ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                  : "border-gray-200 hover:bg-gray-50 cursor-pointer"
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${
                  form.has_multiple_branches
                    ? "bg-[#ff5a1f]/10 text-[#ff5a1f]"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                <Building2 size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">
                    Has Multiple Branches
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      form.has_multiple_branches
                        ? "bg-[#ff5a1f]/10 text-[#ff5a1f]"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {form.has_multiple_branches ? "Multi Branch" : "Single Branch"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Enable this if the restaurant will manage more than one branch.
                  When disabled, Branches management is hidden from the
                  Restaurant Admin and a single default branch is used behind
                  the scenes.
                </p>
                {multiBranchLocked && (
                  <p className="text-xs text-amber-600 mt-2">
                    This restaurant already has {editBranchCount} branches, so
                    it must stay multi-branch. Remove extra branches first to
                    switch to single-branch mode.
                  </p>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.has_multiple_branches}
                disabled={multiBranchLocked}
                onClick={() =>
                  setForm((p) => ({
                    ...p,
                    has_multiple_branches: !p.has_multiple_branches,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors mt-1 ${
                  form.has_multiple_branches ? "bg-[#ff5a1f]" : "bg-gray-300"
                } ${multiBranchLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    form.has_multiple_branches ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          </section>

          {/* Restaurant Admin — shown in both Create and Edit modes */}
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">
                {isEdit
                  ? hasAdmin
                    ? "Restaurant Admin"
                    : "Add Restaurant Admin (optional)"
                  : "Restaurant Admin (optional)"}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {isEdit
                  ? hasAdmin
                    ? "View or update the Restaurant Admin's login credentials. Changes take effect on save."
                    : "No Restaurant Admin exists yet. Fill these fields to create one, or leave blank and add later from the Users page."
                  : "Create a Restaurant Admin in the same step. You can also skip and assign an admin later from the Users page."}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelBase}>Admin Full Name</label>
                <input
                  type="text"
                  className={`${inputBase} ${errors.admin_full_name ? "border-red-400" : ""}`}
                  placeholder="e.g. Ali Raza"
                  value={form.admin_full_name ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, admin_full_name: e.target.value }))
                  }
                />
                {errors.admin_full_name && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.admin_full_name}
                  </p>
                )}
              </div>
              <div>
                <label className={labelBase}>Admin Email / Username</label>
                <input
                  type="email"
                  className={`${inputBase} ${errors.admin_username ? "border-red-400" : ""}`}
                  placeholder="e.g. ali@restenzo.com"
                  value={form.admin_username ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, admin_username: e.target.value }))
                  }
                />
                {errors.admin_username && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.admin_username}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelBase}>Admin Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className={`${inputBase} pr-10 ${errors.admin_password ? "border-red-400" : ""}`}
                    placeholder="Min 6 chars"
                    value={form.admin_password ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, admin_password: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.admin_password && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.admin_password}
                  </p>
                )}
              </div>
              <div>
                <label className={labelBase}>Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    className={`${inputBase} pr-10 ${errors.admin_confirm_password ? "border-red-400" : ""}`}
                    placeholder="Re-enter password"
                    value={form.admin_confirm_password ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        admin_confirm_password: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                    tabIndex={-1}
                    aria-label={
                      showConfirm ? "Hide confirm password" : "Show confirm password"
                    }
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.admin_confirm_password && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.admin_confirm_password}
                  </p>
                )}
              </div>
            </div>
          </section>
        </form>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-5 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isEdit ? "Save Changes" : "Create Restaurant"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestaurantModal;
