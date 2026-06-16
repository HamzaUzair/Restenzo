import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  assertBranchWriteAccess,
  requireAuth,
} from "@/lib/server-auth";

const CATEGORY_NAMES = [
  "Utilities",
  "Supplies",
  "Maintenance",
  "Salary",
  "Food",
  "Rent",
  "Other",
] as const;

const PAYMENT_METHODS = new Set(["Cash", "Card", "Online"]);

function requiresInvoicePayment(method: string): boolean {
  return method === "Card" || method === "Online";
}

function serializeExpense(row: {
  id: number;
  title: string;
  description: string | null;
  amount: unknown;
  payment_method: string | null;
  invoice_no: string | null;
  expense_date: Date;
  created_at: Date;
  branch_id: number | null;
  branch: { branch_name: string } | null;
  expenseCategory: { name: string } | null;
  created_by: { fullname: string | null; username: string } | null;
}) {
  const catName = row.expenseCategory?.name ?? "Other";
  const payment = row.payment_method as "Cash" | "Card" | "Online" | null;
  const safePayment: "Cash" | "Card" | "Online" =
    payment === "Cash" || payment === "Card" || payment === "Online" ? payment : "Cash";
  const addedBy =
    row.created_by?.fullname?.trim() ||
    row.created_by?.username ||
    "—";
  const d = row.expense_date;
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    category: catName,
    branchId: row.branch_id ?? 0,
    branchName: row.branch?.branch_name ?? "—",
    amount: Number(row.amount),
    paymentMethod: safePayment,
    invoiceNo: row.invoice_no?.trim() || null,
    date: dateStr,
    addedBy,
    createdAt: row.created_at.getTime(),
  };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    // CASHIER can edit expenses that belong to their own branch. The two
    // `assertBranchWriteAccess` checks below (existing row's branch + the
    // request payload's branch) prevent moving an expense into a different
    // branch or editing another branch's expense.
    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.role !== "RESTAURANT_ADMIN" &&
      auth.role !== "BRANCH_ADMIN" &&
      auth.role !== "CASHIER"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idRaw } = await params;
    const id = Number(idRaw);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid expense id" }, { status: 400 });
    }

    const existing = await prisma.expense.findUnique({
      where: { id },
      select: { id: true, branch_id: true },
    });
    if (!existing || !existing.branch_id) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    await assertBranchWriteAccess(auth, existing.branch_id);

    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const categoryName = String(body.category ?? "").trim();
    const branchId = Number(body.branchId);
    const amount = Number(body.amount);
    const paymentMethod = String(body.paymentMethod ?? "").trim();
    const invoiceNo = String(body.invoiceNo ?? "").trim();
    const dateStr = String(body.date ?? "").trim();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!CATEGORY_NAMES.includes(categoryName as (typeof CATEGORY_NAMES)[number])) {
      return NextResponse.json({ error: "Valid category is required" }, { status: 400 });
    }
    if (!branchId || Number.isNaN(branchId)) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }
    if (!PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: "Valid payment method is required" }, { status: 400 });
    }
    if (requiresInvoicePayment(paymentMethod) && !invoiceNo) {
      return NextResponse.json(
        { error: "Invoice number is required for Card and Online payments" },
        { status: 400 }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "Valid date is required" }, { status: 400 });
    }

    await assertBranchWriteAccess(auth, branchId);

    const expenseDate = new Date(`${dateStr}T12:00:00.000Z`);
    if (Number.isNaN(expenseDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const category = await prisma.expenseCategory.findUnique({
      where: { name: categoryName },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 400 });
    }

    const updateData: Prisma.ExpenseUncheckedUpdateInput = {
      title,
      description: description || null,
      amount: new Prisma.Decimal(amount),
      branch_id: branchId,
      expenseCategoryId: category.id,
      payment_method: paymentMethod,
      invoice_no: requiresInvoicePayment(paymentMethod) ? invoiceNo : null,
      expense_date: expenseDate,
    };

    const updated = await prisma.expense.update({
      where: { id },
      data: updateData,
      include: {
        branch: { select: { branch_name: true } },
        expenseCategory: { select: { name: true } },
        created_by: { select: { fullname: true, username: true } },
      },
    });

    return NextResponse.json(serializeExpense(updated));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PUT /api/expenses/[id] error:", err);
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    // CASHIER can delete expenses that belong to their own branch. The
    // `assertBranchWriteAccess(auth, existing.branch_id)` check below
    // enforces this — the cashier cannot delete another branch's expense
    // even by supplying that expense's id.
    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.role !== "RESTAURANT_ADMIN" &&
      auth.role !== "BRANCH_ADMIN" &&
      auth.role !== "CASHIER"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idRaw } = await params;
    const id = Number(idRaw);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid expense id" }, { status: 400 });
    }

    const existing = await prisma.expense.findUnique({
      where: { id },
      select: { branch_id: true },
    });
    if (!existing || !existing.branch_id) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    await assertBranchWriteAccess(auth, existing.branch_id);

    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("DELETE /api/expenses/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
