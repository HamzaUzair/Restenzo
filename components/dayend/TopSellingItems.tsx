"use client";

import React from "react";
import { UtensilsCrossed } from "lucide-react";
import type { TopSellingItem } from "@/types/dayend";
import { formatPKR } from "@/lib/dayendFormat";

export type TopSellingVariant = "quantity" | "sales";

interface TopSellingItemsProps {
  /**
   * Pre-sorted list. Caller picks the right list per variant
   * (`topItemsByQuantity` for `variant="quantity"`,
   *  `topItemsBySales` for `variant="sales"`). The component does not
   * re-sort — it just renders.
   */
  items: TopSellingItem[];
  /** Which metric is the headline of each row. Defaults to `"sales"`. */
  variant?: TopSellingVariant;
  /** Optional title override. Defaults to a sensible label per variant. */
  title?: string;
}

const TopSellingItems: React.FC<TopSellingItemsProps> = ({
  items,
  variant = "sales",
  title,
}) => {
  const heading =
    title ??
    (variant === "quantity"
      ? "Top Selling Items by Quantity"
      : "Top Selling Items by Sales");

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
        {heading}
      </h3>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            No sales data for this day
          </p>
        ) : (
          items.map((item, idx) => {
            const qty = Math.round(item.quantity);
            const primary =
              variant === "quantity" ? `${qty} sold` : formatPKR(item.revenue);
            const secondary =
              variant === "quantity" ? formatPKR(item.revenue) : `${qty} sold`;
            const itemKey =
              item.dish_id !== undefined ? `dish-${item.dish_id}` : item.name;
            return (
              <div
                key={itemKey}
                className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="w-6 h-6 rounded-full bg-[#ff5a1f]/10 flex items-center justify-center text-xs font-bold text-[#ff5a1f] shrink-0">
                  {idx + 1}
                </span>
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <UtensilsCrossed size={14} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {item.name}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {item.category || "—"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {primary}
                  </p>
                  <p className="text-[11px] text-gray-400">{secondary}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TopSellingItems;
