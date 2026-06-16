/* ── Restaurant — top-level SaaS tenant ── */

export interface Restaurant {
  restaurant_id: number;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  status: "Active" | "Inactive" | "Suspended";
  /**
   * When true the tenant can manage multiple branches (Restaurant Admin sees
   * the Branches module). When false the tenant is single-branch and the
   * Branches UI is hidden; backend rejects additional branch creation.
   */
  has_multiple_branches: boolean;
  created_at: string;
  updated_at: string;
  branch_count?: number;
  admin_count?: number;
}

/** Fields sent when creating a restaurant (optionally together with its admin) */
export interface RestaurantFormData {
  name: string;
  slug: string;
  phone?: string;
  address?: string;
  status: "Active" | "Inactive" | "Suspended";
  /** Whether the tenant is allowed to manage multiple branches. */
  has_multiple_branches: boolean;

  /* Optional admin fields for one-step restaurant + admin creation */
  admin_full_name?: string;
  admin_username?: string;
  admin_password?: string;
  admin_confirm_password?: string;
}

export interface RestaurantDetail extends Restaurant {
  branches: Array<{
    branch_id: number;
    branch_name: string;
    branch_code: string;
    status: string;
  }>;
  admins: Array<{
    user_id: number;
    username: string;
    full_name: string;
    status: string;
  }>;
  /** Primary Restaurant Admin shown in the Super Admin edit modal. */
  primary_admin: {
    user_id: number;
    username: string;
    full_name: string;
    status: string;
  } | null;
}
