/* ── Sales List / Transaction Log types ── */

export type SaleStatus =
  | "Pending"
  | "Running"
  | "Served"
  | "Paid"
  | "Cancelled"
  | "Credit";

export type PaymentMethod = "Cash" | "Card" | "Online" | "Credit";
export type OrderType = "Dine In" | "Take Away" | "Delivery";

export interface SaleItem {
  id: string;
  name: string;
  /** Parsed from menu item name suffix, e.g. "Pizza (Large)" → "Large". */
  variationName?: string | null;
  qty: number;
  price: number; // per unit
}

export interface SaleOrder {
  id: string;           // internal uuid
  orderNo: string;      // e.g. "ORD-4914"
  /** Unique Bill ID assigned on Cashier payment, e.g. "BILL-20260420-000042". */
  billNo?: string | null;
  branchId: number;
  branchName: string;
  type: OrderType;
  table?: string;       // only for Dine In
  subtotal: number;
  discount: number;     // PKR flat
  serviceCharge: number;// PKR flat
  total: number;        // subtotal - discount + serviceCharge
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  paid: boolean;
  /**
   * Cashier-entered Card invoice / Online transaction ID. Null for
   * Cash payments and for legacy paid rows that predate this field.
   */
  paymentReferenceId?: string | null;
  createdAt: number;    // epoch ms
  items: SaleItem[];
}

export interface SaleBranch {
  id: number;
  name: string;
}

/* ── Sort direction ── */
export type SortField = "time" | "total";
export type SortDir = "asc" | "desc";
