"use client";

import React from "react";
import { Eye, Building2, Calendar, CreditCard } from "lucide-react";
import type { SaleOrder, SaleStatus, OrderType, PaymentMethod } from "@/types/salesList";

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
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${mon}, ${hh}:${mm}`;
}

function fmtPkr(n: number) {
  return "PKR " + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

interface SalesCardListProps {
  orders: SaleOrder[];
  onView: (o: SaleOrder) => void;
}

const SalesCardList: React.FC<SalesCardListProps> = ({ orders, onView }) => (
  <div className="space-y-3">
    {orders.map((o) => (
      <div
        key={o.id}
        className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
      >
        {/* Top row */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-gray-800">{o.orderNo}</span>
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[o.status]}`}
          >
            {o.status}
          </span>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Building2 size={12} className="text-gray-400" />
            {o.branchName}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Calendar size={12} className="text-gray-400" />
            {fmtDate(o.createdAt)}
          </div>
          <div>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_BADGE[o.type]}`}
            >
              {o.type}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <CreditCard size={12} className="text-gray-400" />
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${PAY_BADGE[o.paymentMethod]}`}
            >
              {o.paymentMethod}
            </span>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-50">
          <span className="text-sm font-bold text-gray-800">{fmtPkr(o.total)}</span>
          <button
            onClick={() => onView(o)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ff5a1f]/30 text-[#ff5a1f] text-xs font-semibold hover:bg-[#ff5a1f]/5 transition-colors cursor-pointer"
          >
            <Eye size={13} />
            View
          </button>
        </div>
      </div>
    ))}
  </div>
);

export default SalesCardList;
