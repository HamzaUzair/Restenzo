"use client";

import React from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { TimeRange, ReportBranch } from "@/types/salesReport";

interface ReportFiltersProps {
  branches: ReportBranch[];
  branchesLoading?: boolean;
  timeRange: TimeRange;
  onTimeRangeChange: (v: TimeRange) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  branchId: number | "all";
  onBranchChange: (v: number | "all") => void;
  lockBranchId?: number | null;
  onClear: () => void;
  hasActive: boolean;
}

const TABS: { id: TimeRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "custom", label: "Custom" },
];

const selectBase =
  "border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/30 focus:border-[#ff5a1f] transition-all w-full";

const ReportFilters: React.FC<ReportFiltersProps> = ({
  branches,
  branchesLoading = false,
  timeRange,
  onTimeRangeChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  branchId,
  onBranchChange,
  lockBranchId = null,
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

      {/* Row 2 — dropdowns + date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Branch */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            <Building2 size={12} />
            Branch
          </label>
          {branchesLoading ? (
            <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-400 bg-gray-50">
              <Loader2 size={14} className="animate-spin" />
              Loading branches…
            </div>
          ) : branches.length === 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-600 bg-amber-50">
                <AlertTriangle size={14} />
                No branches found.
              </div>
              <Link
                href="/branches"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#ff5a1f] hover:underline"
              >
                Create a branch first →
              </Link>
            </div>
          ) : (
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
          )}
        </div>

        {/* Date from */}
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

        {/* Date to */}
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

export default ReportFilters;
