"use client";

import React, { useEffect, useCallback } from "react";
import {
  X,
  UtensilsCrossed,
  Package,
  DollarSign,
  Calculator,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import type { ItemPerformance } from "@/types/menuSales";

function fmtPkr(n: number) {
  return "PKR " + n.toLocaleString("en-PK");
}

function TrendBadge({ pct }: { pct: number }) {
  if (pct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-green-600">
        <TrendingUp size={15} /> +{pct}%
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-red-500">
        <TrendingDown size={15} /> {pct}%
      </span>
    );
  }
  return (
      <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-gray-400 dark:text-slate-400">
      <Minus size={15} /> 0%
    </span>
  );
}

interface MenuSalesItemModalProps {
  item: ItemPerformance | null;
  onClose: () => void;
}

const MenuSalesItemModal: React.FC<MenuSalesItemModalProps> = ({ item, onClose }) => {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );
  useEffect(() => {
    if (item) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [item, handleKey]);

  if (!item) return null;

  // simple bar widths for branch breakdown
  const maxQty = Math.max(...item.branchBreakdown.map((b) => b.qty), 1);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[92vh] flex flex-col z-10 rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#ff5a1f]/10 flex items-center justify-center">
              <UtensilsCrossed size={18} className="text-[#ff5a1f]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800 dark:text-slate-100">{item.itemName}</h2>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">{item.category}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 transition-colors cursor-pointer hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-center dark:border-orange-500/30 dark:bg-orange-500/10">
              <Package size={18} className="mx-auto text-[#ff5a1f] mb-1" />
              <p className="text-lg font-bold text-gray-800 dark:text-orange-100">
                {item.soldQty.toLocaleString("en-PK")}
              </p>
              <p className="text-[10px] uppercase text-gray-500 dark:text-orange-200/80">Sold Qty</p>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-center dark:border-green-500/30 dark:bg-green-500/10">
              <DollarSign size={18} className="mx-auto text-green-600 mb-1" />
              <p className="text-lg font-bold text-gray-800 dark:text-green-100">{fmtPkr(item.revenue)}</p>
              <p className="text-[10px] uppercase text-gray-500 dark:text-green-200/80">Revenue</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-center dark:border-blue-500/30 dark:bg-blue-500/10">
              <Calculator size={18} className="mx-auto text-blue-600 mb-1" />
              <p className="text-lg font-bold text-gray-800 dark:text-blue-100">{fmtPkr(item.avgPrice)}</p>
              <p className="text-[10px] uppercase text-gray-500 dark:text-blue-200/80">Avg Price</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800/80">
              <p className="mb-1 text-[10px] uppercase text-gray-500 dark:text-slate-400">Trend</p>
              <TrendBadge pct={item.trendPct} />
            </div>
          </div>

          {/* Branch breakdown */}
          {item.branchBreakdown.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-bold text-gray-700 dark:text-slate-200">Branch Breakdown</h3>
              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-semibold uppercase text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                      <th className="text-left px-4 py-2">Branch</th>
                      <th className="text-right px-4 py-2">Qty</th>
                      <th className="text-right px-4 py-2">Revenue</th>
                      <th className="px-4 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {item.branchBreakdown.map((b) => (
                      <tr key={b.branchId}>
                        <td className="px-4 py-2.5 font-medium text-gray-700 dark:text-slate-200">
                          {b.branchName}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-800 dark:text-slate-100">
                          {b.qty}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600 dark:text-slate-300">
                          {fmtPkr(b.revenue)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-700">
                            <div
                              className="bg-[#ff5a1f] h-2 rounded-full transition-all"
                              style={{
                                width: `${Math.round((b.qty / maxQty) * 100)}%`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Trend is calculated from actual sold quantity versus the previous equal date range.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors cursor-pointer hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MenuSalesItemModal;
