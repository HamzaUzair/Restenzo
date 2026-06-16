/* ── Expense Management types ── */

export type ExpenseCategory =
  | "Utilities"
  | "Supplies"
  | "Maintenance"
  | "Salary"
  | "Food"
  | "Rent"
  | "Other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Utilities",
  "Supplies",
  "Maintenance",
  "Salary",
  "Food",
  "Rent",
  "Other",
];

export type ExpensePaymentMethod = "Cash" | "Card" | "Online";

export const EXPENSE_PAYMENT_METHODS: ExpensePaymentMethod[] = [
  "Cash",
  "Card",
  "Online",
];

export function expenseRequiresInvoice(
  method: ExpensePaymentMethod | ""
): boolean {
  return method === "Card" || method === "Online";
}

export interface Expense {
  id: number;
  title: string;
  description: string;
  /** Resolved from `ExpenseCategory.name` in DB */
  category: string;
  branchId: number;
  branchName: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  /** Required for Card / Online payments */
  invoiceNo: string | null;
  date: string; // YYYY-MM-DD
  addedBy: string;
  createdAt: number; // epoch ms
}

/** Aggregates from GET /api/expenses (scope = structural filters; filtered = + search) */
export interface ExpenseListStats {
  scopeCount: number;
  scopeSum: number;
  filteredCount: number;
  filteredSum: number;
  filteredAvg: number;
}

export interface ExpenseFormData {
  title: string;
  description: string;
  /** Must match an `ExpenseCategory` name for API validation */
  category: string;
  branchId: number | "";
  amount: string; // string for input
  paymentMethod: ExpensePaymentMethod | "";
  /** Required when paymentMethod is Card or Online */
  invoiceNo: string;
  date: string;
}

export interface ExpenseBranch {
  id: number;
  name: string;
}
