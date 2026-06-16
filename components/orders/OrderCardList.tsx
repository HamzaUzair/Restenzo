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

interface OrderCardListProps {
  orders: Order[];
  loading: boolean;
  onView: (order: Order) => void;
  onPay?: (order: Order) => void;
  onCancel?: (order: Order) => void;
  isCashierMode?: boolean;
}

const OrderCardList: React.FC<OrderCardListProps> = ({
  orders,
  loading,
  onView,
  onPay,
  onCancel,
  isCashierMode = false,
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="text-[#ff5a1f] animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
          <ClipboardList size={28} className="text-gray-400" />
        </div>
        <p className="text-sm text-gray-500 max-w-xs">
          No orders found matching your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <div
          key={order.id}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
        >
          {/* Top: order no + status */}
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-gray-800 text-sm">
              {order.orderNo}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                STATUS_PILL[order.status]
              }`}
            >
              {order.status}
            </span>
          </div>

          {/* Info rows */}
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-gray-500">
                <Building2 size={12} className="text-gray-400" />
                {order.branchName}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  TYPE_PILL[order.type] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {order.type}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-gray-500">
                <Calendar size={12} className="text-gray-400" />
                {fmtDate(order.createdAt)}
              </span>
              {order.table && (
                <span className="text-gray-500">Table: {order.table}</span>
              )}
            </div>
          </div>

          {/* Bottom: total + view btn */}
          <div className="flex items-center justify-between pt-2.5 border-t border-gray-50">
            <span className="font-bold text-[#ff5a1f]">
              PKR {order.total.toLocaleString()}
            </span>
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
          </div>
        </div>
      ))}
    </div>
  );
};

export default OrderCardList;
