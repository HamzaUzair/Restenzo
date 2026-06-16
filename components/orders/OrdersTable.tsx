"use client";

import React from "react";
import {
  Eye,
  ClipboardList,
  Loader2,
  Building2,
  Calendar,
  XCircle,
} from "lucide-react";
import type { Order, OrderStatus } from "@/types/order";

const STATUS_PILL: Record<OrderStatus, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Running: "bg-blue-50 text-blue-700",
  Served: "bg-emerald-50 text-emerald-700",
  Paid: "bg-purple-50 text-purple-700",
  Credit: "bg-gray-100 text-gray-600",
  Cancelled: "bg-red-50 text-red-600",
};

const TYPE_PILL: Record<string, string> = {
  "Dine In": "bg-indigo-50 text-indigo-700",
  "Take Away": "bg-sky-50 text-sky-700",
  Delivery: "bg-teal-50 text-teal-700",
};

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString("en-PK", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface OrdersTableProps {
  orders: Order[];
  loading: boolean;
  onView: (order: Order) => void;
  onPay?: (order: Order) => void;
  onCancel?: (order: Order) => void;
  isCashierMode?: boolean;
}

const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  loading,
  onView,
  onPay,
  onCancel,
  isCashierMode = false,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-16 flex flex-col items-center gap-3">
          <Loader2 size={28} className="text-[#ff5a1f] animate-spin" />
          <p className="text-sm text-gray-400">Loading orders…</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <ClipboardList size={28} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 max-w-xs">
            No orders found matching your filters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              {[
                "Order #",
                "Branch",
                "Type",
                "Table",
                "Total",
                "Status",
                "Date",
                "Actions",
              ].map((col) => (
                <th
                  key={col}
                  className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orders.map((order) => (
              <tr
                key={order.id}
                className="hover:bg-gray-50/60 transition-colors"
              >
                {/* Order # */}
                <td className="px-5 py-3.5">
                  <span className="font-bold text-gray-800">
                    {order.orderNo}
                  </span>
                </td>

                {/* Branch */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                    <Building2 size={13} className="text-gray-400" />
                    {order.branchName}
                  </span>
                </td>

                {/* Type */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      TYPE_PILL[order.type] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {order.type}
                  </span>
                </td>

                {/* Table */}
                <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-500">
                  {order.table ?? "—"}
                </td>

                {/* Total */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span className="font-bold text-[#ff5a1f]">
                    PKR {order.total.toLocaleString()}
                  </span>
                </td>

                {/* Status */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      STATUS_PILL[order.status]
                    }`}
                  >
                    {order.status}
                  </span>
                </td>

                {/* Date */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                    <Calendar size={12} className="text-gray-400" />
                    {fmtDate(order.createdAt)}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onView(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ff5a1f]/30 text-[#ff5a1f] text-xs font-semibold hover:bg-[#ff5a1f]/5 transition-colors cursor-pointer"
                    >
                      <Eye size={14} />
                      View
                    </button>
                    {isCashierMode && order.status === "Served" && onPay && (
                      <button
                        onClick={() => onPay(order)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff5a1f] text-white text-xs font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer"
                      >
                        Pay
                      </button>
                    )}
                    {onCancel && order.status === "Pending" && (
                      <button
                        onClick={() => onCancel(order)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <XCircle size={14} />
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrdersTable;
