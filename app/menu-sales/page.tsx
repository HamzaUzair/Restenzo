"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FileText, RefreshCw, PieChart, Loader2, XCircle } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import MenuSalesFilters from "@/components/menu-sales/MenuSalesFilters";
import MenuSalesKPIStrip from "@/components/menu-sales/MenuSalesKPIStrip";
import MenuSalesTable from "@/components/menu-sales/MenuSalesTable";
import MenuSalesCardList from "@/components/menu-sales/MenuSalesCardList";
import MenuSalesItemModal from "@/components/menu-sales/MenuSalesItemModal";
import type { ItemPerformance, MSTimeRange, MSSortField, MSSortDir, MSBranch } from "@/types/menuSales";
import { downloadMenuSalesCsv } from "@/lib/exportMenuSalesCsv";
import type { Branch } from "@/types/branch";
import { apiFetch, getAuthSession, getEffectiveBranchId } from "@/lib/auth-client";
import { exportMenuSalesReportPdf } from "@/lib/pdf/export-menu-sales-report";

/* ── date helpers ── */
function todayRange(): [string, string] {
  const d = new Date();
  const s = d.toISOString().slice(0, 10);
  return [s, s];
}
function weekRange(): [string, string] {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7; // Mon=1
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dayOfWeek - 1));
  return [mon.toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
}
function monthRange(): [string, string] {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return [first.toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
}
export default function MenuSalesPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [lockedBranchId, setLockedBranchId] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  /* ── auth guard ── */
  useEffect(() => {
    if (localStorage.getItem("isAuthenticated") !== "true") {
      router.replace("/login");
    } else {
      const session = getAuthSession();
      const effectiveBranch = getEffectiveBranchId(session);
      const pinnedBranch = typeof effectiveBranch === "number" ? effectiveBranch : null;
      setLockedBranchId(pinnedBranch);
      if (pinnedBranch) setBranchId(pinnedBranch);
      setAuthorized(true);
    }
  }, [router]);

  /* ── branches from API ── */
  const [branches, setBranches] = useState<MSBranch[]>([]);
  const [branchesReady, setBranchesReady] = useState(false);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    (async () => {
      let active: MSBranch[] = [];
      try {
        const res = await apiFetch("/api/branches");
        if (!res.ok) throw new Error();
        const data: Branch[] = await res.json();
        active = data
          .filter((b) => b.status === "Active")
          .map((b) => ({ id: b.branch_id, name: b.branch_name }));
      } catch {
        active = [];
      } finally {
        if (!cancelled) {
          setBranches(active);
          setBranchesReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorized]);

  /* ── filters ── */
  const [timeRange, setTimeRange] = useState<MSTimeRange>("this_month");
  const [dateFrom, setDateFrom] = useState(() => monthRange()[0]);
  const [dateTo, setDateTo] = useState(() => monthRange()[1]);
  const [branchId, setBranchId] = useState<number | "all">("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [loadingRows, setLoadingRows] = useState(false);

  /* ── sorting ── */
  const [sortField, setSortField] = useState<MSSortField>("soldQty");
  const [sortDir, setSortDir] = useState<MSSortDir>("desc");

  /* ── modal ── */
  const [modalItem, setModalItem] = useState<ItemPerformance | null>(null);

  /* ── toast ── */
  const [toast, setToast] = useState<{ msg: string; type: "success" | "info" } | null>(null);
  const showToast = useCallback((msg: string, type: "success" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── time-range shortcut handler ── */
  const handleTimeRange = useCallback(
    (tr: MSTimeRange) => {
      setTimeRange(tr);
      if (tr === "today") {
        const [f, t] = todayRange();
        setDateFrom(f);
        setDateTo(t);
      } else if (tr === "this_week") {
        const [f, t] = weekRange();
        setDateFrom(f);
        setDateTo(t);
      } else if (tr === "this_month") {
        const [f, t] = monthRange();
        setDateFrom(f);
        setDateTo(t);
      }
      // "custom" keeps current dates
    },
    []
  );

  /* ── rows (real DB) ── */
  const [rows, setRows] = useState<ItemPerformance[]>([]);

  useEffect(() => {
    if (!authorized || !branchesReady) return;
    let cancelled = false;

    const fetchRows = async () => {
      setLoadingRows(true);
      try {
        const params = new URLSearchParams();
        if (branchId !== "all") params.set("branchId", String(branchId));
        if (category !== "all") params.set("category", category);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        if (search.trim()) params.set("search", search.trim());
        params.set("activeOnly", "true");

        const res = await apiFetch(`/api/reports/menu-sales?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch menu sales");
        const data = (await res.json()) as ItemPerformance[];
        if (!cancelled) {
          setRows(data);
          const cats = Array.from(new Set(data.map((row) => row.category))).sort((a, b) =>
            a.localeCompare(b)
          );
          setCategories(cats);
          if (category !== "all" && !cats.includes(category)) setCategory("all");
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setCategories([]);
          showToast("Failed to load menu sales data");
        }
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    };

    fetchRows();
    return () => {
      cancelled = true;
    };
  }, [
    authorized,
    branchesReady,
    branchId,
    category,
    dateFrom,
    dateTo,
    search,
    refreshTick,
    showToast,
  ]);

  const sortedRows = useMemo(() => {
    const res = [...rows];
    res.sort((a, b) => {
      const diff = sortDir === "desc" ? b[sortField] - a[sortField] : a[sortField] - b[sortField];
      if (diff !== 0) return diff;
      const sec: MSSortField = sortField === "soldQty" ? "revenue" : "soldQty";
      return b[sec] - a[sec];
    });
    return res;
  }, [rows, sortDir, sortField]);

  /* ── clear all filters ── */
  /* ── sort toggle ── */
  const handleSort = useCallback(
    (f: MSSortField) => {
      if (f === sortField) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortField(f);
        setSortDir("desc");
      }
    },
    [sortField]
  );

  /* ── clear all filters ── */
  const handleClear = useCallback(() => {
    setTimeRange("this_month");
    const [f, t] = monthRange();
    setDateFrom(f);
    setDateTo(t);
    setBranchId(lockedBranchId ?? "all");
    setCategory("all");
    setSearch("");
    setSortField("soldQty");
    setSortDir("desc");
    showToast("Filters cleared!");
  }, [lockedBranchId, showToast]);

  /* ── has active filters? ── */
  const hasActiveFilter =
    (!lockedBranchId && branchId !== "all") ||
    category !== "all" ||
    search !== "" ||
    timeRange !== "this_month";

  /* ── filter description line ── */
  const filterDesc = useMemo(() => {
    const parts: string[] = [];
    if (branchId !== "all") parts.push(`Branch: ${branches.find((b) => b.id === branchId)?.name ?? branchId}`);
    if (category !== "all") parts.push(`Category: ${category}`);
    if (search) parts.push(`Search: "${search}"`);
    return parts;
  }, [branchId, category, search, branches]);

  /* ── loading guard ── */
  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <DashboardLayout title="Menu Sales">
      {/* ── header card ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Menu Sales</h2>
            <p className="text-sm text-gray-500 mt-1">
              Item Performance exact quantities and revenue (not charts-only)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                downloadMenuSalesCsv(sortedRows);
                showToast("CSV exported!", "success");
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors cursor-pointer shadow-sm"
            >
              <FileDown size={16} />
              Export CSV
            </button>
            <button
              onClick={() => {
                const session = getAuthSession();
                const branchLabel =
                  branchId === "all"
                    ? "All"
                    : branches.find((b) => b.id === branchId)?.name ?? String(branchId);
                exportMenuSalesReportPdf({
                  session,
                  rows: sortedRows,
                  filters: {
                    branchLabel,
                    dateRange: `${dateFrom} → ${dateTo}`,
                    category: category === "all" ? "All" : category,
                    search: search.trim(),
                    activeOnly: true,
                  },
                });
                showToast("PDF exported!", "success");
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors cursor-pointer shadow-sm"
            >
              <FileText size={16} />
              Export PDF
            </button>
            <button
              onClick={() => {
                setRefreshTick((p) => p + 1);
                showToast("Refreshed!");
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── filters ── */}
      <MenuSalesFilters
        branches={branches}
        categories={categories}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        branchId={branchId}
        onBranchChange={setBranchId}
        lockBranchId={lockedBranchId}
        category={category}
        onCategoryChange={setCategory}
        search={search}
        onSearchChange={setSearch}
        onClear={handleClear}
        hasActive={hasActiveFilter}
      />

      {/* ── KPI strip ── */}
      <MenuSalesKPIStrip rows={sortedRows} />

      {/* ── info line ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 text-sm text-gray-500 font-medium">
        <span>
          Showing <strong className="text-gray-700">{sortedRows.length}</strong> items
        </span>
        {filterDesc.length > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-gray-400 text-xs">
              Filtered by: {filterDesc.join(" · ")}
            </span>
          </>
        )}
      </div>

      {/* ── table / cards ── */}
      {!branchesReady || loadingRows ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-16 flex items-center justify-center gap-3">
          <Loader2 size={24} className="text-[#ff5a1f] animate-spin" />
          <p className="text-sm text-gray-400">Loading data…</p>
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <PieChart size={28} className="text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 max-w-xs">
              No items found matching your filters. Try broadening the date range or clearing filters.
            </p>
            <button
              onClick={handleClear}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <XCircle size={16} />
              Clear all filters
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <MenuSalesTable
              rows={sortedRows}
              loading={false}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              onView={setModalItem}
              branchFilter={branchId}
            />
          </div>

          {/* Mobile card list */}
          <div className="md:hidden">
            <MenuSalesCardList rows={sortedRows} onView={setModalItem} />
          </div>
        </>
      )}

      {/* ── item modal ── */}
      <MenuSalesItemModal item={modalItem} onClose={() => setModalItem(null)} />

      {/* ── toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-[slideIn_0.25s_ease-out] ${
            toast.type === "success" ? "bg-green-500" : "bg-blue-500"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </DashboardLayout>
  );
}
