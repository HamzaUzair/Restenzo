import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { Decimal } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  assertBranchWriteAccess,
  buildBranchScopeFilter,
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

function buildSearchFilter(search: string): Prisma.ExpenseWhereInput {
  const q = search.trim();
  if (!q) return {};
  return {
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { invoice_no: { contains: q, mode: "insensitive" } },
    ],
  };
}

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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    // CASHIER and ACCOUNTANT can list expenses for their own branch only.
    // `buildBranchScopeFilter` below pins branch-scoped roles to their
    // `branch_id`, so the `branchId` query param is ignored for these
    // roles — preventing cross-branch reads even via URL tampering. The
    // Accountant is view-only: POST / PUT / DELETE handlers below do NOT
    // accept ACCOUNTANT, so listing is the only mutation-free surface
    // they can reach.
    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.role !== "RESTAURANT_ADMIN" &&
      auth.role !== "BRANCH_ADMIN" &&
      auth.role !== "CASHIER" &&
      auth.role !== "ACCOUNTANT"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId");
    const categoryParam = searchParams.get("category")?.trim();
    const paymentParam = searchParams.get("paymentMethod")?.trim();
    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const search = searchParams.get("search")?.trim() ?? "";

    const requestedBranchId =
      branchIdParam && branchIdParam !== "all" ? Number(branchIdParam) : null;

    const scope = await buildBranchScopeFilter(auth, requestedBranchId);
    const scopeWhere: Prisma.ExpenseWhereInput = {
      ...(scope as Prisma.ExpenseWhereInput),
    };

    const categoryFilter: Prisma.ExpenseWhereInput =
      categoryParam && CATEGORY_NAMES.includes(categoryParam as (typeof CATEGORY_NAMES)[number])
        ? { expenseCategory: { name: categoryParam } }
        : {};

    const paymentFilter: Prisma.ExpenseWhereInput =
      paymentParam && PAYMENT_METHODS.has(paymentParam)
        ? { payment_method: paymentParam }
        : {};

    const dateRange: { gte?: Date; lte?: Date } = {};
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00.000Z`);
      if (!Number.isNaN(from.getTime())) dateRange.gte = from;
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59.999Z`);
      if (!Number.isNaN(to.getTime())) dateRange.lte = to;
    }
    const dateFilter: Prisma.ExpenseWhereInput =
      Object.keys(dateRange).length > 0 ? { expense_date: dateRange } : {};

    const baseParts = [
      scopeWhere,
      categoryFilter,
      paymentFilter,
      dateFilter,
    ].filter((c) => Object.keys(c).length > 0);
    const baseWhere: Prisma.ExpenseWhereInput =
      baseParts.length === 0 ? {} : baseParts.length === 1 ? baseParts[0]! : { AND: baseParts };

    const searchWhere = buildSearchFilter(search);
    const fullWhere: Prisma.ExpenseWhereInput =
      Object.keys(searchWhere).length === 0
        ? baseWhere
        : Object.keys(baseWhere).length === 0
          ? searchWhere
          : { AND: [baseWhere, searchWhere] };

    const [scopeAgg, filteredAgg, rows] = await Promise.all([
      prisma.expense.aggregate({
        where: baseWhere,
        _count: true,
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: fullWhere,
        _count: true,
        _sum: { amount: true },
      }),
      prisma.expense.findMany({
        where: fullWhere,
        include: {
          branch: { select: { branch_name: true } },
          expenseCategory: { select: { name: true } },
          created_by: { select: { fullname: true, username: true } },
        },
        orderBy: [{ expense_date: "desc" }, { id: "desc" }],
        take: 500,
      }),
    ]);

    const scopeCount = scopeAgg._count;
    const scopeSum = Number(scopeAgg._sum.amount ?? 0);
    const filteredCount = filteredAgg._count;
    const filteredSum = Number(filteredAgg._sum.amount ?? 0);
    const filteredAvg = filteredCount > 0 ? filteredSum / filteredCount : 0;

    return NextResponse.json({
      expenses: rows.map(serializeExpense),
      stats: {
        scopeCount,
        scopeSum,
        filteredCount,
        filteredSum,
        filteredAvg,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/expenses error:", err);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    // CASHIER can create expenses against their own branch only.
    // `assertBranchWriteAccess(auth, branchId)` later in this handler
    // verifies the requested branch matches the cashier's assigned branch
    // (via `isBranchScopedRole`), so another branch's id cannot be used.
    if (
      auth.role !== "SUPER_ADMIN" &&
      auth.role !== "RESTAURANT_ADMIN" &&
      auth.role !== "BRANCH_ADMIN" &&
      auth.role !== "CASHIER"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    const created = await prisma.expense.create({
      data: {
        title,
        description: description || null,
        amount: new Decimal(amount),
        branch_id: branchId,
        expenseCategoryId: category.id,
        payment_method: paymentMethod,
        invoice_no: requiresInvoicePayment(paymentMethod) ? invoiceNo : null,
        expense_date: expenseDate,
        created_by_id: auth.id,
        terminal: 1,
      },
      include: {
        branch: { select: { branch_name: true } },
        expenseCategory: { select: { name: true } },
        created_by: { select: { fullname: true, username: true } },
      },
    });

    return NextResponse.json(serializeExpense(created), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/expenses error:", err);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}
