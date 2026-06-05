"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { X, UserCog } from "lucide-react";
import type { AppUser, UserFormData, UserRole } from "@/types/user";
import { USER_ROLE_LABELS } from "@/types/user";
import {
  validateEmailUsername,
  validateNameWithLetters,
} from "@/lib/user-validation";

interface BranchOption {
  branch_id: number;
  branch_name: string;
  branch_code: string;
  restaurant_id?: number;
}

interface RestaurantOption {
  restaurant_id: number;
  name: string;
  slug?: string;
}

const emptyForm: UserFormData = {
  username: "",
  fullName: "",
  password: "",
  confirmPassword: "",
  role: "",
  restaurantId: "",
  branchId: "",
  terminal: "1",
  status: "Active",
};

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UserFormData) => void;
  editUser?: AppUser | null;
  branches: BranchOption[];
  restaurants?: RestaurantOption[];
  roleOptions?: UserRole[];
  branchLocked?: boolean;
  fixedBranchId?: number | null;
  restaurantLocked?: boolean;
  fixedRestaurantId?: number | null;
  title?: string;
  hideBranchFields?: boolean;
  hideTerminalField?: boolean;
}

const UserModal: React.FC<UserModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editUser,
  branches,
  restaurants = [],
  roleOptions = [],
  branchLocked = false,
  fixedBranchId = null,
  restaurantLocked = false,
  fixedRestaurantId = null,
  title,
  hideBranchFields = false,
  hideTerminalField = false,
}) => {
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});
  const isEdit = !!editUser;

  useEffect(() => {
    if (!isOpen) return;
    if (editUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        username: editUser.username,
        fullName: editUser.fullName,
        password: "",
        confirmPassword: "",
        role: editUser.role,
        restaurantId: editUser.restaurantId ?? "",
        branchId: editUser.branchId ?? "",
        terminal: String(editUser.terminal),
        status: editUser.status,
      });
    } else {
      setForm({
        ...emptyForm,
        restaurantId:
          restaurantLocked && fixedRestaurantId ? fixedRestaurantId : "",
        branchId: branchLocked && fixedBranchId ? fixedBranchId : "",
        role: roleOptions.length === 1 ? roleOptions[0] : "",
      });
    }
    setErrors({});
  }, [
    isOpen,
    editUser,
    branchLocked,
    fixedBranchId,
    restaurantLocked,
    fixedRestaurantId,
    roleOptions,
  ]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    },
    [isOpen, onClose]
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const isSuperAdminRole = form.role === "SUPER_ADMIN";
  const isRestaurantAdminRole = form.role === "RESTAURANT_ADMIN";
  const isBranchAdminRole = form.role === "BRANCH_ADMIN";
  const isStaffRole =
    form.role === "ORDER_TAKER" ||
    form.role === "CASHIER" ||
    form.role === "ACCOUNTANT" ||
    form.role === "LIVE_KITCHEN";
  const isBranchPinnedRole = isBranchAdminRole || isStaffRole;
  const showBranchFields = !hideBranchFields && isBranchPinnedRole;

  /* Reset incompatible fields whenever role changes */
  useEffect(() => {
    if (isSuperAdminRole) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((p) => ({ ...p, restaurantId: "", branchId: "" }));
    } else if (isRestaurantAdminRole) {
      setForm((p) => ({ ...p, branchId: "" }));
    }
  }, [isSuperAdminRole, isRestaurantAdminRole]);

  /* Branch options scoped to selected restaurant */
  const restaurantIdNum =
    typeof form.restaurantId === "number" ? form.restaurantId : null;
  const branchOptions = useMemo(() => {
    if (!restaurantIdNum) return branches;
    return branches.filter(
      (b) => !b.restaurant_id || b.restaurant_id === restaurantIdNum
    );
  }, [branches, restaurantIdNum]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof UserFormData, string>> = {};
    const usernameError = validateEmailUsername(form.username);
    if (usernameError) errs.username = usernameError;

    const fullNameError = validateNameWithLetters(form.fullName);
    if (fullNameError) errs.fullName = fullNameError;

    if (!isEdit) {
      if (!form.password) errs.password = "Password is required.";
      else if (form.password.length < 6) errs.password = "Minimum 6 characters.";
      if (form.password !== form.confirmPassword)
        errs.confirmPassword = "Passwords do not match.";
    } else if (form.password && form.password !== form.confirmPassword) {
      errs.confirmPassword = "Passwords do not match.";
    }

    if (!form.role) errs.role = "Please select a role.";
    if (isRestaurantAdminRole && form.restaurantId === "")
      errs.restaurantId = "Restaurant is required for Restaurant Admin.";
    if ((isStaffRole || isBranchAdminRole) && form.restaurantId === "")
      errs.restaurantId = "Restaurant is required for this role.";
    if (showBranchFields && form.branchId === "")
      errs.branchId = "Branch is required for this role.";

    if (!hideTerminalField) {
      const t = Number(form.terminal);
      if (isNaN(t) || t < 1) errs.terminal = "Terminal must be ≥ 1.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  };

  if (!isOpen) return null;

  const inputBase =
    "w-full border rounded-lg px-3.5 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all";
  const labelBase = "block text-xs font-medium text-gray-600 mb-1.5";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col z-10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#ff5a1f]/10 flex items-center justify-center">
              <UserCog size={18} className="text-[#ff5a1f]" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">
              {title ?? (isEdit ? "Edit User" : "Add New User")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className={labelBase}>
              Username (Email) <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              className={`${inputBase} ${errors.username ? "border-red-400" : "border-gray-200"}`}
              placeholder="e.g. admin@restaurant.com"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            />
            {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
          </div>

          <div>
            <label className={labelBase}>
              Full Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className={`${inputBase} ${errors.fullName ? "border-red-400" : "border-gray-200"}`}
              placeholder="e.g. Ali Raza"
              value={form.fullName}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
            />
            {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelBase}>
                Password {!isEdit && <span className="text-red-400">*</span>}
              </label>
              <input
                type="password"
                className={`${inputBase} ${errors.password ? "border-red-400" : "border-gray-200"}`}
                placeholder={isEdit ? "Leave blank to keep" : "Min 6 chars"}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            </div>
            <div>
              <label className={labelBase}>
                Confirm Password {!isEdit && <span className="text-red-400">*</span>}
              </label>
              <input
                type="password"
                className={`${inputBase} ${errors.confirmPassword ? "border-red-400" : "border-gray-200"}`}
                placeholder="Re-enter password"
                value={form.confirmPassword}
                onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>
              )}
            </div>
          </div>

          <div>
            <label className={labelBase}>
              Role <span className="text-red-400">*</span>
            </label>
            <select
              className={`${inputBase} appearance-none ${roleOptions.length === 1 ? "bg-gray-50 cursor-not-allowed" : "cursor-pointer"} ${errors.role ? "border-red-400" : "border-gray-200"}`}
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole | "" }))}
              disabled={roleOptions.length === 1}
            >
              <option value="">Select role</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {USER_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {errors.role && <p className="text-xs text-red-500 mt-1">{errors.role}</p>}
            {roleOptions.length === 1 && roleOptions[0] === "RESTAURANT_ADMIN" && (
              <p className="text-[11px] text-gray-400 mt-1">
                Platform Admin can create Restaurant Admin accounts only from this panel.
              </p>
            )}
            {roleOptions.length === 1 && roleOptions[0] === "BRANCH_ADMIN" && (
              <p className="text-[11px] text-gray-400 mt-1">
                Restaurant Admin can assign one Branch Admin per branch of this
                restaurant.
              </p>
            )}
          </div>

          {/* Assign Restaurant — only for tenant roles */}
          {!isSuperAdminRole && form.role && (
            <div>
              <label className={labelBase}>
                Assign Restaurant <span className="text-red-400">*</span>
              </label>
              <select
                className={`${inputBase} appearance-none cursor-pointer ${errors.restaurantId ? "border-red-400" : "border-gray-200"} ${restaurantLocked ? "bg-gray-50" : ""}`}
                value={form.restaurantId === "" ? "" : String(form.restaurantId)}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    restaurantId: e.target.value === "" ? "" : Number(e.target.value),
                    branchId: "",
                  }))
                }
                disabled={restaurantLocked}
              >
                <option value="">Select restaurant</option>
                {restaurants.map((r) => (
                  <option key={r.restaurant_id} value={r.restaurant_id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {errors.restaurantId && (
                <p className="text-xs text-red-500 mt-1">{errors.restaurantId}</p>
              )}
            </div>
          )}

          {/* Branch — only for branch-scoped staff */}
          {showBranchFields && (
            <div>
              <label className={labelBase}>
                Branch <span className="text-red-400">*</span>
              </label>
              <select
                className={`${inputBase} appearance-none cursor-pointer ${errors.branchId ? "border-red-400" : "border-gray-200"}`}
                value={form.branchId === "" ? "" : String(form.branchId)}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    branchId: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
                disabled={branchLocked}
              >
                <option value="">Select branch</option>
                {branchOptions.map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name} ({b.branch_code})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Branches are limited to the selected restaurant.
              </p>
              {errors.branchId && <p className="text-xs text-red-500 mt-1">{errors.branchId}</p>}
            </div>
          )}

          <div className={`grid gap-4 ${hideTerminalField ? "grid-cols-1" : "grid-cols-2"}`}>
            {!hideTerminalField && (
              <div>
                <label className={labelBase}>
                  Terminal <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  className={`${inputBase} ${errors.terminal ? "border-red-400" : "border-gray-200"}`}
                  value={form.terminal}
                  onChange={(e) => setForm((p) => ({ ...p, terminal: e.target.value }))}
                />
                {errors.terminal && <p className="text-xs text-red-500 mt-1">{errors.terminal}</p>}
              </div>
            )}
            <div>
              <label className={labelBase}>Status</label>
              <select
                className={`${inputBase} appearance-none cursor-pointer border-gray-200`}
                value={form.status}
                onChange={(e) =>
                  setForm((p) => ({ ...p, status: e.target.value as "Active" | "Inactive" }))
                }
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </form>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-5 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="flex-1 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm"
          >
            {isEdit ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserModal;
