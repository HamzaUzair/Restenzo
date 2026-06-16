"use client";

import React from "react";
import {
  Building2,
  Calendar,
  Pencil,
  Trash2,
  Loader2,
  User,
} from "lucide-react";
import type { Expense } from "@/types/expense";
import { format } from "date-fns";

/* ── category badge color map ── */
const CAT_BADGE: Record<string, string> = {
  Utilities: "bg-sky-50 text-sky-700",
  Supplies: "bg-teal-50 text-teal-700",
  Maintenance: "bg-amber-50 text-amber-700",
  Salary: "bg-violet-50 text-violet-700",
  Food: "bg-emerald-50 text-emerald-700",
  Rent: "bg-red-50 text-red-700",
  Other: "bg-gray-100 text-gray-600",
};

/* ── payment method badge map ── */
const PAY_BADGE: Record<string, string> = {
  Cash: "bg-green-50 text-green-700",
  Card: "bg-blue-50 text-blue-700",
  Online: "bg-purple-50 text-purple-700",
};

function fmtPkr(n: number) {
  return "PKR " + n.toLocaleString("en-PK");
}

interface ExpenseTableProps {
  expenses: Expense[];
  loading: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  /** When false, hide edit/delete (e.g. multi-branch Restaurant Admin view-only). */
  canMutate?: boolean;
}

const ExpenseTable: React.FC<ExpenseTableProps> = ({
  expenses,
  loading,
  onEdit,
  onDelete,
  canMutate = true,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-16 flex flex-col items-center gap-3">
        <Loader2 size={28} className="text-[#ff5a1f] animate-spin" />
        <p className="text-sm text-gray-400">Loading expenses…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-gray-50/90 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                ID
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Branch
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Expense Title
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Category
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Amount
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Payment
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Date
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Added By
              </th>
              <th className="text-center px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {expenses.map((exp, idx) => (
              <tr
                key={exp.id}
                className={`hover:bg-[#ff5a1f]/[0.02] transition-colors ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}
              >
                {/* ID */}
                <td className="px-5 py-3.5 whitespace-nowrap text-xs font-bold text-gray-500">
                  {exp.id}
                </td>

                {/* Branch */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs text-gray-700">
                    <Building2 size={13} className="text-gray-400 shrink-0" />
                    {exp.branchName}
                  </div>
                </td>

                {/* Title */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span className="font-semibold text-gray-800 text-xs">
                    {exp.title}
                  </span>
                </td>

                {/* Category */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${CAT_BADGE[exp.category] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {exp.category}
                  </span>
                </td>

                {/* Amount */}
                <td className="px-5 py-3.5 whitespace-nowrap font-bold text-[#ff5a1f] text-xs">
                  {fmtPkr(exp.amount)}
                </td>

                {/* Payment */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${PAY_BADGE[exp.paymentMethod] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {exp.paymentMethod}
                  </span>
                  {exp.invoiceNo ? (
                    <p className="mt-1 text-[10px] text-gray-500">Inv: {exp.invoiceNo}</p>
                  ) : null}
                </td>

                {/* Date */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Calendar size={12} className="text-gray-400 shrink-0" />
                    {format(new Date(exp.date), "dd MMM yyyy")}
                  </div>
                </td>

                {/* Added By */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <User size={12} className="text-gray-400 shrink-0" />
                    {exp.addedBy}
                  </div>
                </td>

                {/* Actions */}
                <td className="px-5 py-3.5 whitespace-nowrap text-center">
                  {canMutate ? (
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onEdit(exp)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#ff5a1f]/30 text-[#ff5a1f] text-[11px] font-semibold hover:bg-[#ff5a1f]/5 transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(exp)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-[11px] font-semibold hover:bg-red-50 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-400">View only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExpenseTable;
