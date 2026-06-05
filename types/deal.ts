/* ── Deals Management types (UI-only for now) ── */

export type DealStatus = "active" | "inactive";

export interface DealItem {
  /** Stable per-line identifier (the DealItem row id). */
  lineId?: string;
  /** Menu item id (dish_id) this line points at. */
  id: string;
  /** Display name — includes the variation suffix when present, e.g. "Pizza (Large)". */
  name: string;
  /** Base menu item name without the variation suffix. */
  itemName?: string;
  /** Selected variation id, or null for a plain (no-variation) line. */
  variationId?: number | null;
  /** Selected variation name, or null. */
  variationName?: string | null;
  /** Snapshot unit price captured when the deal was saved. */
  unitPrice?: number;
  quantity: number;
}

export interface Deal {
  id: string;
  name: string;
  type: string;
  description?: string;
  branchId: number;
  branchName: string;
  items: DealItem[];
  price: number;
  status: DealStatus;
}

export interface DealFormDataItem {
  /** Menu item id (dish_id). */
  id: string;
  /** Base menu item name. */
  name: string;
  /** Selected variation id, or null for a plain item line. */
  variationId: number | null;
  /** Selected variation name, or null. */
  variationName?: string | null;
  /** Unit price for the chosen item/variation (used for the price preview). */
  unitPrice?: number;
  quantity: number;
}

export interface DealFormData {
  name: string;
  type: string;
  branchId: number | "";
  description: string;
  status: DealStatus;
  price: string;
  items: DealFormDataItem[];
}

