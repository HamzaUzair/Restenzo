"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PlusCircle,
  RefreshCw,
  Wallet,
  Loader2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ExpenseFilters from "@/components/expenses/ExpenseFilters";
import ExpenseSummaryCards from "@/components/expenses/ExpenseSummaryCards";
import ExpenseTable from "@/components/expenses/ExpenseTable";
import ExpenseCardList from "@/components/expenses/ExpenseCardList";
import ExpenseModal from "@/components/expenses/ExpenseModal";
import DeleteExpenseModal from "@/components/expenses/DeleteExpenseModal";
import type {
  Expense,
  ExpenseFormData,
  ExpenseBranch,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseListStats,
} from "@/types/expense";
import type { Branch } from "@/types/branch";
import type { AuthSession } from "@/types/auth";
import {
  apiFetch,
  canMutateExpenses,
  getAuthSession,
  isAccountant,
  isBranchFilterLocked,
} from "@/lib/auth-client";
import { useBranchStatus } from "@/lib/use-branch-status";

const emptyStats: ExpenseListStats = {
  scopeCount: 0,
  scopeSum: 0,
  filteredCount: 0,
  filteredSum: 0,
  filteredAvg: 0,
};

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

function buildExpensesQuery(params: {
  branchId: number | "all";
  category: ExpenseCategory | "all";
  paymentMethod: ExpensePaymentMethod | "all";
  dateFrom: string;
  dateTo: string;
  search: string;
}): string {
  const p = new URLSearchParams();
  if (params.branchId !== "all") {
    p.set("branchId", String(params.branchId));
  }
  if (params.category !== "all") p.set("category", params.category);
  if (params.paymentMethod !== "all") p.set("paymentMethod", params.paymentMethod);
  if (params.dateFrom.trim()) p.set("dateFrom", params.dateFrom.trim());
  if (params.dateTo.trim()) p.set("dateTo", params.dateTo.trim());
  if (params.search.trim()) p.set("search", params.search.trim());
  return p.toString();
}

export default function ExpensesPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);

  const [branches, setBranches] = useState<ExpenseBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseListStats>(emptyStats);
  const [dataLoading, setDataLoading] = useState(true);

  const [filterBranchId, setFilterBranchId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "all">("all");
  const [filterPayment, setFilterPayment] = useState<ExpensePaymentMethod | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [addEditOpen, setAddEditOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "success") => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    },
    []
  );

  const branchLocked = isBranchFilterLocked(session);
  // Accountant is a view-only finance role: hide Add / Edit / Delete
  // action UI. `canMutateExpenses` returns false for Accountant and also
  // honors the multi-branch Restaurant Admin read-only head-office rule.
  const baseCanMutate = canMutateExpenses(session);
  const isFinanceViewer = isAccountant(session);

  // Branch status guard: Cashier / Branch Admin / single-branch Restaurant
  // Admin are pinned to one branch, so we freeze Add / Edit / Delete when
  // that branch is Inactive. Multi-branch Restaurant Admin already can't
  // mutate (head-office read-only), so we skip the extra check for them
  // — but the backend still rejects 423 if they try.
  const branchStatus = useBranchStatus(authorized);
  const branchInactive = branchStatus.isInactive;
  const canMutate = baseCanMutate && !branchInactive;

  useEffect(() => {
    if (localStorage.getItem("isAuthenticated") !== "true") {
      router.replace("/login");
    } else {
      setAuthorized(true);
      const s = getAuthSession();
      setSession(s);
      if (s && isBranchFilterLocked(s) && s.branchId != null) {
        setFilterBranchId(s.branchId);
      }
    }
  }, [router]);

  const fetchBranches = useCallback(async () => {
    setBranchesLoading(true);
    try {
      const res = await apiFetch("/api/branches");
      if (!res.ok) throw new Error();
      const all: Branch[] = await res.json();
      const active = all
        .filter((b) => b.status === "Active")
        .map((b) => ({ id: b.branch_id, name: b.branch_name }));
      setBranches(active);
    } catch {
      // silent
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) fetchBranches();
  }, [authorized, fetchBranches]);

  const fetchExpenses = useCallback(async () => {
    setDataLoading(true);
    try {
      const qs = buildExpensesQuery({
        branchId: filterBranchId,
        category: filterCategory,
        paymentMethod: filterPayment,
        dateFrom,
        dateTo,
        search,
      });
      const res = await apiFetch(`/api/expenses?${qs}`);
      if (!res.ok) {
        let msg = "Failed to load expenses";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        pushToast(msg, "error");
        setExpenses([]);
        setStats(emptyStats);
        return;
      }
      const data = await res.json();
      setExpenses(data.expenses ?? []);
      setStats(data.stats ?? emptyStats);
    } catch {
      pushToast("Failed to load expenses", "error");
      setExpenses([]);
      setStats(emptyStats);
    } finally {
      setDataLoading(false);
    }
  }, [
    filterBranchId,
    filterCategory,
    filterPayment,
    dateFrom,
    dateTo,
    search,
    pushToast,
  ]);

  useEffect(() => {
    if (!authorized) return;
    void fetchExpenses();
  }, [authorized, fetchExpenses]);

  const handleRefresh = () => {
    void fetchExpenses();
    pushToast("Expenses refreshed.", "info");
  };

  const openAdd = () => {
    setEditExpense(null);
    setAddEditOpen(true);
  };

  const openEdit = (exp: Expense) => {
    setEditExpense(exp);
    setAddEditOpen(true);
  };

  const handleSubmitExpense = async (data: ExpenseFormData) => {
    const branchId = Number(data.branchId);
    const payload = {
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category.trim(),
      branchId,
      amount: Number(data.amount),
      paymentMethod: data.paymentMethod,
      invoiceNo: data.invoiceNo.trim() || null,
      date: data.date,
    };

    try {
      if (editExpense) {
        const res = await apiFetch(`/api/expenses/${editExpense.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          pushToast(typeof j.error === "string" ? j.error : "Could not update expense", "error");
          return;
        }
        pushToast("Expense updated successfully!", "success");
      } else {
        const res = await apiFetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          pushToast(typeof j.error === "string" ? j.error : "Could not create expense", "error");
          return;
        }
        pushToast("Expense created successfully!", "success");
      }
      setAddEditOpen(false);
      setEditExpense(null);
      await fetchExpenses();
    } catch {
      pushToast("Request failed", "error");
    }
  };

  const openDelete = (exp: Expense) => {
    setDeleteExpense(exp);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteExpense) return;
    try {
      const res = await apiFetch(`/api/expenses/${deleteExpense.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        pushToast(typeof j.error === "string" ? j.error : "Could not delete expense", "error");
        return;
      }
      pushToast("Expense deleted.", "success");
      setDeleteOpen(false);
      setDeleteExpense(null);
      await fetchExpenses();
    } catch {
      pushToast("Request failed", "error");
    }
  };

  const filtersActive =
    filterBranchId !== "all" ||
    filterCategory !== "all" ||
    filterPayment !== "all" ||
    dateFrom.trim() !== "" ||
    dateTo.trim() !== "" ||
    search.trim() !== "";

  const clearFilters = () => {
    if (!branchLocked) setFilterBranchId("all");
    setFilterCategory("all");
    setFilterPayment("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <DashboardLayout title="Expenses">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff5a1f]/10 flex items-center justify-center">
            <Wallet size={22} className="text-[#ff5a1f]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Expense Management</h1>
            <p className="text-sm text-gray-500">
              Manage and track operational expenses across branches
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          {!isFinanceViewer && (
            <button
              onClick={openAdd}
              disabled={branches.length === 0 || !canMutate}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusCircle size={15} />
              Add Expense
            </button>
          )}
        </div>
      </div>

      {/* Inactive banner rendered globally by DashboardLayout; the
          `branchInactive` flag still gates the Add/Edit/Delete buttons
          and the read-only banner below. */}

      {session && !canMutate && !branchInactive && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 mb-6 text-sm text-slate-700">
          <AlertTriangle size={16} className="shrink-0 text-amber-500" />
          {isFinanceViewer
            ? "Accountant is a view-only finance role. You can browse, search, and filter expenses but cannot add, edit, or delete them."
            : "Restaurant Admin is view-only for multi-branch restaurants. Branch Admins can add or edit expenses for their branch."}
        </div>
      )}

      {!branchesLoading && branches.length === 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 mb-6 text-sm text-amber-700">
          <AlertTriangle size={16} className="shrink-0" />
          No active branches found. Please create an active branch first to add expenses.
        </div>
      )}

      <ExpenseFilters
        branches={branches}
        branchesLoading={branchesLoading}
        branchId={filterBranchId}
        onBranchChange={setFilterBranchId}
        branchLocked={branchLocked}
        search={search}
        onSearchChange={setSearch}
        category={filterCategory}
        onCategoryChange={setFilterCategory}
        paymentMethod={filterPayment}
        onPaymentMethodChange={setFilterPayment}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      <ExpenseSummaryCards stats={stats} />

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">
          Showing{" "}
          <span className="font-semibold text-gray-600">{stats.filteredCount}</span>{" "}
          {stats.filteredCount === 1 ? "expense" : "expenses"}
          {filterBranchId !== "all" && (
            <>
              {" "}
              in{" "}
              <span className="font-semibold text-gray-600">
                {branches.find((b) => b.id === filterBranchId)?.name}
              </span>
            </>
          )}
          {search.trim() && (
            <>
              {" "}
              matching{" "}
              <span className="font-semibold text-gray-600">&quot;{search}&quot;</span>
            </>
          )}
        </p>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-xs text-[#ff5a1f] font-semibold hover:underline cursor-pointer"
          >
            <XCircle size={13} />
            Clear filters
          </button>
        )}
      </div>

      {!dataLoading && stats.filteredCount === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Wallet size={28} className="text-gray-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-700 mb-1">No expenses found</p>
            <p className="text-sm text-gray-400">
              {stats.scopeCount > 0
                ? "Try adjusting your filters or search term."
                : isFinanceViewer
                  ? "No expenses have been recorded for this branch yet."
                  : 'Click "Add Expense" to create your first entry.'}
            </p>
          </div>
          {stats.scopeCount === 0 &&
            branches.length > 0 &&
            canMutate &&
            !isFinanceViewer && (
              <button
                onClick={openAdd}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors shadow-sm cursor-pointer"
              >
                <PlusCircle size={15} />
                Add Expense
              </button>
            )}
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <ExpenseTable
              expenses={expenses}
              loading={dataLoading}
              onEdit={openEdit}
              onDelete={openDelete}
              canMutate={canMutate}
            />
          </div>
          <div className="block md:hidden">
            {dataLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="text-[#ff5a1f] animate-spin" />
              </div>
            ) : (
              <ExpenseCardList
                expenses={expenses}
                onEdit={openEdit}
                onDelete={openDelete}
                canMutate={canMutate}
              />
            )}
          </div>
        </>
      )}

      <ExpenseModal
        isOpen={addEditOpen}
        onClose={() => {
          setAddEditOpen(false);
          setEditExpense(null);
        }}
        onSubmit={handleSubmitExpense}
        editExpense={editExpense}
        branches={branches}
        branchesLoading={branchesLoading}
        branchLocked={branchLocked}
      />

      <DeleteExpenseModal
        isOpen={deleteOpen}
        expense={deleteExpense}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteExpense(null);
        }}
        onConfirm={confirmDelete}
      />

      <div className="fixed bottom-4 right-4 z-[120] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white animate-slide-in-right ${
              t.type === "success"
                ? "bg-green-600"
                : t.type === "error"
                  ? "bg-red-600"
                  : "bg-blue-600"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
