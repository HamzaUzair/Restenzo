"use client";

import React, { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw,
  ClipboardList,
  Activity,
  CheckCircle2,
  Clock,
  FileText,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import OrdersToolbar from "@/components/orders/OrdersToolbar";
import OrdersTable from "@/components/orders/OrdersTable";
import OrderCardList from "@/components/orders/OrderCardList";
import OrderDetailsModal from "@/components/orders/OrderDetailsModal";
import PaidReceiptModal from "@/components/orders/PaidReceiptModal";
import CashierPaymentModal from "@/components/orders/CashierPaymentModal";
import CancelOrderModal from "@/components/orders/CancelOrderModal";
import type { Branch } from "@/types/branch";
import type { AppRole } from "@/types/auth";
import type { Order, OrderStatus } from "@/types/order";
import { ORDER_STATUSES, ORDER_TAKER_STATUS_FILTER_OPTIONS } from "@/types/order";
import { apiFetch, getAuthSession, isBranchFilterLocked } from "@/lib/auth-client";
import { useBranchStatus } from "@/lib/use-branch-status";
import type { AuthSession } from "@/types/auth";
import { exportOrdersReportPdf } from "@/lib/pdf/export-orders-report";

function OrdersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authorized, setAuthorized] = useState(false);
  const [sessionRole, setSessionRole] = useState<AppRole>("SUPER_ADMIN");
  const [sessionBranchId, setSessionBranchId] = useState<number | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);

  /* ── Branches ── */
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  /* ── Orders ── */
  const [orders, setOrdersState] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  /* ── Filters ── */
  const [filterBranchId, setFilterBranchId] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");

  /* ── Modals ── */
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancelError, setCancelError] = useState("");

  // Branch status guard. Scoped to the viewer's own session branch — so
  // Cashier / Branch Admin / single-branch Restaurant Admin see the banner
  // and Pay is disabled. Multi-branch RA (Head Office) isn't the payment
  // operator here, so their behaviour is unchanged.
  const branchStatus = useBranchStatus(authorized);
  const branchInactive = branchStatus.isInactive;

  /* ══════════════ Auth guard ══════════════ */
  useEffect(() => {
    const session = getAuthSession();
    if (!session) {
      router.replace("/login");
    } else {
      setSession(session);
      setSessionRole(session.role);
      setSessionBranchId(session.branchId ?? null);
      if (
        (session.role === "ORDER_TAKER" ||
          session.role === "RESTAURANT_ADMIN" ||
          session.role === "BRANCH_ADMIN" ||
          session.role === "CASHIER") &&
        session.branchId
      ) {
        setFilterBranchId(session.branchId);
      }
      if (session.role === "CASHIER") {
        setStatusFilter("Served");
      }

      // Deep-link support: allow the dashboard's Order Status Overview
      // cards (and other in-app links) to pre-select a status filter via
      // the `?status=` URL parameter. We only accept the canonical
      // OrderStatus values to avoid arbitrary strings slipping through.
      const statusParam = searchParams?.get("status");
      if (statusParam) {
        if (statusParam === "all") {
          setStatusFilter("all");
        } else if (session.role === "ORDER_TAKER") {
          if (
            (ORDER_TAKER_STATUS_FILTER_OPTIONS as readonly string[]).includes(
              statusParam
            )
          ) {
            setStatusFilter(statusParam as OrderStatus);
          }
        } else if ((ORDER_STATUSES as readonly string[]).includes(statusParam)) {
          setStatusFilter(statusParam as OrderStatus);
        }
      }

      setAuthorized(true);
    }
  }, [router, searchParams]);

  /* ══════════════ Fetch branches ══════════════ */
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

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const params = new URLSearchParams();
      // Branch-pinned roles (OT / BA / Cashier) and single-branch Restaurant
      // Admins must never send "all" — they operate inside one branch by
      // design. Everyone else honours the toolbar selection.
      const effectiveBranchId =
        ((sessionRole === "ORDER_TAKER" ||
          sessionRole === "BRANCH_ADMIN" ||
          sessionRole === "CASHIER") &&
          sessionBranchId) ||
        (isBranchFilterLocked(session) && sessionBranchId)
          ? sessionBranchId
          : filterBranchId;
      if (effectiveBranchId !== "all") params.set("branchId", String(effectiveBranchId));
      // NOTE: Do NOT pass `status` to the API here. We need the full
      // branch-scoped dataset so the status chips can show real per-status
      // counts; the selected chip then filters the visible list on the
      // client. Passing `status` made the API return only one bucket and
      // zeroed every other chip.
      if (search.trim()) params.set("search", search.trim());

      const res = await apiFetch(`/api/orders${params.toString() ? `?${params}` : ""}`);
      if (!res.ok) throw new Error("Failed to load orders");
      const data: Order[] = await res.json();
      setOrdersState(data);
    } catch (error) {
      console.error("Error loading orders:", error);
      setOrdersState([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [filterBranchId, search, sessionRole, sessionBranchId, session]);

  useEffect(() => {
    if (!authorized || branchesLoading) return;
    loadOrders();
  }, [authorized, branchesLoading, loadOrders]);

  /* ══════════════ Refresh handler ══════════════ */
  const handleRefresh = () => {
    void loadOrders();
  };

  const handleExportPdf = () => {
    const session = getAuthSession();
    const branchLabel =
      filterBranchId === "all"
        ? "All"
        : branches.find((b) => b.branch_id === filterBranchId)?.branch_name ??
          String(filterBranchId);
    exportOrdersReportPdf({
      session,
      orders: filteredOrders.map((o) => ({
        orderNo: o.orderNo,
        branchName: o.branchName,
        createdAt: o.createdAt,
        type: o.type,
        paymentMethod: o.paymentMode,
        paid: o.paid,
        status: o.status,
        total: o.total,
      })),
      filters: {
        branchLabel,
        search: search.trim(),
        status: statusFilter === "all" ? "All" : statusFilter,
        paymentMethod: "All",
        dateRange: "—",
      },
    });
  };

  const isOrderTaker = sessionRole === "ORDER_TAKER";
  const canCancelPending =
    sessionRole === "ORDER_TAKER" ||
    sessionRole === "BRANCH_ADMIN" ||
    sessionRole === "RESTAURANT_ADMIN" ||
    sessionRole === "SUPER_ADMIN";

  const statusOptionsForToolbar = isOrderTaker
    ? ORDER_TAKER_STATUS_FILTER_OPTIONS
    : undefined;

  const handleConfirmCancel = async () => {
    if (!cancelOrder) return;
    setCancelError("");
    try {
      const res = await apiFetch(`/api/orders/${cancelOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Cancelled" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setCancelError(
          typeof j.error === "string" ? j.error : "Could not cancel order"
        );
        return;
      }
      setCancelOrder(null);
      await loadOrders();
    } catch {
      setCancelError("Could not cancel order");
    }
  };

  /* ══════════════ Branch-filtered orders (for counts) ══════════════ */
  const branchFiltered = useMemo(() => {
    if (filterBranchId === "all") return orders;
    return orders.filter((o) => o.branchId === filterBranchId);
  }, [orders, filterBranchId]);

  /* ══════════════ Status counts (after branch filter) ══════════════ */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const statuses = statusOptionsForToolbar ?? ORDER_STATUSES;
    statuses.forEach((s) => {
      counts[s] = branchFiltered.filter((o) => o.status === s).length;
    });
    return counts;
  }, [branchFiltered, statusOptionsForToolbar]);

  /* ══════════════ Fully filtered orders ══════════════ */
  // Only the visible list respects the selected status chip; `statusCounts`
  // above intentionally does NOT, so every chip keeps its real count.
  const filteredOrders = useMemo(() => {
    if (statusFilter === "all") return branchFiltered;
    return branchFiltered.filter((o) => o.status === statusFilter);
  }, [branchFiltered, statusFilter]);

  /* ══════════════ Quick stats ══════════════
   *
   * Only the "Today's Orders" card is date-scoped to the current calendar
   * day; Pending / Running / Paid intentionally count the full
   * branch-scoped dataset so the four top cards stay in sync with the
   * status chip row right below them (e.g. "Paid 18"). Previously every
   * card shared the `todayOrders` subset, which zeroed all four cards on
   * any day where no new orders had been placed yet — even when there
   * were 18 paid orders from yesterday still visible in the table.
   */
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    const todayOrders = branchFiltered.filter((o) => o.createdAt >= todayTs);
    return {
      total: todayOrders.length,
      running: branchFiltered.filter((o) => o.status === "Running").length,
      paid: branchFiltered.filter((o) => o.status === "Paid").length,
      pending: branchFiltered.filter((o) => o.status === "Pending").length,
    };
  }, [branchFiltered]);

  /* ══════════════ Loading ══════════════ */
  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-[#ff5a1f] border-t-transparent rounded-full" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Today's Orders",
      value: stats.total,
      icon: <ClipboardList size={20} />,
      bg: "bg-[#ff5a1f]/10",
      color: "text-[#ff5a1f]",
    },
    {
      label: "Pending",
      value: stats.pending,
      icon: <Clock size={20} />,
      bg: "bg-amber-50",
      color: "text-amber-600",
    },
    {
      label: "Running",
      value: stats.running,
      icon: <Activity size={20} />,
      bg: "bg-blue-50",
      color: "text-blue-600",
    },
    {
      label: "Paid",
      value: stats.paid,
      icon: <CheckCircle2 size={20} />,
      bg: "bg-green-50",
      color: "text-green-600",
    },
  ];

  return (
    <DashboardLayout title="Orders">
      {/* Inactive banner rendered globally by DashboardLayout;
          `branchInactive` still hides Pay on the Cashier row buttons. */}
      {/* ── Page Header ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              {sessionRole === "CASHIER"
                ? "Cashier Panel"
                : isOrderTaker
                ? "Orders"
                : "Order Management"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {sessionRole === "CASHIER"
                ? "Handle served orders, collect payments, and print receipts"
                : isOrderTaker
                ? "View pending, running, served, and cancelled orders for your branch"
                : "View and manage all orders with a clean overview"}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <FileText size={16} />
              Export PDF
            </button>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#ff5a1f] text-[#ff5a1f] text-sm font-semibold hover:bg-[#ff5a1f]/5 transition-colors cursor-pointer"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick Stats ── */}
      {!isOrderTaker && !branchesLoading && !ordersLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3"
            >
              <div
                className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0 ${s.color}`}
              >
                {s.icon}
              </div>
              <div>
                <p className="text-xl font-bold text-gray-800">{s.value}</p>
                <p className="text-[11px] text-gray-400 font-medium">
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Toolbar ── */}
      <OrdersToolbar
        branches={branches}
        branchesLoading={branchesLoading}
        filterBranchId={filterBranchId}
        onBranchChange={(v) => {
          if (
            sessionRole === "ORDER_TAKER" ||
            sessionRole === "BRANCH_ADMIN" ||
            isBranchFilterLocked(session)
          )
            return;
          setFilterBranchId(v);
        }}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        statusCounts={statusCounts}
        totalCount={branchFiltered.length}
        branchLocked={
          sessionRole === "ORDER_TAKER" ||
          sessionRole === "BRANCH_ADMIN" ||
          sessionRole === "CASHIER" ||
          isBranchFilterLocked(session)
        }
        statusOptions={statusOptionsForToolbar}
      />

      {cancelError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {cancelError}
        </div>
      )}

      {/* ── Desktop: Table | Mobile: Card list ── */}
      <div className="hidden md:block">
        <OrdersTable
          orders={filteredOrders}
          loading={branchesLoading || ordersLoading}
          onView={setViewOrder}
          onPay={branchInactive ? undefined : setPayOrder}
          onCancel={canCancelPending ? setCancelOrder : undefined}
          isCashierMode={sessionRole === "CASHIER"}
        />
      </div>
      <div className="md:hidden">
        <OrderCardList
          orders={filteredOrders}
          loading={branchesLoading || ordersLoading}
          onView={setViewOrder}
          onPay={branchInactive ? undefined : setPayOrder}
          onCancel={canCancelPending ? setCancelOrder : undefined}
          isCashierMode={sessionRole === "CASHIER"}
        />
      </div>

      {/* ── Order Details Modal ── */}
      <OrderDetailsModal
        isOpen={!!viewOrder}
        onClose={() => setViewOrder(null)}
        order={viewOrder}
        onViewReceipt={() => {
          if (viewOrder) {
            setReceiptOrder(viewOrder);
          }
        }}
      />

      {/* ── Paid Receipt Modal ── */}
      <PaidReceiptModal
        isOpen={!!receiptOrder}
        onClose={() => setReceiptOrder(null)}
        order={receiptOrder}
      />

      <CashierPaymentModal
        isOpen={!!payOrder}
        order={payOrder}
        onClose={() => setPayOrder(null)}
        onPaid={(updatedOrder) => {
          setOrdersState((prev) =>
            prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
          );
          setReceiptOrder(updatedOrder);
        }}
      />

      <CancelOrderModal
        isOpen={!!cancelOrder}
        order={cancelOrder}
        onClose={() => {
          setCancelOrder(null);
          setCancelError("");
        }}
        onConfirm={handleConfirmCancel}
      />
    </DashboardLayout>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageInner />
    </Suspense>
  );
}
