"use client";

import React from "react";
import {
  X,
  Hash,
  Truck,
  CreditCard,
  Calendar,
  Building2,
  Grid3X3,
  Receipt,
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
  "Dine In": "bg-indigo-100 text-indigo-700",
  "Take Away": "bg-sky-100 text-sky-700",
  Delivery: "bg-teal-100 text-teal-700",
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

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onViewReceipt: () => void;
}

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  isOpen,
  onClose,
  order,
  onViewReceipt,
}) => {
  if (!isOpen || !order) return null;

  const subtotal = order.items.reduce((s, it) => s + it.price * it.qty, 0);
  const resolvedSubtotal = order.subtotal ?? subtotal;
  const serviceChargePercent = order.serviceChargePercent ?? 5;
  const gstPercent = order.gstPercent ?? 0;
  const gstAmount = order.gstAmount ?? 0;
  const discountDisplayLabel =
    order.discount > 0
      ? order.discountType === "Percentage" && (order.discountValue ?? 0) > 0
        ? `${order.discountValue}%`
        : `PKR ${order.discount.toLocaleString()}`
      : "0";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-[#ff5a1f] rounded-full" />
            <h2 className="text-lg font-bold text-gray-800">Order Details</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Order Number */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[10px] font-semibold text-[#ff5a1f] uppercase tracking-wider mb-1">
                Order Number
              </p>
              <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                <Hash size={14} className="text-gray-400" />
                {order.orderNo}
              </p>
            </div>

            {/* Order Type */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[10px] font-semibold text-[#ff5a1f] uppercase tracking-wider mb-1">
                Order Type
              </p>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  TYPE_PILL[order.type] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                <Truck size={12} />
                {order.type}
              </span>
            </div>

            {/* Status */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[10px] font-semibold text-[#ff5a1f] uppercase tracking-wider mb-1">
                Status
              </p>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  STATUS_PILL[order.status]
                }`}
              >
                {order.status}
              </span>
            </div>

            {/* Payment Mode */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[10px] font-semibold text-[#ff5a1f] uppercase tracking-wider mb-1">
                Payment Mode
              </p>
              <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                <CreditCard size={14} className="text-gray-400" />
                {order.paymentMode}
              </p>
            </div>

            {/* Payment Reference ID — Card / Online only, hidden for Cash */}
            {order.paymentReferenceId && order.paymentReferenceId.trim().length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5 col-span-2">
                <p className="text-[10px] font-semibold text-[#ff5a1f] uppercase tracking-wider mb-1">
                  {order.paymentMode === "Card"
                    ? "Card Invoice ID"
                    : order.paymentMode === "Online"
                    ? "Online Payment ID"
                    : "Payment Reference ID"}
                </p>
                <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800 break-all">
                  <CreditCard size={14} className="text-gray-400 shrink-0" />
                  {order.paymentReferenceId}
                </p>
              </div>
            )}

            {/* Branch */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[10px] font-semibold text-[#ff5a1f] uppercase tracking-wider mb-1">
                Branch
              </p>
              <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                <Building2 size={14} className="text-gray-400" />
                {order.branchName}
              </p>
            </div>

            {/* Date */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5">
              <p className="text-[10px] font-semibold text-[#ff5a1f] uppercase tracking-wider mb-1">
                Date
              </p>
              <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                <Calendar size={14} className="text-gray-400" />
                {fmtDate(order.createdAt)}
              </p>
            </div>

            {/* Table (only dine in) */}
            {order.table && (
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5 col-span-2">
                <p className="text-[10px] font-semibold text-[#ff5a1f] uppercase tracking-wider mb-1">
                  Table
                </p>
                <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
                  <Grid3X3 size={14} className="text-gray-400" />
                  {order.table}
                </p>
              </div>
            )}
          </div>

          {/* ── Order Items ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-[#ff5a1f] rounded-full" />
              <h3 className="text-sm font-bold text-gray-800">Order Items</h3>
            </div>

            <div className="rounded-xl border border-gray-100 overflow-hidden">
              {order.items.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    idx > 0 ? "border-t border-gray-50" : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {item.name}
                      {item.variationName ? ` (${item.variationName})` : ""}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      PKR {item.price.toLocaleString()} × {item.qty}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-gray-800">
                    PKR {(item.price * item.qty).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Totals ── */}
          <div className="rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Subtotal:</span>
              <span className="font-medium text-gray-700">
                PKR {resolvedSubtotal.toLocaleString()}
              </span>
            </div>
            {order.discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Discount:</span>
                <span className="font-medium text-red-500">{discountDisplayLabel}</span>
              </div>
            )}
            {order.discount > 0 && order.discountReason && (
              <div className="flex items-start justify-between text-sm gap-3">
                <span className="text-gray-500">Discount Reason:</span>
                <span className="font-medium text-gray-700 text-right">
                  {order.discountReason}
                </span>
              </div>
            )}
            {order.serviceCharge > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Service Charge ({serviceChargePercent}%):</span>
                <span className="font-medium text-gray-700">
                  +PKR {order.serviceCharge.toLocaleString()}
                </span>
              </div>
            )}
            {gstAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">GST ({gstPercent}%):</span>
                <span className="font-medium text-gray-700">+PKR {gstAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-dashed border-gray-200">
              <span className="text-base font-bold text-gray-800">Total:</span>
              <span className="text-lg font-bold text-[#ff5a1f]">
                PKR {order.total.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onViewReceipt}
            disabled={!order.paid}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title={order.paid ? "View paid receipt" : "Receipt available only for paid orders"}
          >
            <Receipt size={16} />
            View Paid Receipt
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsModal;
