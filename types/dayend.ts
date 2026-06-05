/* ── Day End Management types (API-aligned) ── */

export type DayEndStatus = "open" | "closed";

export interface DayEndSummary {
  branchId: number;
  branchName: string;
  businessDate: string; // YYYY-MM-DD
  status: DayEndStatus;
  openedBy: string;
  openingTime: string; // HH:mm (first order of the day) or "—"
  closedBy?: string;
  closedAt?: string; // ISO timestamp
  dayEndId?: number;
  note?: string;
}

export interface DayEndStats {
  totalOrders: number;
  totalRevenue: number;
  totalExpenses: number;
  netRevenue: number;
  averageOrderValue: number;
  cancelledOrders: number;
  grossSales: number;
  discounts: number;
  serviceCharges: number;
}

export interface PaymentBreakdown {
  method: "Cash" | "Card" | "Online" | "Credit";
  amount: number;
  count: number;
  percentage: number;
}

export interface ExpenseEntry {
  id: number;
  title: string;
  category: string;
  amount: number;
  createdAt: string; // ISO
}

export interface TopSellingItem {
  /**
   * Stable identifier when available — prefer this as a React `key` over
   * `name` so two items that happen to share a display name (e.g. two
   * branches' "Pizza" merged into the same list) don't collide.
   */
  dish_id?: number;
  name: string;
  /** Category display name. "—" when the item has no resolvable category. */
  category?: string;
  quantity: number;
  revenue: number;
}

export interface HourlySales {
  hour: string; // "HH:00"
  orders: number;
  revenue: number;
}

export interface DayEndRecord {
  id: number;
  date: string; // YYYY-MM-DD business date
  branchName: string;
  branchId: number;
  totalSales: number;
  totalExpenses: number;
  netRevenue: number;
  totalOrders: number;
  cancelledOrders: number;
  status: DayEndStatus;
  closedBy?: string;
  closedAt?: string; // ISO
  note?: string;
}

/** Response shape of GET /api/dayend?branchId=&date= */
export interface DayEndResponse {
  summary: DayEndSummary;
  stats: DayEndStats;
  payments: PaymentBreakdown[];
  expenses: ExpenseEntry[];
  /**
   * Legacy top-selling list ordered by revenue — kept so the CSV export
   * and any older consumer keeps rendering. New UI reads the dual
   * `topItemsByQuantity` / `topItemsBySales` fields below.
   */
  topItems: TopSellingItem[];
  /** Items ordered by units sold (DESC) for the selected business day. */
  topItemsByQuantity: TopSellingItem[];
  /** Items ordered by revenue (DESC) for the selected business day. */
  topItemsBySales: TopSellingItem[];
  hourlySales: HourlySales[];
}
