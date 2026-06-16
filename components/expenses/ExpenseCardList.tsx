"use client";

import React from "react";
import {
  Building2,
  Calendar,
  Pencil,
  Trash2,
  User,
  DollarSign,
} from "lucide-react";
import type { Expense } from "@/types/expense";
import { format } from "date-fns";

const CAT_BADGE: Record<string, string> = {
  Utilities: "bg-sky-50 text-sky-700",
  Supplies: "bg-teal-50 text-teal-700",
  Maintenance: "bg-amber-50 text-amber-700",
  Salary: "bg-violet-50 text-violet-700",
  Food: "bg-emerald-50 text-emerald-700",
  Rent: "bg-red-50 text-red-700",
  Other: "bg-gray-100 text-gray-600",
};

const PAY_BADGE: Record<string, string> = {
  Cash: "bg-green-50 text-green-700",
  Card: "bg-blue-50 text-blue-700",
  Online: "bg-purple-50 text-purple-700",
};

function fmtPkr(n: number) {
  return "PKR " + n.toLocaleString("en-PK");
}

interface ExpenseCardListProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  canMutate?: boolean;
}

const ExpenseCardList: React.FC<ExpenseCardListProps> = ({
  expenses,
  onEdit,
  onDelete,
  canMutate = true,
}) => {
  return (
    <div className="space-y-3">
      {expenses.map((exp) => (
        <div
          key={exp.id}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
        >
          {/* Top row: title + category */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-bold text-gray-400">#{exp.id}</span>
              <span className="font-bold text-sm text-gray-800 truncate">
                {exp.title}
              </span>
            </div>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${CAT_BADGE[exp.category] ?? "bg-gray-100 text-gray-600"}`}
            >
              {exp.category}
            </span>
          </div>

          {/* Info rows */}
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 mb-3 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <DollarSign size={12} className="text-[#ff5a1f]" />
              <span className="font-bold text-[#ff5a1f]">{fmtPkr(exp.amount)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${PAY_BADGE[exp.paymentMethod] ?? "bg-gray-100 text-gray-600"}`}
              >
                {exp.paymentMethod}
              </span>
              {exp.invoiceNo ? (
                <span className="text-[10px] text-gray-400">· Inv: {exp.invoiceNo}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 size={12} className="text-gray-400" />
              {exp.branchName}
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar size={12} className="text-gray-400" />
              {format(new Date(exp.date), "dd MMM yyyy")}
            </div>
            <div className="flex items-center gap-1.5">
              <User size={12} className="text-gray-400" />
              {exp.addedBy}
            </div>
          </div>

          {/* Actions */}
          {canMutate ? (
            <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-gray-50">
              <button
                onClick={() => onEdit(exp)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#ff5a1f]/30 text-[#ff5a1f] text-xs font-semibold hover:bg-[#ff5a1f]/5 transition-colors cursor-pointer"
              >
                <Pencil size={12} />
                Edit
              </button>
              <button
                onClick={() => onDelete(exp)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 text-right pt-2.5 border-t border-gray-50">
              View only
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export default ExpenseCardList;
