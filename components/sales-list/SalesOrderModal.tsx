"use client";

import React, { useEffect, useCallback } from "react";
import {
  X,
  ClipboardList,
  Building2,
  Calendar,
  CreditCard,
  Receipt,
  Tag,
  UtensilsCrossed,
} from "lucide-react";
import type { SaleOrder, SaleStatus, OrderType, PaymentMethod } from "@/types/salesList";

/* ── badge maps ── */
const STATUS_BADGE: Record<SaleStatus, string> = {
  Paid: "bg-green-50 text-green-700 border-green-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Running: "bg-blue-50 text-blue-700 border-blue-200",
  Served: "bg-purple-50 text-purple-700 border-purple-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
  Credit: "bg-gray-100 text-gray-600 border-gray-200",
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

interface SalesOrderModalProps {
  order: SaleOrder | null;
  onClose: () => void;
  onViewReceipt: (o: SaleOrder) => void;
}

const SalesOrderModal: React.FC<SalesOrderModalProps> = ({
  order,
  onClose,
  onViewReceipt,
}) => {
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

  const isDealBundle = (name: string) => name.trim().toLowerCase().startsWith("deal:");
  const groupedItems = (() => {
    type Item = (typeof order.items)[number];
    type Group = { bundle: Item; includes: Item[] };
    type Line = { type: "deal"; group: Group } | { type: "item"; item: Item };

    const lines: Line[] = [];
    let currentDeal: Group | null = null;

    for (const item of order.items) {
      if (isDealBundle(item.name)) {
        currentDeal = { bundle: item, includes: [] };
        lines.push({ type: "deal", group: currentDeal });
        continue;
      }

      if (currentDeal && item.price === 0) {
        currentDeal.includes.push(item);
        continue;
      }

      currentDeal = null;
      lines.push({ type: "item", item });
    }

    return lines;
  })();

  const infoCards: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    {
      icon: <ClipboardList size={15} />,
      label: "Order Number",
      value: <span className="font-bold text-gray-800">{order.orderNo}</span>,
    },
    {
      icon: <Building2 size={15} />,
      label: "Branch",
      value: order.branchName,
    },
    {
      icon: <UtensilsCrossed size={15} />,
      label: "Order Type",
      value: (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_BADGE[order.type]}`}>
          {order.type}
          {order.table ? ` — ${order.table}` : ""}
        </span>
      ),
    },
    {
      icon: <Tag size={15} />,
      label: "Status",
      value: (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_BADGE[order.status]}`}>
          {order.status}
        </span>
      ),
    },
    {
      icon: <CreditCard size={15} />,
      label: "Payment",
      value: (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${PAY_BADGE[order.paymentMethod]}`}>
          {order.paymentMethod}
        </span>
      ),
    },
    {
      icon: <Calendar size={15} />,
      label: "Date / Time",
      value: fmtDate(order.createdAt),
    },
  ];

  // Card / Online payments carry a cashier-entered reference; render it
  // as its own card so the value is easy to spot in audits.
  const paymentReferenceId = order.paymentReferenceId?.trim() ?? "";
  if (paymentReferenceId.length > 0) {
    infoCards.push({
      icon: <CreditCard size={15} />,
      label:
        order.paymentMethod === "Card"
          ? "Card Invoice ID"
          : order.paymentMethod === "Online"
          ? "Online Payment ID"
          : "Payment Reference",
      value: (
        <span className="font-semibold text-gray-800 break-all">
          {paymentReferenceId}
        </span>
      ),
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#ff5a1f]/10 flex items-center justify-center">
              <ClipboardList size={18} className="text-[#ff5a1f]" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Order Details</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {infoCards.map((c, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1">
                  {c.icon}
                  {c.label}
                </div>
                <div className="text-sm text-gray-700">{c.value}</div>
              </div>
            ))}
          </div>

          {/* Items */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Order Items</h3>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-[11px] font-semibold text-gray-400 uppercase">
                    <th className="text-left px-4 py-2">Item</th>
                    <th className="text-center px-4 py-2">Qty</th>
                    <th className="text-right px-4 py-2">Price</th>
                    <th className="text-right px-4 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {groupedItems.map((line, idx) => {
                    if (line.type === "item") {
                      const it = line.item;
                      return (
                        <tr key={it.id}>
                          <td className="px-4 py-2.5 text-gray-700">{it.name}</td>
                          <td className="px-4 py-2.5 text-center text-gray-600">{it.qty}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{fmtPkr(it.price)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                            {fmtPkr(it.qty * it.price)}
                          </td>
                        </tr>
                      );
                    }

                    const { bundle, includes } = line.group;
                    return (
                      <React.Fragment key={`${bundle.id}-${idx}`}>
                        <tr>
                          <td className="px-4 py-2.5 text-gray-700 font-semibold">{bundle.name}</td>
                          <td className="px-4 py-2.5 text-center text-gray-600">{bundle.qty}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{fmtPkr(bundle.price)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                            {fmtPkr(bundle.qty * bundle.price)}
                          </td>
                        </tr>
                        {includes.length > 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 pb-2.5">
                              <div className="ml-2 border-l border-gray-200 pl-3 space-y-1">
                                <p className="text-[11px] text-gray-500">Includes:</p>
                                {includes.map((inc) => (
                                  <div
                                    key={inc.id}
                                    className="flex items-center justify-between text-[13px]"
                                  >
                                    <span className="text-gray-700">
                                      {inc.name}
                                      {inc.variationName ? ` (${inc.variationName})` : ""} x{inc.qty}
                                    </span>
                                    <span className="text-[11px] font-semibold text-gray-500">Included</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
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
            <div className="flex justify-between font-bold text-gray-800 pt-2 border-t border-gray-200 text-base">
              <span>Grand Total</span>
              <span className="text-[#ff5a1f]">{fmtPkr(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-5 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={() => onViewReceipt(order)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5a1f] text-white text-sm font-semibold hover:bg-[#e04e18] transition-colors cursor-pointer shadow-sm"
          >
            <Receipt size={15} />
            View Receipt
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalesOrderModal;
