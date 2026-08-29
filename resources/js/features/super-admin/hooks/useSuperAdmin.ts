import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';
import { format, startOfMonth, subMonths } from 'date-fns';

import type {
    CreatePlanInput,
    DistributionTone,
    PlanDistributionSlice,
    PlanFeature,
    PlatformMetrics,
    PlatformSettings,
    RevenuePoint,
    SetTenantStatusInput,
    SubscriptionPlan,
    SubscriptionStatus,
    TenantCompany,
    PlanTier,
    TogglePlanFeatureInput,
    UpdatePlanPricingInput,
} from '@/types/super-admin';

/**
 * Cross-tenant data-access layer for the Super Admin platform module.
 *
 * The platform has no dedicated backend surface yet, so this module owns a
 * deterministic in-memory tenant ledger and exposes it exclusively through
 * TanStack Query hooks. Pages consume the hooks and never touch the store,
 * preserving a strict boundary between presentation and data mutation.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const SUPER_ADMIN_KEYS = {
    metrics: ['super-admin', 'metrics'] as const,
    tenants: ['super-admin', 'tenants'] as const,
    plans: ['super-admin', 'plans'] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* In-memory store (session-scoped, deterministic)                            */
/* -------------------------------------------------------------------------- */

interface SuperAdminStore {
    tenants: TenantCompany[];
    plans: SubscriptionPlan[];
    settings: PlatformSettings;
}

/** Australian states cycled across the seed tenants for realism. */
const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT'] as const;

/** `[name, tier, status, activeStaff]` seed tuples for the tenant ledger. */
const TENANT_SEED: ReadonlyArray<readonly [string, PlanTier, SubscriptionStatus, number]> = [
    ['Bondi Beach Hospitality Group', 'enterprise', 'active', 480],
    ['Melbourne Metro Retail', 'enterprise', 'active', 365],
    ['Sunshine Coast Care', 'growth', 'active', 96],
    ['Perth Logistics Co', 'growth', 'active', 132],
    ['Adelaide Events & Staffing', 'growth', 'trialing', 44],
    ['Hobart Harbour Cafes', 'free', 'active', 8],
    ['Canberra Security Services', 'growth', 'past_due', 71],
    ['Gold Coast Leisure', 'enterprise', 'suspended', 210],
    ['Darwin Remote Health', 'free', 'active', 6],
    ['Newcastle Trades Collective', 'growth', 'active', 58],
];

/** Base + per-seat monthly rate (AUD) that a tier bills at. */
function tierRate(tier: PlanTier): { base: number; perSeat: number; seatLimit: number } {
    switch (tier) {
        case 'enterprise':
            return { base: 499, perSeat: 5, seatLimit: 1000 };
        case 'growth':
            return { base: 149, perSeat: 3, seatLimit: 50 };
        default:
            return { base: 0, perSeat: 0, seatLimit: 10 };
    }
}

/** Derives a tenant's billable MRR from its tier and headcount. */
function tenantMrr(tenant: Pick<TenantCompany, 'tier' | 'activeStaff' | 'status'>): number {
    if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
        return 0;
    }
    const { base, perSeat } = tierRate(tenant.tier);
    return base + tenant.activeStaff * perSeat;
}

/** Converts a company name into a URL-safe slug. */
function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

/** Builds one immutable plan feature row. */
function feature(id: string, label: string, included: boolean): PlanFeature {
    return { id, label, included };
}

/** Seeds the deterministic tenant + plan + settings store exactly once. */
function seedStore(): SuperAdminStore {
    const now = Date.now();
    const day = 86_400_000;

    const tenants: TenantCompany[] = TENANT_SEED.map(([name, tier, status, staff], index) => {
        const slug = slugify(name);
        const planName = tier === 'enterprise' ? 'Enterprise' : tier === 'growth' ? 'Growth' : 'Free';

        return {
            id: `tnt_${index + 1}`,
            name,
            slug,
            contactEmail: `ops@${slug}.com.au`,
            tier,
            planName,
            status,
            activeStaff: staff,
            seatLimit: tierRate(tier).seatLimit,
            mrr: tenantMrr({ tier, activeStaff: staff, status }),
            state: AU_STATES[index % AU_STATES.length],
            createdAt: new Date(now - (index + 4) * 30 * day).toISOString(),
            lastActiveAt: new Date(now - (index % 5) * day).toISOString(),
        };
    });

    const countByTier = (tier: PlanTier): number =>
        tenants.filter((tenant) => tenant.tier === tier).length;

    const plans: SubscriptionPlan[] = [
        {
            id: 'plan_free',
            tier: 'free',
            name: 'Free',
            description: 'Get started with core rostering for a single small team.',
            monthlyPrice: 0,
            annualPrice: 0,
            seatLimit: 10,
            isPublished: true,
            activeTenants: countByTier('free'),
            features: [
                feature('rostering', 'Shift rostering', true),
                feature('leave', 'Leave management', true),
                feature('analytics', 'Advanced analytics', false),
                feature('sso', 'SSO / SAML', false),
                feature('api', 'API access', false),
                feature('priority', 'Priority support', false),
            ],
        },
        {
            id: 'plan_growth',
            tier: 'growth',
            name: 'Growth',
            description: 'Scale scheduling across multiple branches with insights.',
            monthlyPrice: 149,
            annualPrice: 1490,
            seatLimit: 50,
            isPublished: true,
            activeTenants: countByTier('growth'),
            features: [
                feature('rostering', 'Shift rostering', true),
                feature('leave', 'Leave management', true),
                feature('analytics', 'Advanced analytics', true),
                feature('sso', 'SSO / SAML', false),
                feature('api', 'API access', true),
                feature('priority', 'Priority support', false),
            ],
        },
        {
            id: 'plan_enterprise',
            tier: 'enterprise',
            name: 'Enterprise',
            description: 'Unlimited seats, SSO and dedicated success for large operators.',
            monthlyPrice: 499,
            annualPrice: 4990,
            seatLimit: null,
            isPublished: true,
            activeTenants: countByTier('enterprise'),
            features: [
                feature('rostering', 'Shift rostering', true),
                feature('leave', 'Leave management', true),
                feature('analytics', 'Advanced analytics', true),
                feature('sso', 'SSO / SAML', true),
                feature('api', 'API access', true),
                feature('priority', 'Priority support', true),
            ],
        },
    ];

    const settings: PlatformSettings = {
        platformName: 'RosterPro',
        supportEmail: 'support@rosterpro.com.au',
        defaultTrialDays: 14,
        signupsEnabled: true,
        maintenanceMode: false,
        currency: 'AUD',
    };

    return { tenants, plans, settings };
}

let store: SuperAdminStore | null = null;

/** Lazily initialises and returns the singleton store. */
function getStore(): SuperAdminStore {
    if (store === null) {
        store = seedStore();
    }
    return store;
}

/* -------------------------------------------------------------------------- */
/* Derivations                                                                */
/* -------------------------------------------------------------------------- */

/** Semantic tone applied to each tier in distribution visualisations. */
const TIER_TONE: Record<PlanTier, DistributionTone> = {
    free: 'info',
    growth: 'primary',
    enterprise: 'success',
};

/** Aggregates the live store into the platform-wide metrics snapshot. */
function computeMetrics(current: SuperAdminStore): PlatformMetrics {
    const activeTenants = current.tenants.filter(
        (tenant) => tenant.status === 'active' || tenant.status === 'trialing',
    );
    const mrr = activeTenants.reduce((sum, tenant) => sum + tenant.mrr, 0);
    const now = new Date();

    const trend: RevenuePoint[] = Array.from({ length: 12 }, (_, index) => {
        const month = startOfMonth(subMonths(now, 11 - index));
        const factor = 0.55 + (0.45 * index) / 11;
        const pointMrr = Math.round(mrr * factor);
        return {
            month: month.toISOString(),
            label: format(month, 'MMM'),
            mrr: pointMrr,
            arr: pointMrr * 12,
        };
    });

    const previousMrr = trend[trend.length - 2]?.mrr ?? mrr;
    const growthRatePct =
        previousMrr === 0 ? 0 : Math.round(((mrr - previousMrr) / previousMrr) * 1000) / 10;

    const totalTenants = current.tenants.length;
    const planDistribution: PlanDistributionSlice[] = current.plans.map((plan) => {
        const tenantCount = current.tenants.filter((tenant) => tenant.tier === plan.tier).length;
        return {
            tier: plan.tier,
            planName: plan.name,
            tenantCount,
            sharePct: totalTenants === 0 ? 0 : Math.round((tenantCount / totalTenants) * 100),
            tone: TIER_TONE[plan.tier],
        };
    });

    return {
        revenue: { mrr, arr: mrr * 12, growthRatePct, trend },
        totalTenants,
        activeTenants: activeTenants.length,
        suspendedTenants: current.tenants.filter((tenant) => tenant.status === 'suspended').length,
        employeesScheduled: current.tenants.reduce((sum, tenant) => sum + tenant.activeStaff, 0),
        systemHealth: current.settings.maintenanceMode ? 'maintenance' : 'operational',
        planDistribution,
    };
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                */
/* -------------------------------------------------------------------------- */

/** Reads the aggregated, cross-tenant platform metrics snapshot. */
export function usePlatformMetrics(): UseQueryResult<PlatformMetrics, Error> {
    return useQuery<PlatformMetrics, Error>({
        queryKey: SUPER_ADMIN_KEYS.metrics,
        queryFn: () => Promise.resolve(computeMetrics(getStore())),
        staleTime: 15_000,
    });
}

/** Reads the full tenant-company ledger. */
export function useTenantCompanies(): UseQueryResult<TenantCompany[], Error> {
    return useQuery<TenantCompany[], Error>({
        queryKey: SUPER_ADMIN_KEYS.tenants,
        queryFn: () => Promise.resolve(getStore().tenants.map((tenant) => ({ ...tenant }))),
        staleTime: 15_000,
    });
}

/** Reads the available subscription plan tiers. */
export function useSubscriptionPlans(): UseQueryResult<SubscriptionPlan[], Error> {
    return useQuery<SubscriptionPlan[], Error>({
        queryKey: SUPER_ADMIN_KEYS.plans,
        queryFn: () =>
            Promise.resolve(
                getStore().plans.map((plan) => ({
                    ...plan,
                    features: plan.features.map((item) => ({ ...item })),
                })),
            ),
        staleTime: 15_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                             */
/* -------------------------------------------------------------------------- */

/** Suspends or reactivates a tenant, recomputing billable MRR accordingly. */
export function useSetTenantStatus(): UseMutationResult<TenantCompany, Error, SetTenantStatusInput> {
    const queryClient = useQueryClient();

    return useMutation<TenantCompany, Error, SetTenantStatusInput>({
        mutationFn: ({ tenantId, status }) => {
            const target = getStore().tenants.find((tenant) => tenant.id === tenantId);
            if (!target) {
                return Promise.reject(new Error('Tenant not found.'));
            }
            target.status = status;
            target.mrr = tenantMrr(target);
            return Promise.resolve({ ...target });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_KEYS.tenants });
            void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_KEYS.metrics });
        },
    });
}

/** Updates a plan's monthly and annual pricing. */
export function useUpdatePlanPricing(): UseMutationResult<
    SubscriptionPlan,
    Error,
    UpdatePlanPricingInput
> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionPlan, Error, UpdatePlanPricingInput>({
        mutationFn: ({ planId, monthlyPrice, annualPrice }) => {
            const target = getStore().plans.find((plan) => plan.id === planId);
            if (!target) {
                return Promise.reject(new Error('Plan not found.'));
            }
            target.monthlyPrice = monthlyPrice;
            target.annualPrice = annualPrice;
            return Promise.resolve({ ...target, features: target.features.map((f) => ({ ...f })) });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_KEYS.plans });
        },
    });
}

/** Includes or restricts a single feature on a plan. */
export function useTogglePlanFeature(): UseMutationResult<
    SubscriptionPlan,
    Error,
    TogglePlanFeatureInput
> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionPlan, Error, TogglePlanFeatureInput>({
        mutationFn: ({ planId, featureId, included }) => {
            const target = getStore().plans.find((plan) => plan.id === planId);
            const feat = target?.features.find((item) => item.id === featureId);
            if (!target || !feat) {
                return Promise.reject(new Error('Plan feature not found.'));
            }
            feat.included = included;
            return Promise.resolve({ ...target, features: target.features.map((f) => ({ ...f })) });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_KEYS.plans });
        },
    });
}

/** Adds a new platform plan tier to the catalogue. */
export function useCreatePlan(): UseMutationResult<SubscriptionPlan, Error, CreatePlanInput> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionPlan, Error, CreatePlanInput>({
        mutationFn: (input) => {
            const created: SubscriptionPlan = {
                id: `plan_${slugify(input.name)}_${Date.now()}`,
                tier: input.tier,
                name: input.name,
                description: input.description,
                monthlyPrice: input.monthlyPrice,
                annualPrice: input.annualPrice,
                seatLimit: input.seatLimit,
                isPublished: false,
                activeTenants: 0,
                features: [
                    feature('rostering', 'Shift rostering', true),
                    feature('leave', 'Leave management', true),
                    feature('analytics', 'Advanced analytics', input.tier !== 'free'),
                    feature('sso', 'SSO / SAML', input.tier === 'enterprise'),
                    feature('api', 'API access', input.tier !== 'free'),
                    feature('priority', 'Priority support', input.tier === 'enterprise'),
                ],
            };
            getStore().plans.push(created);
            return Promise.resolve({ ...created, features: created.features.map((f) => ({ ...f })) });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_KEYS.plans });
            void queryClient.invalidateQueries({ queryKey: SUPER_ADMIN_KEYS.metrics });
        },
    });
}
