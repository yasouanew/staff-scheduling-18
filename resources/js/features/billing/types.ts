/**
 * Domain types for the company-management Subscription & Branch Billing feature.
 *
 * These mirror the backend `PlanSubscriptionController` + `BranchSubscriptionController`
 * payloads. They are intentionally decoupled from the transport/DTO layer (see
 * `hooks/useSubscription.ts`) so UI components depend only on stable, well-named
 * fields and never on the snake_case wire format.
 */

/* -------------------------------------------------------------------------- */
/* Plan                                                                        */
/* -------------------------------------------------------------------------- */

/** A billing cycle a plan can be purchased on. */
export type BillingCycle = 'monthly' | 'six_month' | 'yearly';

/** A plan as offered in the management plan catalogue (`GET subscription/plans`). */
export interface ManagementPlan {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    /** ISO 4217 currency code, e.g. `AUD`. */
    currency: string;
    priceMonthly: number;
    priceSixMonthly: number | null;
    priceYearly: number;
    /** Cycles the plan can be billed on. */
    interval: BillingCycle[];
    /** `null` means unlimited branches. */
    maxBranches: number | null;
    /** `null` means unlimited employees. */
    maxEmployees: number | null;
    /** Feature keys/labels granted by this plan. */
    features: string[];
}

/* -------------------------------------------------------------------------- */
/* Subscription summary                                                        */
/* -------------------------------------------------------------------------- */

/** The resolved plan block of the subscription summary. */
export interface SubscriptionPlanSummary {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    currency: string;
    priceMonthly: number;
    priceYearly: number;
    interval: BillingCycle;
    maxBranches: number | null;
    maxEmployees: number | null;
}

/** The subscription state block of the summary. */
export interface SubscriptionState {
    id: string;
    status: string;
    billingCycle: BillingCycle;
    onTrial: boolean;
    isActive: boolean;
    isCancelled: boolean;
    trialEndsAt: string | null;
    startsAt: string | null;
    endsAt: string | null;
    renewsAt: string | null;
    cancelledAt: string | null;
}

/** Trial window information from the company. */
export interface TrialInfo {
    active: boolean;
    trialEndsAt: string | null;
}

/** Branch allowance usage (`usage.branches`). */
export interface BranchUsageSummary {
    used: number;
    limit: number | null;
}

/** Per-branch employee usage from the summary/usage payloads. */
export interface BranchUsageItem {
    id: string;
    name: string;
    active: boolean;
    employeesUsed: number;
    employeeCapacity: number | null;
    remaining: number | null;
}

/** Aggregated branch + employee usage snapshot. */
export interface SubscriptionUsage {
    branches: BranchUsageSummary;
    branchUsage: BranchUsageItem[];
}

/** A single feature with its resolved entitlement state. */
export interface FeatureEntitlement {
    key: string;
    label: string;
    branchScoped: boolean;
    enabled: boolean;
    limit: number | null;
}

/** Full "my subscription" summary (`GET subscription`). */
export interface SubscriptionSummary {
    plan: SubscriptionPlanSummary | null;
    subscription: SubscriptionState | null;
    trial: TrialInfo | null;
    usage: SubscriptionUsage;
    features: FeatureEntitlement[];
    entitled: boolean;
}

/** The plan catalogue endpoint payload. */
export interface PlanCatalogue {
    plans: ManagementPlan[];
}

/** The usage endpoint payload (`GET subscription/usage`). */
export interface UsageOverview {
    branches: BranchUsageSummary;
    branchesUsage: BranchUsageItem[];
}

/* -------------------------------------------------------------------------- */
/* Branch billing actions                                                      */
/* -------------------------------------------------------------------------- */

/** Branch employee capacity as reported by the capacity endpoint. */
export interface BranchCapacityResult {
    branchId: string;
    employeeCapacity: number | null;
}

/** Mutating a branch's subscription returns fresh usage. */
export interface BranchBillingMutationResult {
    usage: SubscriptionUsage;
    employeeCapacity: number | null;
}

/** Error codes surfaced by the billing backends. */
export type BillingErrorCode =
    | 'EMPLOYEE_CAPACITY_REACHED'
    | 'BRANCH_LIMIT_REACHED'
    | 'BRANCH_NOT_ENTITLED'
    | 'FEATURE_NOT_AVAILABLE'
    | 'SUBSCRIPTION_EXPIRED'
    | 'SUBSCRIPTION_PAST_DUE'
    | 'NO_ACTIVE_SUBSCRIPTION'
    | 'DOWNGRADE_BRANCH_LIMIT_EXCEEDED'
    | 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED'
    | 'CROSS_BUSINESS_ACCESS_DENIED'
    | 'UNAUTHORIZED';
