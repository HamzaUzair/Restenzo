"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  RefreshCw,
  Download,
  Loader2,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DayEndToolbar, { type DayEndStatusFilter } from "@/components/dayend/DayEndToolbar";
import DayStatusCard from "@/components/dayend/DayStatusCard";
import SummaryStats from "@/components/dayend/SummaryStats";
import PaymentBreakdown from "@/components/dayend/PaymentBreakdown";
import ExpenseSummary from "@/components/dayend/ExpenseSummary";
import NetCalculation from "@/components/dayend/NetCalculation";
import TopSellingItems from "@/components/dayend/TopSellingItems";
import HourlySales from "@/components/dayend/HourlySales";
import CloseDayModal from "@/components/dayend/CloseDayModal";
import DayEndHistoryTable from "@/components/dayend/DayEndHistoryTable";
import type { Branch } from "@/types/branch";
import type {
  DayEndSummary,
  DayEndStats,
  PaymentBreakdown as PaymentBreakdownType,
  ExpenseEntry,
  TopSellingItem,
  HourlySales as HourlySalesType,
  DayEndRecord,
  DayEndResponse,
} from "@/types/dayend";
import type { AuthSession } from "@/types/auth";
import {
  apiFetch,
  canEditOperational,
  getAuthSession,
  isBranchFilterLocked,
} from "@/lib/auth-client";
import { useBranchStatus } from "@/lib/use-branch-status";

interface Toast {
  id: number;
  message: string;
  type: "success" | "info" | "error";
}

const emptyStats: DayEndStats = {
  totalOrders: 0,
  totalRevenue: 0,
  totalExpenses: 0,
  netRevenue: 0,
  averageOrderValue: 0,
  cancelledOrders: 0,
  grossSales: 0,
  discounts: 0,
  serviceCharges: 0,
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function DayEndPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  const [summary, setSummary] = useState<DayEndSummary | null>(null);
  const [stats, setStats] = useState<DayEndStats>(emptyStats);
  const [payments, setPayments] = useState<PaymentBreakdownType[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [topItems, setTopItems] = useState<TopSellingItem[]>([]);
  const [topItemsByQuantity, setTopItemsByQuantity] = useState<TopSellingItem[]>([]);
  const [topItemsBySales, setTopItemsBySales] = useState<TopSellingItem[]>([]);
  const [hourlySales, setHourlySales] = useState<HourlySalesType[]>([]);
  const [history, setHistory] = useState<DayEndRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [filterBranchId, setFilterBranchId] = useState<number | "all">("all");
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [statusFilter, setStatusFilter] = useState<DayEndStatusFilter>("all");

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3000);
  }, []);

  const branchLocked = isBranchFilterLocked(session);
  const baseCanClose = canEditOperational(session);

  // Branch-status guard: freeze Close Day on Inactive branches. Only runs
  // when the viewer is pinned to a single branch (Cashier / Branch Admin /
  // single-branch Restaurant Admin); multi-branch RA isn't a closer here.
  const branchStatus = useBranchStatus(authorized);
  const branchInactive = branchStatus.isInactive;
  const canClose = baseCanClose && !branchInactive;

  /* ── Auth guard ── */
  useEffect(() => {
    if (localStorage.getItem("isAuthenticated") !== "true") {
      router.replace("/login");
      return;
    }
    setAuthorized(true);
    const s = getAuthSession();
    setSession(s);
    if (s && isBranchFilterLocked(s) && s.branchId != null) {
      setFilterBranchId(s.branchId);
    }
  }, [router]);

  /* ── Fetch branches ── */
  const fetchBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      const res = await apiFetch("/api/branches");
      if (!res.ok) throw new Error();
      const data: Branch[] = await res.json();
      const active = data.filter((b) => b.status === "Active");
      setBranches(active);
      // If restaurant admin / super admin with no selection, pick first branch so
      // the rest of the page has something to show.
      if (filterBranchId === "all" && !branchLocked && active.length === 1) {
        setFilterBranchId(active[0].branch_id);
      }
    } catch {
      // silent
    } finally {
      setBranchesLoading(false);
    }
  }, [filterBranchId, branchLocked]);

  useEffect(() => {
    if (authorized) fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  /* ── Effective branch: for "all" (super/restaurant admin) fall back to first. ── */
  const effectiveBranchId = useMemo<number | null>(() => {
    if (filterBranchId !== "all") return filterBranchId;
    return branches[0]?.branch_id ?? null;
  }, [filterBranchId, branches]);

  /* ── Load day end data for selected branch + date ── */
  const loadDayEndData = useCallback(async () => {
    if (!effectiveBranchId) {
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    try {
      const qs = new URLSearchParams({
        branchId: String(effectiveBranchId),
        date: selectedDate,
      });
      const res = await apiFetch(`/api/dayend?${qs.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast(typeof j.error === "string" ? j.error : "Failed to load day end data", "error");
        setSummary(null);
        setStats(emptyStats);
        setPayments([]);
        setExpenses([]);
        setTopItems([]);
        setTopItemsByQuantity([]);
        setTopItemsBySales([]);
        setHourlySales([]);
        return;
      }
      const data = (await res.json()) as DayEndResponse;
      setSummary(data.summary);
      setStats(data.stats);
      setPayments(data.payments);
      setExpenses(data.expenses);
      setTopItems(data.topItems);
      // Fall back to the legacy single list when an older API version
      // doesn't yet emit the dual rankings (e.g. mid-deploy). The legacy
      // list is sales-ranked, so we mirror it into both cards rather than
      // leave one empty by accident.
      setTopItemsByQuantity(data.topItemsByQuantity ?? data.topItems);
      setTopItemsBySales(data.topItemsBySales ?? data.topItems);
      setHourlySales(data.hourlySales);
    } catch {
      showToast("Failed to load day end data", "error");
    } finally {
      setDataLoading(false);
    }
  }, [effectiveBranchId, selectedDate, showToast]);

  useEffect(() => {
    if (!authorized || branchesLoading) return;
    void loadDayEndData();
  }, [authorized, branchesLoading, loadDayEndData]);

  /* ── Load history ── */
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterBranchId !== "all") qs.set("branchId", String(filterBranchId));
      qs.set("limit", "50");
      const res = await apiFetch(`/api/dayend/history?${qs.toString()}`);
      if (!res.ok) {
        setHistory([]);
        return;
      }
      const data = await res.json();
      setHistory(Array.isArray(data.records) ? (data.records as DayEndRecord[]) : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [filterBranchId]);

  useEffect(() => {
    if (!authorized) return;
    void loadHistory();
  }, [authorized, loadHistory]);

  /* ── Filtered history (status pill is client-side since all stored rows are "closed") ── */
  const filteredHistory = useMemo(() => {
    if (statusFilter === "all" || statusFilter === "closed") return history;
    // No "open" records are persisted yet, so filter yields nothing.
    return history.filter((r) => r.status === "open");
  }, [history, statusFilter]);

  /* ── Handlers ── */
  const handleCloseDay = () => {
    setCloseModalOpen(true);
  };

  const handleCloseDayConfirm = async (note: string) => {
    if (!effectiveBranchId) {
      showToast("Select a branch first", "error");
      return;
    }
    setClosing(true);
    try {
      const res = await apiFetch("/api/dayend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: effectiveBranchId,
          date: selectedDate,
          note: note.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast(typeof j.error === "string" ? j.error : "Failed to close day", "error");
        return;
      }
      showToast("Day closed successfully", "success");
      setCloseModalOpen(false);
      await Promise.all([loadDayEndData(), loadHistory()]);
    } catch {
      showToast("Failed to close day", "error");
    } finally {
      setClosing(false);
    }
  };

  const handleExportReport = () => {
    if (!summary) {
      showToast("Nothing to export yet", "info");
      return;
    }
    const lines: string[] = [];
    lines.push(`Day End Report`);
    lines.push(
      `Branch,${csvEscape(summary.branchName)},Business Date,${csvEscape(summary.businessDate)}`
    );
    lines.push(`Status,${csvEscape(summary.status)}`);
    if (summary.closedBy) lines.push(`Closed By,${csvEscape(summary.closedBy)}`);
    if (summary.closedAt) lines.push(`Closed At,${csvEscape(summary.closedAt)}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Orders,${stats.totalOrders}`);
    lines.push(`Gross Sales,${stats.grossSales}`);
    lines.push(`Discounts,${stats.discounts}`);
    lines.push(`Service Charges,${stats.serviceCharges}`);
    lines.push(`Total Revenue,${stats.totalRevenue}`);
    lines.push(`Total Expenses,${stats.totalExpenses}`);
    lines.push(`Net Revenue,${stats.netRevenue}`);
    lines.push(`Avg Order Value,${stats.averageOrderValue}`);
    lines.push(`Cancelled Orders,${stats.cancelledOrders}`);
    lines.push("");
    lines.push("Payment Method,Amount,Count,Percentage");
    for (const p of payments) {
      lines.push(`${csvEscape(p.method)},${p.amount},${p.count},${p.percentage.toFixed(2)}`);
    }
    lines.push("");
    lines.push("Expenses");
    lines.push("Title,Category,Amount,Time");
    for (const e of expenses) {
      lines.push(`${csvEscape(e.title)},${csvEscape(e.category)},${e.amount},${csvEscape(e.createdAt)}`);
    }
    lines.push("");
    lines.push("Top Selling Items by Quantity");
    lines.push("Rank,Name,Category,Quantity,Revenue");
    (topItemsByQuantity.length ? topItemsByQuantity : topItems).forEach((t, i) => {
      lines.push(
        `${i + 1},${csvEscape(t.name)},${csvEscape(t.category ?? "")},${t.quantity},${t.revenue}`
      );
    });
    lines.push("");
    lines.push("Top Selling Items by Sales");
    lines.push("Rank,Name,Category,Quantity,Revenue");
    (topItemsBySales.length ? topItemsBySales : topItems).forEach((t, i) => {
      lines.push(
        `${i + 1},${csvEscape(t.name)},${csvEscape(t.category ?? "")},${t.quantity},${t.revenue}`
      );
    });
    lines.push("");
    lines.push("Hourly Sales");
    lines.push("Hour,Orders,Revenue");
    for (const h of hourlySales) {
      lines.push(`${csvEscape(h.hour)},${h.orders},${h.revenue}`);
    }

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dayend_${summary.branchName.replace(/\s+/g, "_")}_${summary.businessDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Report exported", "success");
  };

  const handleViewHistory = (record: DayEndRecord) => {
    if (!branchLocked) setFilterBranchId(record.branchId);
    setSelectedDate(record.date);
    showToast(`Viewing ${record.branchName} – ${record.date}`, "info");
  };

  const handleRefresh = () => {
    void Promise.all([loadDayEndData(), loadHistory()]);
    showToast("Refreshed", "info");
  };

  const hasBranch = !!effectiveBranchId && !!summary;
  const isDayClosed = summary?.status === "closed";
  const maxHourlyRevenue = Math.max(...hourlySales.map((h) => h.revenue), 1);

  /* ── Loading ── */
  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <DashboardLayout title="Day End">
      {/* Inactive banner rendered globally by DashboardLayout;
          `branchInactive` still disables Close Day below. */}
      {/* Header Card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Day End Management</h2>
            <p className="text-sm text-gray-500 mt-1">
              Review daily sales, expenses, and branch performance before closing the day
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRefresh}
              disabled={dataLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={16} className={dataLoading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={handleExportReport}
              disabled={!hasBranch}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download size={16} />
              Export Report
            </button>
            {canClose && (
              <button
                onClick={handleCloseDay}
                disabled={!hasBranch || isDayClosed || dataLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CalendarCheck size={18} />
                {isDayClosed ? "Day Already Closed" : "Close Day"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <DayEndToolbar
        branches={branches}
        branchesLoading={branchesLoading}
        filterBranchId={filterBranchId}
        onBranchChange={setFilterBranchId}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        branchLocked={branchLocked}
      />

      {/* Main content */}
      {dataLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="text-[#ff5a1f] animate-spin" />
        </div>
      ) : !hasBranch || !summary ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <CalendarCheck size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Select a branch to view day end summary</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <DayStatusCard summary={summary} />
          </div>

          <div className="mb-6">
            <SummaryStats stats={stats} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <PaymentBreakdown payments={payments} />
            <ExpenseSummary totalExpenses={stats.totalExpenses} expenses={expenses} />
            <NetCalculation
              totalSales={stats.totalRevenue}
              totalExpenses={stats.totalExpenses}
              netRevenue={stats.netRevenue}
            />
          </div>

          {/* Top Selling Items — split into two ranked cards (by quantity
              + by sales) on its own row so the Hourly Sales chart never
              has to compete for horizontal space below. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <TopSellingItems variant="quantity" items={topItemsByQuantity} />
            <TopSellingItems variant="sales" items={topItemsBySales} />
          </div>

          <div className="mb-6">
            <HourlySales data={hourlySales} maxRevenue={maxHourlyRevenue} />
          </div>

          <div className="mb-6">
            <DayEndHistoryTable
              records={filteredHistory}
              loading={historyLoading}
              onView={handleViewHistory}
            />
          </div>
        </>
      )}

      {/* Close Day Modal */}
      {summary && (
        <CloseDayModal
          isOpen={closeModalOpen}
          onClose={() => setCloseModalOpen(false)}
          onConfirm={handleCloseDayConfirm}
          closing={closing}
          branchName={summary.branchName}
          businessDate={summary.businessDate}
          netRevenue={stats.netRevenue}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[120] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
              t.type === "success" ? "bg-green-600" : t.type === "error" ? "bg-red-600" : "bg-blue-600"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
