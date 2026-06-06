"use client";

import React, { useEffect, useCallback } from "react";
import { X, Printer, UtensilsCrossed } from "lucide-react";
import type { SaleOrder } from "@/types/salesList";

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
  return "PKR " + n.toLocaleString("en-PK");
}

interface SalesReceiptModalProps {
  order: SaleOrder | null;
  onClose: () => void;
}

const SalesReceiptModal: React.FC<SalesReceiptModalProps> = ({ order, onClose }) => {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );
  useEffect(() => {
    if (order) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [order, handleKey]);

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0 print:hidden">
          <h2 className="text-lg font-bold text-gray-800">Receipt</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Receipt body */}
        <div className="flex-1 overflow-y-auto px-6 py-5" id="receipt-print-area">
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#ff5a1f]/10 mb-2">
              <UtensilsCrossed size={22} className="text-[#ff5a1f]" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Restaurant Receipt</h3>
            <p className="text-xs text-gray-400">Restenzo POS</p>
          </div>

          {/* Meta */}
          <div className="border border-dashed border-gray-200 rounded-xl p-3 mb-4 space-y-1 text-xs text-gray-600">
            <div className="flex justify-between">
              <span className="text-gray-400">Order ID</span>
              <span className="font-semibold text-gray-800">{order.orderNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Branch</span>
              <span>{order.branchName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Type</span>
              <span>
                {order.type}
                {order.table ? ` — ${order.table}` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Date / Time</span>
              <span>{fmtDate(order.createdAt)}</span>
            </div>
          </div>

          {/* Items */}
          <div className="mb-4">
            <div className="flex justify-between text-[10px] font-semibold text-gray-400 uppercase mb-1.5 px-1">
              <span>Item</span>
              <span>Amount</span>
            </div>
            <div className="border-t border-dashed border-gray-200 divide-y divide-dashed divide-gray-100">
              {order.items.map((it) => (
                <div key={it.id} className="flex justify-between py-2 px-1 text-xs text-gray-700">
                  <span>
                    {it.name}{" "}
                    <span className="text-gray-400">x{it.qty}</span>
                  </span>
                  <span className="font-semibold">{fmtPkr(it.qty * it.price)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border border-dashed border-gray-200 rounded-xl p-3 space-y-1.5 text-xs mb-4">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{fmtPkr(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-red-500">
                <span>Discount</span>
                <span>-{fmtPkr(order.discount)}</span>
              </div>
            )}
            {order.serviceCharge > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Service Charge</span>
                <span>+{fmtPkr(order.serviceCharge)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-800 pt-2 border-t border-dashed border-gray-200 text-sm">
              <span>Grand Total</span>
              <span className="text-[#ff5a1f]">{fmtPkr(order.total)}</span>
            </div>
          </div>

          {/* Payment box */}
          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-400">Payment Status</span>
              <span
                className={`font-semibold ${order.paid ? "text-green-600" : "text-red-500"}`}
              >
                {order.paid ? "Paid" : "Unpaid"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Payment Method</span>
              <span className="font-semibold text-gray-700">{order.paymentMethod}</span>
            </div>
            {order.paid && order.paymentMethod === "Cash" && (
              <div className="flex justify-between">
                <span className="text-gray-400">Cash Received</span>
                <span className="font-semibold text-gray-700">{fmtPkr(order.total)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Bill ID</span>
              <span className="font-semibold text-gray-700">
                {order.billNo && order.billNo.trim().length > 0
                  ? order.billNo
                  : "N/A"}
              </span>
            </div>
            {order.paymentReferenceId && order.paymentReferenceId.trim().length > 0 && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-400">
                  {order.paymentMethod === "Card"
                    ? "Card Invoice ID"
                    : order.paymentMethod === "Online"
                    ? "Online Payment ID"
                    : "Payment Ref"}
                </span>
                <span className="font-semibold text-gray-700 text-right break-all">
                  {order.paymentReferenceId}
                </span>
              </div>
            )}
          </div>

          <p className="text-center text-[10px] text-gray-300 mt-4">
            Thank you for dining with us!
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 shrink-0 print:hidden">
          <button
            onClick={onClose}
            className="flex-1 px-5 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm"
          >
            <Printer size={15} />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalesReceiptModal;
