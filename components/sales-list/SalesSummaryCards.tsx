"use client";

import React from "react";
import { ClipboardList, DollarSign, Banknote, CreditCard } from "lucide-react";

interface SalesSummaryCardsProps {
  totalOrders: number;
  totalRevenue: number;
  cashCount: number;
  cardOnlineCount: number;
}

function fmtPkr(n: number) {
  return "PKR " + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

const SalesSummaryCards: React.FC<SalesSummaryCardsProps> = ({
  totalOrders,
  totalRevenue,
  cashCount,
  cardOnlineCount,
}) => {
  const cards = [
    {
      label: "Total Orders",
      value: String(totalOrders),
      icon: <ClipboardList size={22} />,
      bg: "bg-orange-50",
      color: "text-[#ff5a1f]",
    },
    {
      label: "Total Revenue",
      value: fmtPkr(totalRevenue),
      icon: <DollarSign size={22} />,
      bg: "bg-green-50",
      color: "text-green-600",
    },
    {
      label: "Cash Payments",
      value: String(cashCount),
      icon: <Banknote size={22} />,
      bg: "bg-blue-50",
      color: "text-blue-600",
    },
    {
      label: "Card / Online Payments",
      value: String(cardOnlineCount),
      icon: <CreditCard size={22} />,
      bg: "bg-purple-50",
      color: "text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4"
        >
          <div
            className={`w-12 h-12 rounded-full ${c.bg} ${c.color} flex items-center justify-center shrink-0`}
          >
            {c.icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-xl font-bold text-gray-800 truncate">{c.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SalesSummaryCards;
