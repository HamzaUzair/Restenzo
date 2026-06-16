import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  assertBranchAccess,
  assertBranchActive,
  requireAuth,
} from "@/lib/server-auth";
import { formatBillNo } from "@/lib/bill-number";
import { ORDER_CANCEL_ROLES } from "@/lib/order-revenue";

const ALLOWED_KITCHEN_STATUSES = new Set(["Running", "Served"]);
/**
 * Statuses that still keep a dine-in table "Occupied". Must match the
 * companion list in `app/api/orders/route.ts`. Once an order's status leaves
 * this set, we can safely release the table.
 */
const ACTIVE_ORDER_STATUSES = ["Pending", "Running", "Served", "Credit"] as const;
const TABLE_STATUS_AVAILABLE = "Available";
const ALLOWED_CASHIER_PAYMENT_METHODS = new Set([
  "Cash",
  "Online",
  "Card",
  "Bank Transfer",
  "Easypaisa",
  "JazzCash",
]);
/**
 * Payment methods that require a cashier-entered reference / invoice ID
 * (POS terminal invoice number, online wallet transaction ID, etc.).
 * Compared case-insensitively so that "card" / "Card" / "CARD" all
 * trigger the same gate, mirroring the modal-side normalisation.
 */
const PAYMENT_METHODS_REQUIRING_REFERENCE = new Set([
  "card",
  "online",
  "bank transfer",
  "easypaisa",
  "jazzcash",
]);
const MAX_PAYMENT_REFERENCE_LENGTH = 100;
const ALLOWED_DISCOUNT_TYPES = new Set(["Fixed Amount", "Percentage"]);
const DISCOUNT_META_TAG = "[DISCOUNT_META]";
const BILLING_META_TAG = "[BILLING_META]";
const SERVICE_CHARGE_PERCENT = 5;
const DEFAULT_GST_PERCENT = 3;

function stripBillingMeta(rawComments: string | null | undefined): string {
  if (!rawComments) return "";
  const billingIdx = rawComments.indexOf(BILLING_META_TAG);
  if (billingIdx >= 0) return rawComments.slice(0, billingIdx).trim();
  const idx = rawComments.indexOf(DISCOUNT_META_TAG);
  if (idx < 0) return rawComments.trim();
  return rawComments.slice(0, idx).trim();
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const orderId = Number(id);

    if (Number.isNaN(orderId)) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const body = await request.json();
    const nextStatus = String(body?.status ?? "").trim();
    const paymentMethod = String(body?.paymentMethod ?? "").trim();
    const discountType = String(body?.discountType ?? "").trim();
    const discountValueRaw = Number(body?.discountValue ?? 0);
    const discountReason = String(body?.discountReason ?? "").trim();
    const gstPercentRaw = Number(body?.gstPercent ?? DEFAULT_GST_PERCENT);
    // Cashier-entered payment reference (Card invoice / Online txn ID).
    // Trimmed once here so every downstream check / write sees the
    // canonical value. Stays "" when omitted so the Cash branch still
    // works without sending the field at all.
    const paymentReferenceIdRaw = String(body?.paymentReferenceId ?? "").trim();

    const existing = await prisma.order.findUnique({
      where: { order_id: orderId },
      select: {
        order_id: true,
        branch_id: true,
        table_id: true,
        order_type: true,
        order_status: true,
        g_total_amount: true,
        net_total_amount: true,
        discount_amount: true,
        service_charge: true,
        comments: true,
        kitchen_started_at: true,
        kitchen_served_at: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await assertBranchAccess(auth, existing.branch_id);
    // Freeze operational writes (kitchen Running/Served, cashier Paid) on
    // archived branches. `assertBranchWriteAccess` isn't used here because
    // the per-role gates below already encode who may flip each status;
    // we just need the active-branch check on top of that.
    await assertBranchActive(auth, existing.branch_id);

    const isKitchenTransition = ALLOWED_KITCHEN_STATUSES.has(nextStatus);
    const isCashierTransition = nextStatus === "Paid";
    const isCancelTransition = nextStatus === "Cancelled";

    if (!isKitchenTransition && !isCashierTransition && !isCancelTransition) {
      return NextResponse.json(
        { error: "Status transition not allowed" },
        { status: 400 }
      );
    }

    if (isCancelTransition) {
      if (!ORDER_CANCEL_ROLES.has(auth.role)) {
        return NextResponse.json(
          { error: "You are not allowed to cancel orders" },
          { status: 403 }
        );
      }
      if (existing.order_status !== "Pending") {
        return NextResponse.json(
          { error: "Only pending orders can be cancelled" },
          { status: 400 }
        );
      }
    }

    if (isKitchenTransition) {
      if (auth.role !== "LIVE_KITCHEN" && auth.role !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only Live Kitchen can update kitchen status" },
          { status: 403 }
        );
      }
      if (existing.order_status !== "Pending" && existing.order_status !== "Running") {
        return NextResponse.json(
          {
            error:
              "Only Pending/Running orders can be moved through kitchen workflow",
          },
          { status: 400 }
        );
      }
      if (nextStatus === "Running" && existing.order_status !== "Pending") {
        return NextResponse.json(
          { error: "Only Pending orders can be marked Running" },
          { status: 400 }
        );
      }
      if (nextStatus === "Served" && existing.order_status !== "Running") {
        return NextResponse.json(
          { error: "Only Running orders can be marked Served" },
          { status: 400 }
        );
      }
    }

    if (isCashierTransition) {
      if (auth.role !== "CASHIER" && auth.role !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only Cashier can mark orders as Paid" },
          { status: 403 }
        );
      }
      if (existing.order_status !== "Served") {
        return NextResponse.json(
          { error: "Only Served orders can be marked Paid" },
          { status: 400 }
        );
      }
      if (!ALLOWED_CASHIER_PAYMENT_METHODS.has(paymentMethod)) {
        return NextResponse.json(
          { error: "Select a valid payment method" },
          { status: 400 }
        );
      }

      if (
        PAYMENT_METHODS_REQUIRING_REFERENCE.has(paymentMethod.toLowerCase())
      ) {
        if (!paymentReferenceIdRaw) {
          const label = paymentMethod.toLowerCase() === "card" ? "card" : "online";
          return NextResponse.json(
            {
              error: `Payment reference ID is required for ${label} payments.`,
            },
            { status: 400 }
          );
        }
        if (paymentReferenceIdRaw.length > MAX_PAYMENT_REFERENCE_LENGTH) {
          return NextResponse.json(
            {
              error: `Payment reference ID must be ${MAX_PAYMENT_REFERENCE_LENGTH} characters or fewer.`,
            },
            { status: 400 }
          );
        }
      }

      if (!Number.isFinite(discountValueRaw) || discountValueRaw < 0) {
        return NextResponse.json(
          { error: "Discount value must be a valid non-negative number" },
          { status: 400 }
        );
      }
      if (!Number.isFinite(gstPercentRaw) || gstPercentRaw < 0) {
        return NextResponse.json(
          { error: "GST must be a valid non-negative number" },
          { status: 400 }
        );
      }
      if (gstPercentRaw > 100) {
        return NextResponse.json(
          { error: "GST percentage cannot exceed 100" },
          { status: 400 }
        );
      }
    }

    const safeSubtotal = Math.max(0, Number(existing.g_total_amount));
    let discountAmount = 0;
    let normalizedDiscountType: "Fixed Amount" | "Percentage" | null = null;
    let normalizedDiscountValue = 0;

    if (isCashierTransition && discountValueRaw > 0) {
      if (!ALLOWED_DISCOUNT_TYPES.has(discountType)) {
        return NextResponse.json(
          { error: "Select a valid discount type" },
          { status: 400 }
        );
      }
      normalizedDiscountType = discountType as "Fixed Amount" | "Percentage";
      normalizedDiscountValue = discountValueRaw;

      if (normalizedDiscountType === "Percentage") {
        if (discountValueRaw > 100) {
          return NextResponse.json(
            { error: "Percentage discount cannot exceed 100" },
            { status: 400 }
          );
        }
        discountAmount = (safeSubtotal * discountValueRaw) / 100;
      } else {
        discountAmount = discountValueRaw;
      }

      if (discountAmount > safeSubtotal) {
        return NextResponse.json(
          { error: "Discount cannot exceed subtotal" },
          { status: 400 }
        );
      }
      if (!discountReason) {
        return NextResponse.json(
          { error: "Discount reason is required when discount is applied" },
          { status: 400 }
        );
      }
    }

    const discountedSubtotal = Math.max(0, safeSubtotal - Number(discountAmount));
    const serviceChargeAmount = (discountedSubtotal * SERVICE_CHARGE_PERCENT) / 100;
    const normalizedGstPercent = isCashierTransition ? gstPercentRaw : DEFAULT_GST_PERCENT;
    const gstAmount =
      ((discountedSubtotal + serviceChargeAmount) * normalizedGstPercent) / 100;
    const finalTotal = discountedSubtotal + serviceChargeAmount + gstAmount;
    if (isCashierTransition && finalTotal < 0) {
      return NextResponse.json(
        { error: "Final total cannot be negative" },
        { status: 400 }
      );
    }

    const baseNotes = stripBillingMeta(existing.comments);
    const commentsWithMeta =
      isCashierTransition
        ? `${baseNotes}${
            baseNotes ? "\n" : ""
          }${BILLING_META_TAG}${JSON.stringify({
            discountType: discountAmount > 0 ? normalizedDiscountType : null,
            discountValue: discountAmount > 0 ? normalizedDiscountValue : 0,
            discountReason: discountAmount > 0 ? discountReason : null,
            serviceChargePercent: SERVICE_CHARGE_PERCENT,
            serviceChargeAmount,
            gstPercent: normalizedGstPercent,
            gstAmount,
            subtotal: safeSubtotal,
          })}`
        : baseNotes || null;

    // Stamp real kitchen timing on the status flip so the timer is
    // authoritative in the DB (survives refresh, powers reports). We only
    // write kitchen_started_at the first time to protect against accidental
    // re-flips that would reset the elapsed clock.
    const kitchenTimestampData: {
      kitchen_started_at?: Date;
      kitchen_served_at?: Date;
    } = {};
    const nowDate = new Date();
    if (isKitchenTransition && nextStatus === "Running" && !existing.kitchen_started_at) {
      kitchenTimestampData.kitchen_started_at = nowDate;
    }
    if (isKitchenTransition && nextStatus === "Served") {
      kitchenTimestampData.kitchen_served_at = nowDate;
      // Defensive: if somehow an order reaches Served without ever having
      // been marked Running (e.g. legacy row or admin override), backfill
      // kitchen_started_at to created_at so the final prep number isn't null.
      if (!existing.kitchen_started_at) {
        kitchenTimestampData.kitchen_started_at = nowDate;
      }
    }

    const updated = await prisma.order.update({
      where: { order_id: orderId },
      data: {
        order_status: nextStatus,
        ...kitchenTimestampData,
        ...(isCashierTransition
          ? {
              payment_mode: paymentMethod,
              discount_amount: new Prisma.Decimal(discountAmount),
              service_charge: new Prisma.Decimal(serviceChargeAmount),
              net_total_amount: new Prisma.Decimal(finalTotal),
              comments: commentsWithMeta,
            }
          : {}),
      },
      select: {
        order_id: true,
        order_status: true,
        payment_mode: true,
        discount_amount: true,
        net_total_amount: true,
        kitchen_started_at: true,
        kitchen_served_at: true,
      },
    });

    // Generated once and reused for DB write + response so the client
    // sees the exact same value that was stored.
    const billNo = isCashierTransition
      ? formatBillNo(updated.order_id, nowDate)
      : null;

    // Persist the cashier-entered Card invoice / Online txn ID alongside
    // the Bill ID. Cash payments don't require this so we explicitly
    // store NULL to keep the audit trail clean.
    const externalReference =
      isCashierTransition &&
      PAYMENT_METHODS_REQUIRING_REFERENCE.has(paymentMethod.toLowerCase()) &&
      paymentReferenceIdRaw
        ? paymentReferenceIdRaw
        : null;

    if (isCashierTransition) {
      await prisma.payment.create({
        data: {
          order_id: updated.order_id,
          branch_id: existing.branch_id,
          amount: new Prisma.Decimal(updated.net_total_amount),
          method:
            paymentMethod === "Cash"
              ? "CASH"
              : paymentMethod === "Card"
              ? "CARD"
              : paymentMethod === "Bank Transfer"
              ? "BANK_TRANSFER"
              : paymentMethod === "Easypaisa"
              ? "EASYPaisa"
              : paymentMethod === "JazzCash"
              ? "JAZZCash"
              : "BANK_TRANSFER",
          status: "PAID",
          // The bill number IS the payment reference — human-readable,
          // unique, and surfaced on every receipt / audit page.
          reference: billNo,
          external_reference: externalReference,
          paid_at: nowDate,
          created_by_id: auth.id,
        },
      });

      // Release the dine-in table once payment is booked, but only if no
      // other order on the same table is still active. This keeps multi-
      // booking edge cases (shouldn't happen, but be defensive) safe.
      if (existing.table_id) {
        const stillActive = await prisma.order.findFirst({
          where: {
            table_id: existing.table_id,
            order_id: { not: existing.order_id },
            order_status: { in: [...ACTIVE_ORDER_STATUSES] },
          },
          select: { order_id: true },
        });
        if (!stillActive) {
          await prisma.table.update({
            where: { table_id: existing.table_id },
            data: { status: TABLE_STATUS_AVAILABLE },
          });
        }
      }
    }

    if (isCancelTransition && existing.table_id) {
      const stillActive = await prisma.order.findFirst({
        where: {
          table_id: existing.table_id,
          order_id: { not: existing.order_id },
          order_status: { in: [...ACTIVE_ORDER_STATUSES] },
        },
        select: { order_id: true },
      });
      if (!stillActive) {
        await prisma.table.update({
          where: { table_id: existing.table_id },
          data: { status: TABLE_STATUS_AVAILABLE },
        });
      }
    }

    return NextResponse.json({
      id: String(updated.order_id),
      status: updated.order_status,
      kitchenStartedAt: updated.kitchen_started_at
        ? new Date(updated.kitchen_started_at).getTime()
        : null,
      kitchenServedAt: updated.kitchen_served_at
        ? new Date(updated.kitchen_served_at).getTime()
        : null,
      paymentMode: updated.payment_mode,
      discountAmount: Number(updated.discount_amount),
      discountType: normalizedDiscountType,
      discountValue: normalizedDiscountValue,
      discountReason: discountAmount > 0 ? discountReason : null,
      subtotal: safeSubtotal,
      serviceChargePercent: SERVICE_CHARGE_PERCENT,
      serviceChargeAmount,
      gstPercent: normalizedGstPercent,
      gstAmount,
      finalTotal: Number(updated.net_total_amount),
      // Real, saved Bill ID for the Paid Receipt modal. `null` for
      // non-cashier (kitchen) transitions where no payment row exists.
      billNo,
      // Cashier-entered Card / Online reference; `null` for Cash and for
      // kitchen transitions.
      paymentReferenceId: externalReference,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PATCH /api/orders/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    );
  }
}
