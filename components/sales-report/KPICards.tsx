"use client";

import React, { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  ClipboardList,
  Calculator,
  Banknote,
  CreditCard,
  Globe,
  Landmark,
  Info,
} from "lucide-react";
import type { ReportKPIs } from "@/types/salesReport";

function fmtPkr(n: number) {
  return "PKR " + n.toLocaleString("en-PK");
}

interface KPICardsProps {
  kpis: ReportKPIs;
}

const KPICards: React.FC<KPICardsProps> = ({ kpis }) => {
  const [showTip, setShowTip] = useState(false);

  const row1 = [
    {
      label: "Gross Sales",
      value: fmtPkr(kpis.grossSales),
      icon: <DollarSign size={22} />,
      bg: "bg-orange-50",
      color: "text-[#ff5a1f]",
    },
    {
      label: "Net Revenue",
      value: fmtPkr(kpis.netRevenue),
      icon: <TrendingUp size={22} />,
      bg: "bg-green-50",
      color: "text-green-600",
      tooltip: true,
    },
    {
      label: "Total Orders",
      value: String(kpis.totalOrders),
      icon: <ClipboardList size={22} />,
      bg: "bg-blue-50",
      color: "text-blue-600",
    },
    {
      label: "Avg Order Value",
      value: fmtPkr(kpis.avgOrderValue),
      icon: <Calculator size={22} />,
      bg: "bg-purple-50",
      color: "text-purple-600",
    },
  ];

  const row2 = [
    {
      label: "Cash",
      value: fmtPkr(kpis.cashAmount),
      sub: `${kpis.cashCount} orders`,
      icon: <Banknote size={22} />,
      bg: "bg-emerald-50",
      color: "text-emerald-600",
    },
    {
      label: "Card",
      value: fmtPkr(kpis.cardAmount),
      sub: `${kpis.cardCount} orders`,
      icon: <CreditCard size={22} />,
      bg: "bg-sky-50",
      color: "text-sky-600",
    },
    {
      label: "Online",
      value: fmtPkr(kpis.onlineAmount),
      sub: `${kpis.onlineCount} orders`,
      icon: <Globe size={22} />,
      bg: "bg-violet-50",
      color: "text-violet-600",
    },
    {
      label: "Credit",
      value: fmtPkr(kpis.creditAmount),
      sub: `${kpis.creditCount} orders`,
      icon: <Landmark size={22} />,
      bg: "bg-gray-50",
      color: "text-gray-600",
    },
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {row1.map((c) => (
          <div
            key={c.label}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 relative"
          >
            <div
              className={`w-12 h-12 rounded-full ${c.bg} ${c.color} flex items-center justify-center shrink-0`}
            >
              {c.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-gray-500">{c.label}</p>
                {c.tooltip && (
                  <div className="relative">
                    <button
                      onMouseEnter={() => setShowTip(true)}
                      onMouseLeave={() => setShowTip(false)}
                      onClick={() => setShowTip((p) => !p)}
                      className="text-gray-400 hover:text-gray-600 cursor-pointer"
                      aria-label="Net Revenue formula"
                    >
                      <Info size={13} />
                    </button>
                    {showTip && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-800 text-white text-[10px] rounded-lg whitespace-nowrap shadow-lg z-20">
                        Net = Gross − Discounts − Service Charges − Refunds
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xl font-bold text-gray-800 truncate">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {row2.map((c) => (
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
              <p className="text-[11px] text-gray-400">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KPICards;
