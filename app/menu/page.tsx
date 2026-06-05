"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, UtensilsCrossed, TrendingUp, CheckCircle2, X } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ReadOnlyBanner from "@/components/layout/ReadOnlyBanner";
import MenuToolbar, { type StatusFilter } from "@/components/menu/MenuToolbar";
import MenuItemCard from "@/components/menu/MenuItemCard";
import MenuTable from "@/components/menu/MenuTable";
import MenuItemModal from "@/components/menu/MenuItemModal";
import BulkPriceUpdateModal from "@/components/menu/BulkPriceUpdateModal";
import type { ViewMode } from "@/components/menu/ViewToggle";
import type { Branch } from "@/types/branch";
import type { MenuItem, MenuItemFormData } from "@/types/menu";
import type { ApiCategory } from "@/types/category";
import type { AuthSession } from "@/types/auth";
import {
  apiFetch,
  getAuthSession,
  isOperationalReadOnly,
} from "@/lib/auth-client";

interface ApiMenuRow {
  id: number;
  itemName: string;
  description: string | null;
  branchId: number;
  branchName: string;
  category: string;
  price: number;
  hasVariations: boolean;
  basePrice: number | null;
  variations: Array<{
    id: number;
    name: string;
    price: number;
    sortOrder: number;
  }>;
  status: "active" | "inactive";
}

export default function MenuPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [sessionBranchId, setSessionBranchId] = useState<number | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const readOnly = isOperationalReadOnly(session);

  /* ── Branches from API ── */
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  /* ── Menu items from API ── */
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuItemsLoading, setMenuItemsLoading] = useState(true);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* ── Filters ── */
  const [filterBranchId, setFilterBranchId] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [filterCategoryName, setFilterCategoryName] = useState<string | "all">("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  /* ──────────────── Auth guard ──────────────── */
  useEffect(() => {
    const s = getAuthSession();
    if (!s) {
      router.replace("/login");
    } else {
      setSession(s);
      setSessionBranchId(s.branchId ?? null);
      if (s.branchId) {
        setFilterBranchId(s.branchId);
      }
      setAuthorized(true);
    }
  }, [router]);

  /* ──────────────── Fetch active branches ──────────────── */
  const fetchBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      const res = await apiFetch("/api/branches");
      if (!res.ok) throw new Error();
      const data: Branch[] = await res.json();
      setBranches(data.filter((b) => b.status === "Active"));
    } catch {
      // silent
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) fetchBranches();
  }, [authorized, fetchBranches]);

  /* ──────────────── Debounce search (300ms) ──────────────── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  /* ──────────────── Auto-dismiss success toast ──────────────── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ──────────────── Fetch menu items from dedicated /api/menu ──────────────── */
  const fetchMenuItems = useCallback(async () => {
    setMenuItemsLoading(true);
    try {
      const params = new URLSearchParams();
      const effectiveBranchId =
        sessionBranchId !== null
          ? sessionBranchId
          : filterBranchId;
      if (effectiveBranchId !== "all") params.set("branchId", String(effectiveBranchId));
      if (filterCategoryName !== "all") params.set("category", filterCategoryName);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const url = `/api/menu${params.toString() ? `?${params}` : ""}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error();
      const data: ApiMenuRow[] = await res.json();
      // API already returns branchName, but ensure type alignment
      setMenuItems(
        data.map((item) => ({
          id: item.id,
          name: item.itemName,
          description: item.description ?? undefined,
          branchId: item.branchId,
          branchName: item.branchName ?? "",
          categoryId: undefined,
          categoryName: item.category ?? "",
          hasVariations: item.hasVariations,
          basePrice: item.basePrice,
          variations: item.variations ?? [],
          displayPrice: Number(item.price),
          status: item.status === "inactive" ? "inactive" : "active",
        }))
      );
    } catch {
      setMenuItems([]);
    } finally {
      setMenuItemsLoading(false);
    }
  }, [filterBranchId, filterCategoryName, statusFilter, debouncedSearch, sessionBranchId]);

  useEffect(() => {
    if (authorized && !branchesLoading) {
      fetchMenuItems();
    }
  }, [authorized, branchesLoading, fetchMenuItems]);

  /* ──────────────── Fetch categories from API ──────────────── */
  const fetchCategoryNames = useCallback(async () => {
    try {
      const effectiveBranchId =
        sessionBranchId !== null
          ? sessionBranchId
          : filterBranchId;
      const url =
        effectiveBranchId === "all"
          ? "/api/categories"
          : `/api/categories?branch_id=${effectiveBranchId}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error();
      const data: ApiCategory[] = await res.json();

      // Keep menu categories aligned with Categories module visibility:
      // only categories that belong to currently active branches.
      const activeBranchIds = new Set(branches.map((b) => b.branch_id));
      const visibleCategories = data.filter((c) => activeBranchIds.has(c.branch_id));

      const names = Array.from(
        new Set(visibleCategories.map((c) => c.name).filter((n) => n.trim().length > 0))
      ).sort((a, b) => a.localeCompare(b));
      setCategoryNames(names);
    } catch {
      setCategoryNames([]);
    }
  }, [filterBranchId, branches, sessionBranchId]);

  useEffect(() => {
    if (authorized && !branchesLoading) {
      fetchCategoryNames();
    }
  }, [authorized, branchesLoading, fetchCategoryNames]);

  /* ──────────────── Filtered items (server-side filtering via API) ──────────────── */
  const filteredItems = menuItems;

  /* ──────────────── CRUD handlers ──────────────── */
  const openCreate = () => {
    if (readOnly) return;
    setEditingItem(null);
    setModalOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    if (readOnly) return;
    setEditingItem(item);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
  };

  const handleSave = async (data: MenuItemFormData) => {
    const branch = branches.find((b) => b.branch_id === Number(data.branchId));
    if (!branch || !data.categoryName?.trim()) return;

    try {
      if (editingItem) {
        const res = await apiFetch(`/api/menu/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemName: data.name.trim(),
            description: data.description?.trim() || null,
            category: data.categoryName.trim(),
            hasVariations: data.hasVariations,
            basePrice: data.hasVariations ? null : parseFloat(data.basePrice) || 0,
            variations: data.hasVariations
              ? data.variations.map((row) => ({
                  name: row.name.trim(),
                  price: parseFloat(row.price) || 0,
                }))
              : [],
            status: data.status,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update");
        }
      } else {
        const res = await apiFetch("/api/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemName: data.name.trim(),
            description: data.description?.trim() || null,
            category: data.categoryName.trim(),
            branchId: branch.branch_id,
            hasVariations: data.hasVariations,
            basePrice: data.hasVariations ? null : parseFloat(data.basePrice) || 0,
            variations: data.hasVariations
              ? data.variations.map((row) => ({
                  name: row.name.trim(),
                  price: parseFloat(row.price) || 0,
                }))
              : [],
            status: data.status,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create");
        }
      }
      await fetchMenuItems();
      closeModal();
    } catch (error) {
      console.error("Error saving menu item:", error);
      alert(error instanceof Error ? error.message : "Failed to save");
    }
  };

  const handleDelete = async (item: MenuItem) => {
    if (readOnly) return;
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      const res = await apiFetch(`/api/menu/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
      await fetchMenuItems();
    } catch (error) {
      console.error("Error deleting menu item:", error);
      alert(error instanceof Error ? error.message : "Failed to delete");
    }
  };

  /* ──────────────── Loading ──────────────── */
  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
      </div>
    );
  }

  const noBranches = !branchesLoading && branches.length === 0;

  const activeCount = menuItems.filter((m) => m.status === "active").length;
  const inactiveCount = menuItems.filter((m) => m.status === "inactive").length;

  return (
    <DashboardLayout title="Menu">
      {readOnly && <ReadOnlyBanner module="menu" />}

      {/* ── Page Header ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Menu Management
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {readOnly
                ? "Review menu items, prices, and categories across all branches."
                : "Manage menu items, prices, and categories across all branches"}
            </p>
            <div className="flex items-center gap-4 mt-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <UtensilsCrossed size={13} className="text-gray-400" />
                {menuItems.length} total items
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-green-600">
                ● {activeCount} active
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                ○ {inactiveCount} inactive
              </span>
            </div>
          </div>

          {!readOnly && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setBulkModalOpen(true)}
                  disabled={noBranches}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <TrendingUp size={18} />
                  Bulk Price Update
                </button>
                <button
                  onClick={openCreate}
                  disabled={noBranches}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlusCircle size={18} />
                  + Add Menu Item
                </button>
              </div>
              {noBranches && (
                <p className="text-xs text-red-500">
                  Create an active branch first
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <MenuToolbar
        branches={branches}
        branchesLoading={branchesLoading}
        filterBranchId={filterBranchId}
        onBranchChange={(v) => {
          if (sessionBranchId !== null) return;
          setFilterBranchId(v);
          setFilterCategoryName("all");
        }}
        branchLocked={sessionBranchId !== null}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        categories={categoryNames}
        filterCategoryName={filterCategoryName}
        onCategoryChange={setFilterCategoryName}
        view={view}
        onViewChange={setView}
      />

      {/* ── Content ── */}
      {branchesLoading || menuItemsLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
        </div>
      ) : view === "grid" ? (
        filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <UtensilsCrossed size={28} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 max-w-xs">
                No menu items found matching your filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={handleDelete}
                readOnly={readOnly}
              />
            ))}
          </div>
        )
      ) : (
        <MenuTable
          items={filteredItems}
          loading={false}
          onEdit={openEdit}
          onDelete={handleDelete}
          readOnly={readOnly}
        />
      )}

      {/* ── Modal ── */}
      <MenuItemModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSave={handleSave}
        editItem={editingItem}
        activeBranches={branches}
        branchesLoading={branchesLoading}
        lockedBranchId={sessionBranchId}
      />

      {/* ── Bulk Price Update ── */}
      {!readOnly && (
        <BulkPriceUpdateModal
          isOpen={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          branchId={sessionBranchId !== null ? sessionBranchId : filterBranchId}
          branches={branches}
          onApplied={(summary) => {
            fetchMenuItems();
            setToast(
              `Prices updated successfully · ${summary.updatedItemsCount} item${
                summary.updatedItemsCount === 1 ? "" : "s"
              } updated.`
            );
          }}
        />
      )}

      {/* ── Success toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] flex items-center gap-3 rounded-xl bg-white border border-green-200 shadow-lg px-4 py-3 max-w-sm">
          <CheckCircle2 size={20} className="text-green-500 shrink-0" />
          <p className="text-sm font-medium text-gray-700 flex-1">{toast}</p>
          <button
            onClick={() => setToast(null)}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 cursor-pointer"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}
