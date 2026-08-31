/**
 * Domain types for the Super Admin platform (cross-tenant) module.
 *
 * These contracts describe the aggregated platform snapshot (`/dashboard/overview`
 * for super admins) and the cross-tenant company ledger (`/companies`). The
 * backend is the single source of truth — every value rendered here is fetched
 * live from the API (§41), never seeded in-memory.
 */

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/** Lifecycle state of a company account (mirrors `types/company`). */
export type CompanyStatus = 'active' | 'inactive' | 'suspended';

/** Semantic tones used by distribution/summary visualisations. */
export type DistributionTone = 'primary' | 'success' | 'info' | 'warning';

/* -------------------------------------------------------------------------- */
/* Platform snapshot (mirrors `GET /dashboard/overview` for super admins)     */
/* -------------------------------------------------------------------------- */

/** Raw transport shape for a single plan-distribution row. */
export interface PlanDistributionDto {
    id: number;
    name: string;
    tenant_count: number;
}

/** Raw transport shape for a recently onboarded company row. */
export interface RecentCompanyDto {
    id: number;
    name: string;
    status: string;
    created_at: string;
}

/** Raw platform-scoped payload serialized by `DashboardController::platformOverview`. */
export interface PlatformOverviewDto {
    scope: 'platform';
    stats: {
        total_companies: number;
        active_companies: number;
        total_employees: number;
        active_subscriptions: number;
    };
    plan_distribution: PlanDistributionDto[];
    recent_companies: RecentCompanyDto[];
}

/** Aggregated platform counters rendered across the dashboard ribbon. */
export interface PlatformStats {
    totalCompanies: number;
    activeCompanies: number;
    totalEmployees: number;
    activeSubscriptions: number;
}

/** Share of tenants attributed to a single plan. */
export interface PlanDistributionSlice {
    id: string;
    planName: string;
    tenantCount: number;
    sharePct: number;
    tone: DistributionTone;
}

/** The platform master snapshot rendered on the Super Admin dashboard. */
export interface PlatformMetrics {
    stats: PlatformStats;
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    /** Combined employees across every tenant. */
    employeesScheduled: number;
    planDistribution: PlanDistributionSlice[];
    /** Most recently created companies (from the platform overview). */
    recentCompanies: RecentCompanyDto[];
    /** Real MRR/ARR/Revenue/Churn aggregates (backend-derived). */
    billing?: PlatformBillingMetrics;
}

/* -------------------------------------------------------------------------- */
/* Platform billing metrics (MRR / ARR / Revenue / Churn)                     */
/* -------------------------------------------------------------------------- */

/** Churn breakdown returned by the platform metrics endpoint. */
export interface ChurnBreakdown {
    churned_count: number;
    active_base: number;
    rate: number;
}

/** Raw payload of `GET /super-admin/metrics`. */
export interface PlatformMetricsDto {
    scope: 'platform';
    metrics: {
        mrr: number;
        arr: number;
        revenue: number;
        churn: ChurnBreakdown;
    };
}

/** Normalised MRR/ARR/Revenue/Churn metrics for the dashboard ribbon. */
export interface PlatformBillingMetrics {
    mrr: number;
    arr: number;
    revenue: number;
    churnRate: number;
    churnedCount: number;
    churnActiveBase: number;
}

/* -------------------------------------------------------------------------- */
/* Global subscriptions (GET /super-admin/subscriptions)                      */
/* -------------------------------------------------------------------------- */

/** Raw subscription row as serialized by the super-admin endpoint. */
export interface PlatformSubscriptionDto {
    id: number;
    company_id: number;
    user_id: number | null;
    plan_id: number;
    stripe_id: string | null;
    stripe_status: string | null;
    stripe_price: string | null;
    quantity: number | null;
    status: string;
    billing_cycle: 'monthly' | 'six_month' | 'yearly' | string;
    on_trial: boolean;
    is_active: boolean;
    is_cancelled: boolean;
    starts_at: string | null;
    ends_at: string | null;
    trial_ends_at: string | null;
    cancelled_at: string | null;
    company: { id: number; name: string; status: string } | null;
    plan: { id: number; name: string; slug: string } | null;
    plan_name: string | null;
    active_branches_count: number;
    created_at: string | null;
    updated_at: string | null;
}

/** Normalised global subscription row for the platform Subscriptions page. */
export interface PlatformSubscription {
    id: string;
    companyId: string;
    companyName: string;
    companyStatus: string;
    planId: string;
    planName: string;
    status: string;
    billingCycle: string;
    onTrial: boolean;
    isActive: boolean;
    isCancelled: boolean;
    startsAt: string | null;
    endsAt: string | null;
    trialEndsAt: string | null;
    cancelledAt: string | null;
    activeBranchesCount: number;
    createdAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Global payments (GET /super-admin/payments)                                */
/* -------------------------------------------------------------------------- */

/** Raw payment row as serialized by the super-admin endpoint. */
export interface PlatformPaymentDto {
    id: number;
    subscription_id: number;
    amount: number | string;
    amount_refunded: number | string;
    currency: string;
    payment_provider: string;
    provider_reference: string | null;
    status: string;
    is_refundable: boolean;
    is_refunded: boolean;
    paid_at: string | null;
    refunded_at: string | null;
    company: { id: number; name: string; status: string } | null;
    plan: { id: number; name: string } | null;
    created_at: string | null;
}

/** Normalised global payment row for the platform Payments page. */
export interface PlatformPayment {
    id: string;
    subscriptionId: string;
    amount: number;
    amountRefunded: number;
    currency: string;
    provider: string;
    reference: string | null;
    status: string;
    isRefundable: boolean;
    isRefunded: boolean;
    paidAt: string | null;
    refundedAt: string | null;
    companyName: string;
    companyStatus: string;
    planName: string | null;
}

/* -------------------------------------------------------------------------- */
/* Platform audit log (GET /super-admin/audit)                                */
/* -------------------------------------------------------------------------- */

/** Raw audit row as serialized by the super-admin endpoint. */
export interface PlatformAuditDto {
    id: number;
    log_name: string | null;
    event: string | null;
    description: string | null;
    properties: Record<string, unknown> | null;
    causer: { id: number; name: string; email: string } | null;
    subject: { type: string; id: number | string } | null;
    company: { id: number; name: string } | null;
    created_at: string | null;
}

/** Normalised audit row for the platform Audit page. */
export interface PlatformAuditEvent {
    id: string;
    event: string;
    description: string;
    causerName: string | null;
    subjectType: string | null;
    companyName: string | null;
    createdAt: string | null;
}
