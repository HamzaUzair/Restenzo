"use client";

import React from "react";
import {
  ShoppingCart,
  DollarSign,
  Wallet,
  TrendingUp,
  BarChart3,
  XCircle,
} from "lucide-react";
import type { DayEndStats } from "@/types/dayend";
import { formatPKR } from "@/lib/dayendFormat";

interface SummaryStatsProps {
  stats: DayEndStats;
}

const statConfig = [
  {
    key: "totalOrders",
    label: "Total Orders",
    value: (s: DayEndStats) => s.totalOrders.toString(),
    icon: ShoppingCart,
    bg: "bg-blue-50",
    color: "text-blue-600",
  },
  {
    key: "totalRevenue",
    label: "Total Revenue",
    value: (s: DayEndStats) => formatPKR(s.totalRevenue),
    icon: DollarSign,
    bg: "bg-green-50",
    color: "text-green-600",
  },
  {
    key: "totalExpenses",
    label: "Total Expenses",
    value: (s: DayEndStats) => formatPKR(s.totalExpenses),
    icon: Wallet,
    bg: "bg-amber-50",
    color: "text-amber-600",
  },
  {
    key: "netRevenue",
    label: "Net Revenue",
    value: (s: DayEndStats) => formatPKR(s.netRevenue),
    icon: TrendingUp,
    bg: "bg-[#ff5a1f]/10",
    color: "text-[#ff5a1f]",
  },
  {
    key: "averageOrderValue",
    label: "Avg Order Value",
    value: (s: DayEndStats) => formatPKR(s.averageOrderValue),
    icon: BarChart3,
    bg: "bg-purple-50",
    color: "text-purple-600",
  },
  {
    key: "cancelledOrders",
    label: "Cancelled Orders",
    value: (s: DayEndStats) => s.cancelledOrders.toString(),
    icon: XCircle,
    bg: "bg-red-50",
    color: "text-red-600",
  },
];

const SummaryStats: React.FC<SummaryStatsProps> = ({ stats }) => (
  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
    {statConfig.map(({ key, label, value, icon: Icon, bg, color }) => (
      <div
        key={key}
        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium leading-tight text-gray-500 whitespace-normal break-words dark:text-slate-300">
            {label}
          </p>
          <p className="text-base font-bold text-gray-900 whitespace-normal break-words dark:text-slate-100">
            {value(stats)}
          </p>
        </div>
      </div>
    ))}
  </div>
);

export default SummaryStats;
