"use client";

import React from "react";
import { Package, DollarSign, Trophy, TrendingUp } from "lucide-react";
import type { ItemPerformance } from "@/types/menuSales";

function fmtPkr(n: number) {
  return "PKR " + n.toLocaleString("en-PK");
}

interface MenuSalesKPIStripProps {
  rows: ItemPerformance[];
}

const MenuSalesKPIStrip: React.FC<MenuSalesKPIStripProps> = ({ rows }) => {
  const totalSold = rows.reduce((s, r) => s + r.soldQty, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  const bestSeller =
    rows.length > 0
      ? [...rows].sort((a, b) => b.soldQty - a.soldQty)[0]
      : null;
  const highestRevItem =
    rows.length > 0
      ? [...rows].sort((a, b) => b.revenue - a.revenue)[0]
      : null;

  const cards = [
    {
      label: "Total Items Sold",
      value: totalSold.toLocaleString("en-PK"),
      icon: <Package size={20} />,
      bg: "bg-orange-50",
      color: "text-[#ff5a1f]",
    },
    {
      label: "Total Revenue",
      value: fmtPkr(totalRevenue),
      icon: <DollarSign size={20} />,
      bg: "bg-green-50",
      color: "text-green-600",
    },
    {
      label: "Best Seller",
      value: bestSeller ? bestSeller.itemName : "—",
      sub: bestSeller ? `${bestSeller.soldQty} sold` : "",
      icon: <Trophy size={20} />,
      bg: "bg-amber-50",
      color: "text-amber-600",
    },
    {
      label: "Highest Revenue",
      value: highestRevItem ? highestRevItem.itemName : "—",
      sub: highestRevItem ? fmtPkr(highestRevItem.revenue) : "",
      icon: <TrendingUp size={20} />,
      bg: "bg-purple-50",
      color: "text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3.5"
        >
          <div
            className={`w-11 h-11 rounded-full ${c.bg} ${c.color} flex items-center justify-center shrink-0`}
          >
            {c.icon}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">{c.label}</p>
            <p className="text-sm font-semibold text-gray-800 leading-snug break-words">
              {c.value}
            </p>
            {c.sub && <p className="text-[11px] text-gray-400">{c.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MenuSalesKPIStrip;
