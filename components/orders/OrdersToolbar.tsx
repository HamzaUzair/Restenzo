"use client";

import React from "react";
import { Search, Building2, Filter } from "lucide-react";
import type { Branch } from "@/types/branch";
import type { OrderStatus } from "@/types/order";
import { ORDER_STATUS_FILTER_OPTIONS } from "@/types/order";

interface OrdersToolbarProps {
  branches: Branch[];
  branchesLoading: boolean;
  filterBranchId: number | "all";
  onBranchChange: (v: number | "all") => void;
  statusFilter: OrderStatus | "all";
  onStatusChange: (v: OrderStatus | "all") => void;
  search: string;
  onSearchChange: (v: string) => void;
  /** Counts per status (after branch filter) */
  statusCounts: Record<string, number>;
  totalCount: number;
  branchLocked?: boolean;
  /** When set, overrides the default status chip list (e.g. Order Taker). */
  statusOptions?: OrderStatus[];
}

const STATUS_COLORS: Record<string, { active: string; inactive: string }> = {
  all: {
    active: "bg-[#ff5a1f] text-white border-[#ff5a1f]",
    inactive: "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
  },
  Pending: {
    active: "bg-amber-500 text-white border-amber-500",
    inactive: "bg-white text-amber-600 border-amber-200 hover:bg-amber-50",
  },
  Running: {
    active: "bg-blue-500 text-white border-blue-500",
    inactive: "bg-white text-blue-600 border-blue-200 hover:bg-blue-50",
  },
  Served: {
    active: "bg-emerald-500 text-white border-emerald-500",
    inactive: "bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50",
  },
  Paid: {
    active: "bg-purple-500 text-white border-purple-500",
    inactive: "bg-white text-purple-600 border-purple-200 hover:bg-purple-50",
  },
  Cancelled: {
    active: "bg-red-500 text-white border-red-500",
    inactive: "bg-white text-red-600 border-red-200 hover:bg-red-50",
  },
};

const OrdersToolbar: React.FC<OrdersToolbarProps> = ({
  branches,
  branchesLoading,
  filterBranchId,
  onBranchChange,
  statusFilter,
  onStatusChange,
  search,
  onSearchChange,
  statusCounts,
  totalCount,
  branchLocked = false,
  statusOptions,
}) => (
  <div className="space-y-4 mb-6">
    {/* Row 1: Search + Branch */}
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <Search size={13} />
            Search Order by ID
          </label>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3.5 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all"
              placeholder="Enter Order ID or Order Number (e.g., 123 or ORD-123)"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Branch */}
        <div className="min-w-[180px] max-w-xs">
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <Building2 size={13} />
            Filter by Branch
          </label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-700 bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all"
            value={filterBranchId}
            onChange={(e) => {
              const v = e.target.value;
              onBranchChange(v === "all" ? "all" : Number(v));
            }}
            disabled={branchesLoading || branchLocked}
          >
            {!branchLocked && <option value="all">All Branches</option>}
            {branches.map((b) => (
              <option key={b.branch_id} value={b.branch_id}>
                {b.branch_name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>

    {/* Row 2: Status chips */}
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-gray-400 shrink-0" />
        <span className="text-xs text-gray-400 font-medium mr-1">Filter by Status:</span>

        {/* "all" chip */}
        {(["all", ...(statusOptions ?? ORDER_STATUS_FILTER_OPTIONS)] as (OrderStatus | "all")[]).map((s) => {
          const isSelected = statusFilter === s;
          const colors =
            STATUS_COLORS[s] ?? STATUS_COLORS["all"];
          const count = s === "all" ? totalCount : (statusCounts[s] ?? 0);

          return (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                isSelected ? colors.active : colors.inactive
              }`}
            >
              {s === "all" ? "All" : s}
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
                  isSelected
                    ? "bg-white/25 text-current"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

export default OrdersToolbar;
