/** Statuses that count toward revenue / booked sales across reports. */
export const BOOKED_SALES_STATUSES = [
  "Paid",
  "Credit",
  "Complete",
  "Bill Generated",
] as const;

/** Order statuses visible to Order Taker on the orders listing. */
export const ORDER_TAKER_VISIBLE_STATUSES = [
  "Pending",
  "Running",
  "Served",
  "Cancelled",
] as const;

export function isBookedSalesStatus(status: string): boolean {
  return (BOOKED_SALES_STATUSES as readonly string[]).includes(status);
}

export function isOrderTakerVisibleStatus(status: string): boolean {
  return (ORDER_TAKER_VISIBLE_STATUSES as readonly string[]).includes(status);
}

/** Roles allowed to cancel a Pending order (Pending → Cancelled only). */
export const ORDER_CANCEL_ROLES = new Set([
  "ORDER_TAKER",
  "BRANCH_ADMIN",
  "RESTAURANT_ADMIN",
  "SUPER_ADMIN",
]);
