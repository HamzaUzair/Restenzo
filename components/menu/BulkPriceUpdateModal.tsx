"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Search,
  TrendingUp,
  AlertTriangle,
  CheckSquare,
  Square,
} from "lucide-react";
import type { Branch } from "@/types/branch";
import { apiFetch } from "@/lib/auth-client";

interface ApiMenuRow {
  id: number;
  itemName: string;
  branchId: number;
  branchName: string;
  category: string;
  price: number;
  hasVariations: boolean;
  basePrice: number | null;
  variations: Array<{ id: number; name: string; price: number }>;
  status: "active" | "inactive";
}

interface BulkItem {
  id: number;
  name: string;
  branchId: number;
  branchName: string;
  category: string;
  hasVariations: boolean;
  basePrice: number;
  variations: Array<{ id: number; name: string; price: number }>;
}

interface BulkPriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Effective branch scope from the Menu page filter ("all" = restaurant-wide). */
  branchId: number | "all";
  /** Active branches, used to resolve branch names for the scope indicator. */
  branches: Branch[];
  /** Called with the success summary after prices have been updated. */
  onApplied: (summary: {
    updatedItemsCount: number;
    updatedPricesCount: number;
  }) => void;
}

const QUICK_PERCENTAGES = [0.5, 1, 2, 3, 5];

/** Mirror of the server rounding rule: round to the nearest whole PKR. */
function roundPrice(value: number): number {
  return Math.round(value);
}

function applyPct(oldPrice: number, pct: number): number {
  return roundPrice(oldPrice + (oldPrice * pct) / 100);
}

function formatPKR(value: number): string {
  return `PKR ${value.toLocaleString("en-PK")}`;
}

const BulkPriceUpdateModal: React.FC<BulkPriceUpdateModalProps> = ({
  isOpen,
  onClose,
  branchId,
  branches,
  onApplied,
}) => {
  const [items, setItems] = useState<BulkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");

  const [quickPct, setQuickPct] = useState<number | null>(null);
  const [customPct, setCustomPct] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const branchLabel = useMemo(() => {
    if (branchId === "all") return "All branches in scope";
    const match = branches.find((b) => b.branch_id === branchId);
    return match?.branch_name ?? "Current branch";
  }, [branchId, branches]);

  /* ── Reset + fetch active items each time the modal opens ── */
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", "active");
      if (branchId !== "all") params.set("branchId", String(branchId));
      const res = await apiFetch(`/api/menu?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data: ApiMenuRow[] = await res.json();
      setItems(
        data.map((row) => ({
          id: row.id,
          name: row.itemName,
          branchId: row.branchId,
          branchName: row.branchName ?? "",
          category: row.category ?? "",
          hasVariations: row.hasVariations,
          basePrice: Number(row.basePrice ?? row.price ?? 0),
          variations: (row.variations ?? []).map((v) => ({
            id: v.id,
            name: v.name,
            price: Number(v.price),
          })),
        }))
      );
    } catch {
      setLoadError("Unable to load menu items. Please try again.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    setSearch("");
    setCategoryFilter("all");
    setQuickPct(null);
    setCustomPct("");
    setConfirmOpen(false);
    setFormError(null);
    fetchItems();
  }, [isOpen, fetchItems]);

  /* ── Esc to close + lock body scroll ── */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        if (confirmOpen) setConfirmOpen(false);
        else onClose();
      }
    },
    [onClose, submitting, confirmOpen]
  );
  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  const categories = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [items]
  );

  const multiBranch = useMemo(
    () => new Set(items.map((i) => i.branchId)).size > 1,
    [items]
  );

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      if (!term) return true;
      return (
        i.name.toLowerCase().includes(term) ||
        i.category.toLowerCase().includes(term)
      );
    });
  }, [items, search, categoryFilter]);

  /* ── Effective percentage (custom overrides quick when typed) ── */
  const effectivePct = useMemo(() => {
    if (customPct.trim() !== "") {
      const n = Number(customPct);
      return Number.isNaN(n) ? null : n;
    }
    return quickPct;
  }, [customPct, quickPct]);

  const pctValid =
    effectivePct !== null && effectivePct > 0 && effectivePct <= 100;

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds]
  );

  const affectedPricesCount = useMemo(() => {
    return selectedItems.reduce(
      (sum, i) => sum + (i.hasVariations ? i.variations.length : 1),
      0
    );
  }, [selectedItems]);

  const canApply = selectedItems.length > 0 && pctValid && !submitting;

  const toggleItem = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visibleItems.forEach((i) => next.add(i.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const newPriceFor = (oldPrice: number) =>
    pctValid ? applyPct(oldPrice, effectivePct as number) : oldPrice;

  const handleApplyClick = () => {
    setFormError(null);
    if (selectedItems.length === 0) {
      setFormError("Select at least one menu item.");
      return;
    }
    if (!pctValid) {
      setFormError("Enter a valid percentage.");
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!canApply) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiFetch("/api/menu/bulk-price-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemIds: selectedItems.map((i) => i.id),
          percentage: effectivePct,
          includeVariations: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update prices.");
      }
      onApplied({
        updatedItemsCount: data.updatedItemsCount ?? selectedItems.length,
        updatedPricesCount: data.updatedPricesCount ?? affectedPricesCount,
      });
      onClose();
    } catch (err) {
      setConfirmOpen(false);
      setFormError(
        err instanceof Error
          ? err.message
          : "Unable to update prices. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const allVisibleSelected =
    visibleItems.length > 0 &&
    visibleItems.every((i) => selectedIds.has(i.id));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-[#ff5a1f] rounded-full" />
            <h2 className="text-lg font-bold text-gray-800">
              Bulk Price Update
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

        {/* ── Scope indicator ── */}
        <div className="px-6 pt-4 shrink-0">
          <div className="flex items-center gap-2 rounded-lg bg-[#ff5a1f]/8 border border-[#ff5a1f]/15 px-3.5 py-2.5">
            <TrendingUp size={15} className="text-[#ff5a1f] shrink-0" />
            <p className="text-xs text-gray-600">
              Updating prices for:{" "}
              <span className="font-semibold text-gray-800">{branchLabel}</span>
            </p>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Percentage selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Increase prices by
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_PERCENTAGES.map((p) => {
                const active = customPct.trim() === "" && quickPct === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setQuickPct(p);
                      setCustomPct("");
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? "bg-[#ff5a1f] text-white border-[#ff5a1f]"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {p}%
                  </button>
                );
              })}
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Custom"
                  value={customPct}
                  onChange={(e) => {
                    setCustomPct(e.target.value);
                    if (e.target.value.trim() !== "") setQuickPct(null);
                  }}
                  className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
            {customPct.trim() !== "" && !pctValid && (
              <p className="text-xs text-red-500 mt-1.5">
                Enter a percentage greater than 0 and up to 100.
              </p>
            )}
          </div>

          {/* Search + category + selection controls */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items…"
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(
                  e.target.value === "all" ? "all" : e.target.value
                )
              }
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllVisible}
                disabled={visibleItems.length === 0}
                className="text-xs font-semibold text-[#ff5a1f] hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline"
              >
                Select all visible
              </button>
              <span className="text-gray-300">·</span>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
                className="text-xs font-semibold text-gray-500 hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline"
              >
                Clear selection
              </button>
            </div>
            <span className="text-xs text-gray-500">
              {selectedItems.length} selected
            </span>
          </div>

          {/* Items list */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={26} className="animate-spin text-[#ff5a1f]" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <AlertTriangle size={22} className="text-red-400" />
              <p className="text-sm text-gray-500">{loadError}</p>
              <button
                type="button"
                onClick={fetchItems}
                className="text-xs font-semibold text-[#ff5a1f] hover:underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              No active menu items found.
            </div>
          ) : (
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {/* Header row */}
              <div className="sticky top-0 z-10 bg-gray-50 px-3 py-2 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <button
                  type="button"
                  onClick={allVisibleSelected ? clearSelection : selectAllVisible}
                  className="text-gray-400 hover:text-[#ff5a1f] cursor-pointer"
                  aria-label="Toggle all visible"
                >
                  {allVisibleSelected ? (
                    <CheckSquare size={16} className="text-[#ff5a1f]" />
                  ) : (
                    <Square size={16} />
                  )}
                </button>
                <span className="flex-1">Item</span>
                <span className="w-24 text-right">Current</span>
                <span className="w-24 text-right">New</span>
              </div>

              {visibleItems.map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`px-3 py-2.5 flex items-start gap-3 cursor-pointer transition-colors ${
                      selected ? "bg-[#ff5a1f]/5" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="pt-0.5 text-gray-400">
                      {selected ? (
                        <CheckSquare size={16} className="text-[#ff5a1f]" />
                      ) : (
                        <Square size={16} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {item.category}
                        {multiBranch && item.branchName
                          ? ` · ${item.branchName}`
                          : ""}
                        {item.hasVariations
                          ? ` · ${item.variations.length} variations`
                          : ""}
                      </p>
                    </div>
                    {item.hasVariations ? (
                      <div className="w-24 text-right text-sm text-gray-500">
                        {formatPKR(
                          Math.min(...item.variations.map((v) => v.price))
                        )}
                        +
                      </div>
                    ) : (
                      <div className="w-24 text-right text-sm text-gray-500">
                        {formatPKR(item.basePrice)}
                      </div>
                    )}
                    <div className="w-24 text-right text-sm font-semibold">
                      {selected && pctValid ? (
                        <span className="text-green-600">
                          {item.hasVariations
                            ? `${formatPKR(
                                Math.min(
                                  ...item.variations.map((v) =>
                                    newPriceFor(v.price)
                                  )
                                )
                              )}+`
                            : formatPKR(newPriceFor(item.basePrice))}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Preview summary */}
          {selectedItems.length > 0 && pctValid && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-700">
                {selectedItems.length} item
                {selectedItems.length === 1 ? "" : "s"} selected · Increasing by{" "}
                {effectivePct}%
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {affectedPricesCount} price
                {affectedPricesCount === 1 ? "" : "s"} (including variations)
                will be updated.
              </p>
            </div>
          )}

          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5">
              <p className="text-xs font-medium text-red-600">{formError}</p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyClick}
            disabled={!canApply}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <TrendingUp size={16} />
            Apply Price Update
          </button>
        </div>

        {/* ── Confirmation overlay ── */}
        {confirmOpen && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-black/40 rounded-2xl">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#ff5a1f]/10 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-[#ff5a1f]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800">
                    Confirm price update
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Are you sure you want to increase prices for{" "}
                    <span className="font-semibold text-gray-700">
                      {selectedItems.length} selected menu item
                      {selectedItems.length === 1 ? "" : "s"}
                    </span>{" "}
                    by{" "}
                    <span className="font-semibold text-gray-700">
                      {effectivePct}%
                    </span>
                    ? This action will update live menu prices.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm disabled:opacity-60"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  Apply Price Update
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkPriceUpdateModal;
