"use client";

import React from "react";
import { X, Printer } from "lucide-react";
import type { Order } from "@/types/order";

function fmtDateTime(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

interface PaidReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
}

const PaidReceiptModal: React.FC<PaidReceiptModalProps> = ({
  isOpen,
  onClose,
  order,
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
        : `PKR ${order.discount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}`
      : "0";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-[#ff5a1f] rounded-full" />
            <h2 className="text-lg font-bold text-gray-800">Paid Receipt</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body — receipt layout */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Receipt card */}
          <div className="border border-dashed border-gray-200 rounded-xl p-5">
            {/* Title */}
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                Restaurant Receipt
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Order #{order.orderNo}
              </p>
              <p className="text-xs text-[#ff5a1f] font-medium mt-0.5">
                Type: {order.type}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Branch: {order.branchName}</p>
              {order.hall || order.table ? (
                <p className="text-xs text-gray-400 mt-0.5">
                  {order.hall ? `Hall: ${order.hall}` : "Hall: -"}
                  {order.table ? ` | Table: ${order.table}` : ""}
                </p>
              ) : null}
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtDateTime(order.createdAt)}
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-dashed border-gray-200 my-3" />

            {/* Items */}
            <div className="mb-3">
              <p className="text-sm font-bold text-gray-800 mb-2">Items</p>
              <div className="space-y-2.5">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between border-b border-gray-50 pb-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {item.name}
                        {item.variationName ? ` (${item.variationName})` : ""}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        PKR {item.price.toLocaleString("en-PK", { minimumFractionDigits: 2 })} × {item.qty}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-800 shrink-0">
                      PKR{" "}
                      {(item.price * item.qty).toLocaleString("en-PK", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-dashed border-gray-200 my-3" />

            {/* Summary */}
            <div className="rounded-lg border border-gray-100 p-3.5 space-y-2 mb-3">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Subtotal:</span>
                <span className="font-medium text-gray-700">
                  PKR{" "}
                  {resolvedSubtotal.toLocaleString("en-PK", {
                    minimumFractionDigits: 2,
                  })}
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
                    +PKR{" "}
                    {order.serviceCharge.toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {gstAmount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">GST ({gstPercent}%):</span>
                  <span className="font-medium text-gray-700">
                    +PKR{" "}
                    {gstAmount.toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-dashed border-gray-200">
                <span className="text-base font-bold text-gray-800">
                  Grand Total:
                </span>
                <span className="text-lg font-bold text-[#ff5a1f]">
                  PKR{" "}
                  {order.total.toLocaleString("en-PK", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            {/* Payment box */}
            <div className="rounded-lg border border-green-200 bg-green-50/50 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-700 font-medium">
                  Payment Status:
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-500 text-white">
                  Paid
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-700 font-medium">
                  Payment Method:
                </span>
                <span className="font-bold text-gray-800">
                  {order.paymentMode}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-700 font-medium">
                  Cash Received:
                </span>
                <span className="font-bold text-gray-800">
                  PKR{" "}
                  {order.total.toLocaleString("en-PK", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-700 font-medium">Bill ID:</span>
                <span className="font-bold text-gray-800">
                  {order.billNo && order.billNo.trim().length > 0
                    ? order.billNo
                    : "N/A"}
                </span>
              </div>
              {order.paymentReferenceId && order.paymentReferenceId.trim().length > 0 && (
                <div className="flex items-start justify-between text-sm gap-3">
                  <span className="text-green-700 font-medium">
                    {order.paymentMode === "Card"
                      ? "Card Invoice ID:"
                      : order.paymentMode === "Online"
                      ? "Online Payment ID:"
                      : "Payment Reference ID:"}
                  </span>
                  <span className="font-bold text-gray-800 text-right break-all">
                    {order.paymentReferenceId}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-5 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm"
          >
            <Printer size={16} />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaidReceiptModal;
