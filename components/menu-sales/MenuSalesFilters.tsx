"use client";

import React from "react";
import {
  Search,
  Building2,
  Layers3,
  CalendarDays,
  XCircle,
} from "lucide-react";
import type { MSTimeRange, MSBranch } from "@/types/menuSales";

const TABS: { id: MSTimeRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "custom", label: "Custom" },
];

const selectBase =
  "border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all w-full";

interface MenuSalesFiltersProps {
  branches: MSBranch[];
  categories: string[];
  timeRange: MSTimeRange;
  onTimeRangeChange: (v: MSTimeRange) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  branchId: number | "all";
  onBranchChange: (v: number | "all") => void;
  lockBranchId?: number | null;
  category: string | "all";
  onCategoryChange: (v: string | "all") => void;
  search: string;
  onSearchChange: (v: string) => void;
  onClear: () => void;
  hasActive: boolean;
}

const MenuSalesFilters: React.FC<MenuSalesFiltersProps> = ({
  branches,
  categories,
  timeRange,
  onTimeRangeChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  branchId,
  onBranchChange,
  lockBranchId = null,
  category,
  onCategoryChange,
  search,
  onSearchChange,
  onClear,
  hasActive,
}) => {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6 space-y-4">
      {/* Row 1 — time tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTimeRangeChange(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
              timeRange === t.id
                ? "bg-[#ff5a1f] text-white border-[#ff5a1f] shadow-sm"
                : "bg-gray-50 text-gray-600 border-gray-200 hover:border-[#ff5a1f]/40 hover:text-[#ff5a1f]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Row 2 — filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Date From */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            <CalendarDays size={12} />
            From
          </label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all"
            value={dateFrom}
            onChange={(e) => {
              onDateFromChange(e.target.value);
              onTimeRangeChange("custom");
            }}
          />
        </div>

        {/* Date To */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            <CalendarDays size={12} />
            To
          </label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all"
            value={dateTo}
            onChange={(e) => {
              onDateToChange(e.target.value);
              onTimeRangeChange("custom");
            }}
          />
        </div>

        {/* Branch */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            <Building2 size={12} />
            Branch
          </label>
          <select
            className={selectBase}
            value={branchId}
            onChange={(e) =>
              onBranchChange(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            disabled={Boolean(lockBranchId) || (branches.length === 1 && branchId !== "all")}
          >
            {!lockBranchId && !(branches.length === 1 && branchId !== "all") && (
              <option value="all">All Branches</option>
            )}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            <Layers3 size={12} />
            Category
          </label>
          <select
            className={selectBase}
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            <Search size={12} />
            Search
          </label>
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all"
              placeholder="Search item name…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Clear filters */}
        <div className="flex flex-col justify-end gap-2">
          {hasActive && (
            <button
              onClick={onClear}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
            >
              <XCircle size={13} />
              Clear Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MenuSalesFilters;
