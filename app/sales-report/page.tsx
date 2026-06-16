"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Download,
  FileText,
  BarChart3,
  Loader2,
  CheckCircle2,
  X,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ReportFilters from "@/components/sales-report/ReportFilters";
import KPICards from "@/components/sales-report/KPICards";
import AccountingBreakdown from "@/components/sales-report/AccountingBreakdown";
import DailySummaryTable from "@/components/sales-report/DailySummaryTable";
import DailySummaryCards from "@/components/sales-report/DailySummaryCards";
import { downloadReportCsv } from "@/lib/exportReportCsv";
import { exportSalesReportPdf } from "@/lib/pdf/export-sales-report";
import type {
  ReportOrder,
  ReportKPIs,
  DailySummary,
  ReportBranch,
  TimeRange,
  SortField,
  SortDir,
} from "@/types/salesReport";
import type { Branch } from "@/types/branch";
import { apiFetch, getAuthSession, getEffectiveBranchId } from "@/lib/auth-client";

/* ── toast ── */
interface Toast {
  id: number;
  message: string;
  type: "success" | "info";
}

/* ── date utils ── */
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeek() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Mon
  return d;
}
function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d;
}

function fmtPkr(n: number) {
  return "PKR " + n.toLocaleString("en-PK");
}

export default function SalesReportPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  /* ── Branches (from API) ── */
  const [branches, setBranches] = useState<ReportBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [lockedBranchId, setLockedBranchId] = useState<number | null>(null);

  /* ── Data ── */
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [kpis, setKpis] = useState<ReportKPIs>({
    grossSales: 0,
    netRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    cashAmount: 0,
    cashCount: 0,
    cardAmount: 0,
    cardCount: 0,
    onlineAmount: 0,
    onlineCount: 0,
    creditAmount: 0,
    creditCount: 0,
    taxCollected: 0,
    discountsGiven: 0,
    discountCount: 0,
    refundsAmount: 0,
    refundCount: 0,
    serviceCharges: 0,
  });
  const [dailyRows, setDailyRows] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  /* ── Filters ── */
  const [timeRange, setTimeRange] = useState<TimeRange>("this_month");
  const [dateFrom, setDateFrom] = useState(toISO(startOfMonth()));
  const [dateTo, setDateTo] = useState(toISO(new Date()));
  const [branchId, setBranchId] = useState<number | "all">("all");

  /* ── Sort ── */
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* ── Toast ── */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback(
    (message: string, type: "success" | "info" = "info") => {
      const id = Date.now();
      setToasts((p) => [...p, { id, message, type }]);
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3000);
    },
    []
  );

  /* ══════════ Auth ══════════ */
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

  /* ══════════ Fetch branches from API ══════════ */
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    const fetchBranches = async () => {
      setBranchesLoading(true);

      let activeBranches: ReportBranch[] = [];
      try {
        const res = await apiFetch("/api/branches");
        if (!res.ok) throw new Error();
        const data: Branch[] = await res.json();
        activeBranches = data
          .filter((b) => b.status === "Active")
          .map((b) => ({ id: b.branch_id, name: b.branch_name }));
      } catch {
        // API failed — keep empty
      }

      if (cancelled) return;
      setBranches(activeBranches);
      setBranchesLoading(false);
    };

    fetchBranches();
    return () => { cancelled = true; };
  }, [authorized]);

  /* ══════════ Time range → dates ══════════ */
  const handleTimeRange = useCallback(
    (tr: TimeRange) => {
      setTimeRange(tr);
      const today = toISO(new Date());
      switch (tr) {
        case "today":
          setDateFrom(today);
          setDateTo(today);
          break;
        case "this_week":
          setDateFrom(toISO(startOfWeek()));
          setDateTo(today);
          break;
        case "this_month":
          setDateFrom(toISO(startOfMonth()));
          setDateTo(today);
          break;
        case "custom":
          // keep existing dates
          break;
      }
    },
    []
  );

  /* ══════════ Clear ══════════ */
  const clearFilters = useCallback(() => {
    handleTimeRange("this_month");
    setBranchId(lockedBranchId ?? "all");
    setSortField(null);
  }, [handleTimeRange, lockedBranchId]);

  const hasActive =
    (!lockedBranchId && branchId !== "all") || timeRange !== "this_month";

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    const fetchReport = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (branchId !== "all") params.set("branchId", String(branchId));
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        params.set("includeCancelled", "false");

        const res = await apiFetch(`/api/reports/sales-report?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch report");
        const data = (await res.json()) as {
          orders: ReportOrder[];
          kpis: ReportKPIs;
          dailyRows: DailySummary[];
        };
        if (!cancelled) {
          setOrders(data.orders);
          setKpis(data.kpis);
          setDailyRows(data.dailyRows);
        }
      } catch {
        if (!cancelled) {
          setOrders([]);
          setKpis({
            grossSales: 0,
            netRevenue: 0,
            totalOrders: 0,
            avgOrderValue: 0,
            cashAmount: 0,
            cashCount: 0,
            cardAmount: 0,
            cardCount: 0,
            onlineAmount: 0,
            onlineCount: 0,
            creditAmount: 0,
            creditCount: 0,
            taxCollected: 0,
            discountsGiven: 0,
            discountCount: 0,
            refundsAmount: 0,
            refundCount: 0,
            serviceCharges: 0,
          });
          setDailyRows([]);
          pushToast("Failed to load report data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchReport();
    return () => {
      cancelled = true;
    };
  }, [authorized, branchId, dateFrom, dateTo, pushToast, refreshTick]);

  const sortedDailyRows = useMemo(() => {
    const rows = [...dailyRows];
    if (!sortField) return rows;
    const mult = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortField === "date") return a.date.localeCompare(b.date) * mult;
      return (a.net - b.net) * mult;
    });
    return rows;
  }, [dailyRows, sortField, sortDir]);

  /* ── Sort handler ── */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  /* ── Export ── */
  const handleExportCsv = () => {
    downloadReportCsv(kpis, sortedDailyRows, `sales-report-${toISO(new Date())}.csv`);
    pushToast(`Exported ${sortedDailyRows.length} daily rows to CSV`);
  };
  const handleExportPdf = () => {
    const session = getAuthSession();
    const branchLabel =
      branchId === "all"
        ? "All"
        : branches.find((b) => b.id === branchId)?.name ?? String(branchId);
    exportSalesReportPdf({
      session,
      filters: {
        branchLabel,
        dateRange: `${dateFrom} → ${dateTo}`,
        includeCancelled: false,
      },
      kpis,
      orders,
      dailyRows: sortedDailyRows,
    });
    pushToast("PDF exported!", "success");
  };
  const handleRefresh = () => {
    setRefreshTick((p) => p + 1);
    pushToast("Report data refreshed");
  };

  /* ══════════ Auth loading ══════════ */
  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <DashboardLayout title="Sales Report">
      {/* ── Toast ── */}
      <div className="fixed top-5 right-5 z-[200] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slideIn_0.25s_ease-out] ${
              t.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-blue-50 text-blue-700 border border-blue-200"
            }`}
          >
            <CheckCircle2 size={16} />
            {t.message}
            <button
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              className="ml-1 p-0.5 rounded hover:bg-black/5 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Sales Report</h2>
            <p className="text-sm text-gray-500 mt-1">
              Financial Summary accounting report for totals and payments
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Download size={15} />
              Export CSV
            </button>
            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <FileText size={15} />
              Export PDF
            </button>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <ReportFilters
        branches={branches}
        branchesLoading={branchesLoading}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        branchId={branchId}
        onBranchChange={setBranchId}
        lockBranchId={lockedBranchId}
        onClear={clearFilters}
        hasActive={hasActive}
      />

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-20 flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-[#ff5a1f] animate-spin" />
          <p className="text-sm text-gray-400">Generating report…</p>
        </div>
      ) : (
        <>
          {/* ── Filtered count ── */}
          <div className="flex items-center gap-2 mb-4 px-1">
            <p className="text-xs text-gray-400">
              Filtered results:{" "}
              <span className="font-semibold text-gray-600">
                {orders.length} orders, {fmtPkr(kpis.grossSales)} gross
              </span>
            </p>
          </div>

          {/* ── KPI Cards ── */}
          <KPICards kpis={kpis} />

          {/* ── Accounting Breakdown ── */}
          <AccountingBreakdown kpis={kpis} />

          {/* ── Daily Summary Table ── */}
          <div className="mb-3 flex items-center gap-2 px-1">
            <BarChart3 size={15} className="text-gray-400" />
            <h3 className="text-sm font-bold text-gray-700">Daily Summary</h3>
          </div>

          {sortedDailyRows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <BarChart3 size={28} className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-500 max-w-xs">
                  No data matches your current filters.
                </p>
                <button
                  onClick={clearFilters}
                  className="mt-2 text-xs font-semibold text-[#ff5a1f] hover:underline cursor-pointer"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <DailySummaryTable
                  rows={sortedDailyRows}
                  loading={false}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </div>
              <div className="md:hidden">
                <DailySummaryCards rows={sortedDailyRows} />
              </div>
            </>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
