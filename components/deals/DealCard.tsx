 "use client";

import React, { useMemo, useState } from "react";
 import {
   Pencil,
   Trash2,
   Building2,
   BadgePercent,
   Layers3,
   UtensilsCrossed,
  ChevronDown,
 } from "lucide-react";
 import type { Deal } from "@/types/deal";

interface DealCardProps {
  deal: Deal;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  readOnly?: boolean;
}

const DealCard: React.FC<DealCardProps> = ({ deal, onEdit, onDelete, readOnly = false }) => {
  const [showAllItems, setShowAllItems] = useState(false);

   const hasMore = deal.items.length > 3;
  const visibleItems = useMemo(
    () => (showAllItems ? deal.items : deal.items.slice(0, 3)),
    [showAllItems, deal.items]
  );

  return (
    <div className="deal-card-surface group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-5 flex flex-col">
       {/* Top row: deal type + actions */}
       <div className="flex items-start justify-between mb-3">
         <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ff5a1f]/8 text-[#ff5a1f] text-xs font-semibold">
           <BadgePercent size={14} />
           {deal.type}
         </span>
        {!readOnly && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(deal)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-[#ff5a1f] hover:bg-orange-50 transition-colors cursor-pointer"
              title="Edit deal"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDelete(deal)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              title="Delete deal"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
       </div>

       {/* Deal name + description */}
       <h3 className="text-sm font-bold text-gray-800 leading-snug flex items-center gap-1.5">
         <Layers3 size={14} className="text-[#ff5a1f]" />
         {deal.name}
       </h3>
       {deal.description && (
         <p className="text-xs text-gray-400 mt-1 line-clamp-2">
           {deal.description}
         </p>
       )}

       {/* Included items */}
       <div className="mt-3">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
           <UtensilsCrossed size={11} className="text-gray-400" />
           Included items
         </p>
        <div className="space-y-1.5">
          {visibleItems.map((item) => (
            <div
              key={item.lineId ?? `${deal.id}-${item.id}`}
              className="deal-item-row flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50/70 px-2.5 py-1.5"
            >
              <span className="deal-item-name text-xs text-gray-700 truncate pr-2">{item.name}</span>
              <span className="shrink-0 inline-flex items-center rounded-full bg-[#ff5a1f]/10 text-[#ff5a1f] text-[11px] font-semibold px-2 py-0.5">
                x{item.quantity}
              </span>
            </div>
          ))}
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAllItems((prev) => !prev)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#ff5a1f] hover:text-[#e04e18] cursor-pointer"
          >
            {showAllItems ? "Show less" : `Show ${deal.items.length - 3} more`}
            <ChevronDown
              size={12}
              className={`transition-transform ${showAllItems ? "rotate-180" : ""}`}
            />
          </button>
        )}
       </div>

       {/* Spacer */}
       <div className="flex-1" />

       {/* Bottom row: price, branch, status */}
       <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50">
         <div className="flex flex-col">
           <span className="text-base font-bold text-gray-800">
             PKR {deal.price.toLocaleString()}
           </span>
           <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
             <Building2 size={11} className="text-gray-400" />
             {deal.branchName}
           </span>
         </div>

         <span
           className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
             deal.status === "active"
               ? "bg-green-50 text-green-600"
               : "bg-gray-100 text-gray-500"
           }`}
         >
           {deal.status === "active" ? "● Active" : "○ Inactive"}
         </span>
       </div>
     </div>
   );
 };

 export default DealCard;

