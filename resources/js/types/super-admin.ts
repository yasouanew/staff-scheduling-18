/**
 * Domain types for the Super Admin platform (cross-tenant) module.
 *
 * These contracts describe tenant organizations, the subscription plan
 * catalogue, platform-level configuration and the aggregated revenue metrics
 * rendered across the Super Admin dashboard and management ledgers.
 */

/** Lifecycle state of a tenant's subscription. */
export type SubscriptionStatus =
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'grace_period'
    | 'suspended'
    | 'cancelled'
    | 'expired';

/** Canonical platform plan tiers. */
export type PlanTier = 'free' | 'growth' | 'enterprise';

/** Overall platform operational status. */
export type SystemHealth = 'operational' | 'degraded' | 'maintenance';

/** Semantic tones used by distribution/summary visualisations. */
export type DistributionTone = 'primary' | 'success' | 'info' | 'warning';

/** A single tenant organization on the platform. */
export interface TenantCompany {
    id: string;
    name: string;
    slug: string;
    contactEmail: string;
    tier: PlanTier;
    planName: string;
    status: SubscriptionStatus;
    /** Currently active staff scheduled by this tenant. */
    activeStaff: number;
    /** Contracted seat ceiling for the tenant's plan. */
    seatLimit: number;
    /** Monthly recurring revenue contributed by the tenant, in AUD. */
    mrr: number;
    /** Australian state/territory code, e.g. `NSW`. */
    state: string;
    createdAt: string;
    lastActiveAt: string;
}

/** A single toggleable capability within a plan. */
export interface PlanFeature {
    id: string;
    label: string;
    included: boolean;
}

/** A purchasable subscription plan tier. */
export interface SubscriptionPlan {
    id: string;
    tier: PlanTier;
    name: string;
    description: string;
    /** Monthly price in AUD. */
    monthlyPrice: number;
    /** Annual price in AUD. */
    annualPrice: number;
    /** Seat ceiling; `null` denotes unlimited seats. */
    seatLimit: number | null;
    isPublished: boolean;
    activeTenants: number;
    features: PlanFeature[];
}

/** Global platform configuration surfaced to super admins. */
export interface PlatformSettings {
    platformName: string;
    supportEmail: string;
    defaultTrialDays: number;
    signupsEnabled: boolean;
    maintenanceMode: boolean;
    currency: 'AUD';
}

/** One month on the revenue trend line. */
export interface RevenuePoint {
    /** ISO date for the first of the month. */
    month: string;
    /** Short month label, e.g. `Jan`. */
    label: string;
    /** Monthly recurring revenue for the month, in AUD. */
    mrr: number;
    /** Annualised run-rate for the month, in AUD. */
    arr: number;
}

/** Share of tenants attributed to a single plan tier. */
export interface PlanDistributionSlice {
    tier: PlanTier;
    planName: string;
    tenantCount: number;
    sharePct: number;
    tone: DistributionTone;
}

/** Aggregated revenue figures for the platform. */
export interface RevenueMetrics {
    /** Combined monthly recurring revenue, in AUD. */
    mrr: number;
    /** Annual recurring revenue (run-rate), in AUD. */
    arr: number;
    /** Month-over-month MRR growth as a percentage. */
    growthRatePct: number;
    trend: RevenuePoint[];
}

/** The platform master snapshot rendered on the Super Admin dashboard. */
export interface PlatformMetrics {
    revenue: RevenueMetrics;
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    /** Combined employees scheduled across every tenant. */
    employeesScheduled: number;
    systemHealth: SystemHealth;
    planDistribution: PlanDistributionSlice[];
}

/* -------------------------------------------------------------------------- */
/* Mutation input contracts (consumed by the data-mutation hooks)             */
/* -------------------------------------------------------------------------- */

/** Payload to suspend or reactivate a tenant. */
export interface SetTenantStatusInput {
    tenantId: string;
    status: SubscriptionStatus;
}

/** Payload to change a plan's pricing. */
export interface UpdatePlanPricingInput {
    planId: string;
    monthlyPrice: number;
    annualPrice: number;
}

/** Payload to include or restrict a plan feature. */
export interface TogglePlanFeatureInput {
    planId: string;
    featureId: string;
    included: boolean;
}

/** Payload to create a new plan tier. */
export interface CreatePlanInput {
    name: string;
    tier: PlanTier;
    description: string;
    monthlyPrice: number;
    annualPrice: number;
    seatLimit: number | null;
}
