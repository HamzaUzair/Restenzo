import type { DerivedSubscription, PlatformBillingSummary } from "@/lib/platform";

export interface PlatformOverviewPayload {
  platformOverview: {
    totalRestaurants: number;
    activeRestaurants: number;
    inactiveRestaurants: number;
    suspendedRestaurants: number;
    singleBranchRestaurants: number;
    multiBranchRestaurants: number;
    totalBranches: number;
    restaurantAdmins: number;
    branchAdmins: number;
    pendingSetup: number;
    trialDays: number;
  };
  subscriptionsByStatus: {
    active: number;
    trial: number;
    suspended: number;
    inactive: number;
    canceled: number;
  };
  billing: PlatformBillingSummary;
  tenants: PlatformTenantRow[];
  subscriptions: DerivedSubscription[];
  branchAssignmentOverview: PlatformBranchRow[];
  setupAlerts: PlatformSetupAlert[];
  recentActivity: PlatformActivityEvent[];
  recentSignups: PlatformSignupRow[];
  charts: {
    restaurantsCreated: { label: string; count: number }[];
    branchesCreated: { label: string; count: number }[];
    branchTypeDistribution: { label: string; count: number }[];
    restaurantStatusDistribution: { label: string; count: number }[];
  };
}

export interface PlatformTenantRow {
  restaurantId: number;
  name: string;
  slug: string;
  phone: string | null;
  status: string;
  type: "Single Branch" | "Multi Branch";
  hasMultipleBranches: boolean;
  branchCount: number;
  createdAt: string;
  owner: {
    userId: number;
    fullName: string;
    username: string;
  } | null;
  branchAdminsAssigned: number;
  setupComplete: boolean;
  setupIssues: string[];
  subscription: {
    planId: string;
    planName: string;
    billingCycle: "monthly" | "yearly";
    status: DerivedSubscription["status"];
    startDate: string;
    trialEndsAt: string | null;
    renewalDate: string;
    monthlyPrice: number;
    cyclePrice: number;
    paymentStatus: DerivedSubscription["paymentStatus"];
  };
}

export interface PlatformBranchRow {
  branchId: number;
  restaurantId: number;
  restaurantName: string;
  branchName: string;
  branchCode: string;
  branchAdminAssigned: boolean;
  branchAdminName: string | null;
  status: string;
  createdAt: string;
}

export interface PlatformSetupAlert {
  id: string;
  severity: "warning" | "critical";
  category:
    | "missing_restaurant_admin"
    | "no_branches"
    | "missing_branch_admin"
    | "inactive_restaurant"
    | "suspended_restaurant"
    | "trial_ending";
  title: string;
  detail: string;
  restaurantId: number;
  restaurantName: string;
}

export interface PlatformActivityEvent {
  id: string;
  type:
    | "restaurant_created"
    | "branch_created"
    | "restaurant_admin_assigned"
    | "branch_admin_assigned";
  message: string;
  createdAt: string;
}

export interface PlatformSignupRow {
  restaurantId: number;
  name: string;
  type: string;
  createdAt: string;
  status: DerivedSubscription["status"];
  planName: string;
}
