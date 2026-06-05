/* ── Orders Management types ── */

export type OrderType = "Dine In" | "Take Away" | "Delivery";

export type OrderStatus =
  | "Pending"
  | "Running"
  | "Served"
  | "Paid"
  | "Credit"
  | "Cancelled";

export type PaymentMode = "Cash" | "Card" | "Online" | "Credit";

export interface OrderItem {
  id: string;
  name: string;
  variationName?: string | null;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  orderNo: string;
  /**
   * Unique human-readable bill number assigned the moment the cashier
   * marks the order Paid (format `BILL-YYYYMMDD-NNNNNN`). Null while
   * the order is still unpaid, and rendered as "N/A" for very old
   * legacy paid orders that predate bill numbers.
   */
  billNo?: string | null;
  branchId: number;
  branchName: string;
  type: OrderType;
  hall?: string;
  table?: string;
  notes?: string;
  total: number;
  status: OrderStatus;
  paymentMode: PaymentMode;
  createdAt: number;
  /**
   * Real kitchen timing stamped by the backend when an order moves to
   * "Running" / "Served". Null while the order is still Pending (no chef
   * has picked it up yet). All values are epoch milliseconds.
   */
  kitchenStartedAt?: number | null;
  kitchenServedAt?: number | null;
  items: OrderItem[];
  discount: number;
  discountType?: "Fixed Amount" | "Percentage" | null;
  discountValue?: number;
  discountReason?: string | null;
  subtotal?: number;
  serviceChargePercent?: number;
  gstPercent?: number;
  gstAmount?: number;
  serviceCharge: number;
  paid: boolean;
  /**
   * Cashier-entered Card invoice / Online transaction ID captured at
   * the moment of payment. Required server-side for Card / Online,
   * always `null` for Cash, and `null` for legacy paid orders that
   * were captured before this field was added.
   */
  paymentReferenceId?: string | null;
}

export const ORDER_STATUSES: OrderStatus[] = [
  "Pending",
  "Running",
  "Served",
  "Paid",
  "Credit",
  "Cancelled",
];
