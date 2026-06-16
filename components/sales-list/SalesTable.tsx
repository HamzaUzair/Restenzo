"use client";

import React from "react";
import {
  Eye,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import type { SaleOrder, SaleStatus, OrderType, PaymentMethod, SortField, SortDir } from "@/types/salesList";

/* ── badge maps ── */
const STATUS_BADGE: Record<SaleStatus, string> = {
  Paid: "bg-green-50 text-green-700",
  Pending: "bg-amber-50 text-amber-700",
  Running: "bg-blue-50 text-blue-700",
  Served: "bg-purple-50 text-purple-700",
  Cancelled: "bg-red-50 text-red-700",
  Credit: "bg-gray-100 text-gray-600",
};
const TYPE_BADGE: Record<OrderType, string> = {
  "Dine In": "bg-indigo-50 text-indigo-700",
  "Take Away": "bg-teal-50 text-teal-700",
  Delivery: "bg-pink-50 text-pink-700",
};
const PAY_BADGE: Record<PaymentMethod, string> = {
  Cash: "bg-green-50 text-green-700",
  Card: "bg-blue-50 text-blue-700",
  Online: "bg-purple-50 text-purple-700",
  Credit: "bg-gray-100 text-gray-600",
};

function fmtDate(ts: number) {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${mon} ${year}, ${hh}:${mm}`;
}

function fmtPkr(n: number) {
  return "PKR " + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

interface SalesTableProps {
  orders: SaleOrder[];
  loading: boolean;
  onView: (o: SaleOrder) => void;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

const SalesTable: React.FC<SalesTableProps> = ({
  orders,
  loading,
  onView,
  sortField,
  sortDir,
  onSort,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center gap-3">
        <Loader2 size={28} className="text-[#ff5a1f] animate-spin" />
        <p className="text-sm text-gray-400">Loading transactions…</p>
      </div>
    );
  }

  const sortIcon = (field: SortField) => (
    <button
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-0.5 cursor-pointer hover:text-[#ff5a1f] transition-colors"
      title={`Sort by ${field}`}
    >
      <ArrowUpDown
        size={13}
        className={sortField === field ? "text-[#ff5a1f]" : "text-gray-300"}
      />
      {sortField === field && (
        <span className="text-[9px] font-bold text-[#ff5a1f]">
          {sortDir === "asc" ? "↑" : "↓"}
        </span>
      )}
    </button>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50/90 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Order ID
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Branch
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <span className="inline-flex items-center gap-1">
                  Time {sortIcon("time")}
                </span>
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Payment
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <span className="inline-flex items-center gap-1">
                  Total {sortIcon("total")}
                </span>
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="text-center px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orders.map((o, idx) => (
              <tr
                key={o.id}
                className={`hover:bg-[#ff5a1f]/[0.02] transition-colors ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}
              >
                <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-gray-800 text-xs">
                  {o.orderNo}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600">
                  {o.branchName}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-500">
                  {fmtDate(o.createdAt)}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_BADGE[o.type]}`}
                  >
                    {o.type}
                  </span>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${PAY_BADGE[o.paymentMethod]}`}
                  >
                    {o.paymentMethod}
                  </span>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap font-bold text-gray-800 text-xs">
                  {fmtPkr(o.total)}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[o.status]}`}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-center whitespace-nowrap">
                  <button
                    onClick={() => onView(o)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ff5a1f]/30 text-[#ff5a1f] text-xs font-semibold hover:bg-[#ff5a1f]/5 transition-colors cursor-pointer"
                  >
                    <Eye size={13} />
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesTable;
