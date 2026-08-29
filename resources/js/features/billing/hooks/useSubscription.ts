import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';

import { apiClient, type ApiSuccessResponse } from '@/lib/api-client';
import { normalizeFeatureList } from '@/lib/utils';

import type {
    BillingCycle,
    ManagementPlan,
    SubscriptionSummary,
    UsageOverview,
} from '../types';

/**
 * Data-access layer for the management Subscription & Branch Billing feature.
 *
 * All transport concerns (Axios, Laravel resource envelopes, snake_case DTOs)
 * live behind the exported hooks. Components consume the stable domain types in
 * `types.ts` and never touch the wire format — mirroring the branches /
 * departments / companies feature hook conventions.
 *
 * Every endpoint is scoped to the caller's own company by the backend
 * (`PlanSubscriptionController`), so no company id is threaded through here.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const SUBSCRIPTION_KEYS = {
    all: ['billing', 'management'] as const,
    summary: ['billing', 'management', 'summary'] as const,
    plans: ['billing', 'management', 'plans'] as const,
    usage: ['billing', 'management', 'usage'] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror the backend resource shapes)                        */
/* -------------------------------------------------------------------------- */

interface PlanDto {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    currency: string;
    price_monthly: number | string;
    price_six_monthly: number | string | null;
    price_yearly: number | string;
    interval: BillingCycle[];
    max_branches: number | null;
    max_employees: number | null;
    features: unknown;
}

interface PlanSummaryDto {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    currency: string;
    price_monthly: number | string;
    price_yearly: number | string;
    interval: BillingCycle;
    max_branches: number | null;
    max_employees: number | null;
}

interface SubscriptionDto {
    id: number;
    status: string;
    billing_cycle: BillingCycle;
    on_trial: boolean;
    is_active: boolean;
    is_cancelled: boolean;
    trial_ends_at: string | null;
    starts_at: string | null;
    ends_at: string | null;
    renews_at: string | null;
    cancelled_at: string | null;
}

interface TrialDto {
    active: boolean;
    trial_ends_at: string | null;
}

interface BranchUsageDto {
    branch_id?: number;
    id?: number;
    name: string;
    active: boolean;
    employees_used: number;
    capacity?: number | null;
    employee_capacity?: number | null;
    remaining: number | null;
}

interface UsageDto {
    branches: { used: number; limit: number | null };
    branch_usage?: BranchUsageDto[];
    branches_usage?: BranchUsageDto[];
}

interface FeatureDto {
    key: string;
    label: string;
    branch_scoped: boolean;
    enabled: boolean;
    limit: number | null;
}

interface SubscriptionSummaryDto {
    plan: PlanSummaryDto | null;
    subscription: SubscriptionDto | null;
    trial: TrialDto | null;
    usage: UsageDto;
    features: FeatureDto[];
    entitled: boolean;
}

interface UsageOverviewDto {
    branches: { used: number; limit: number | null };
    branches_usage: BranchUsageDto[];
}

/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                       */
/* -------------------------------------------------------------------------- */

const number = (value: number | string | null | undefined): number => Number(value ?? 0);

function mapPlan(dto: PlanDto): ManagementPlan {
    return {
        id: String(dto.id),
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        currency: dto.currency || 'AUD',
        priceMonthly: number(dto.price_monthly),
        priceSixMonthly: dto.price_six_monthly === null ? null : number(dto.price_six_monthly),
        priceYearly: number(dto.price_yearly),
        interval: Array.isArray(dto.interval) ? dto.interval : ['monthly', 'six_month', 'yearly'],
        maxBranches: dto.max_branches,
        maxEmployees: dto.max_employees,
        features: normalizeFeatureList(dto.features),
    };
}

function mapPlanSummary(dto: PlanSummaryDto | null): SubscriptionSummary['plan'] {
    if (!dto) return null;
    return {
        id: String(dto.id),
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        currency: dto.currency || 'AUD',
        priceMonthly: number(dto.price_monthly),
        priceYearly: number(dto.price_yearly),
        interval: dto.interval,
        maxBranches: dto.max_branches,
        maxEmployees: dto.max_employees,
    };
}

function mapBranchUsage(dto: BranchUsageDto) {
    const id = dto.id ?? dto.branch_id;
    const capacity = dto.employee_capacity ?? dto.capacity ?? null;
    return {
        id: id === undefined || id === null ? '' : String(id),
        name: dto.name,
        active: dto.active,
        employeesUsed: number(dto.employees_used),
        employeeCapacity: capacity === null ? null : number(capacity),
        remaining: dto.remaining === null ? null : number(dto.remaining),
    };
}

function mapUsage(dto: UsageDto): SubscriptionSummary['usage'] {
    const branchUsage = dto.branch_usage ?? dto.branches_usage ?? [];
    return {
        branches: {
            used: number(dto.branches.used),
            limit: dto.branches.limit,
        },
        branchUsage: branchUsage.map(mapBranchUsage),
    };
}

function mapSummary(dto: SubscriptionSummaryDto): SubscriptionSummary {
    return {
        plan: mapPlanSummary(dto.plan),
        subscription: dto.subscription
            ? {
                id: String(dto.subscription.id),
                status: dto.subscription.status,
                billingCycle: dto.subscription.billing_cycle,
                onTrial: dto.subscription.on_trial,
                isActive: dto.subscription.is_active,
                isCancelled: dto.subscription.is_cancelled,
                trialEndsAt: dto.subscription.trial_ends_at,
                startsAt: dto.subscription.starts_at,
                endsAt: dto.subscription.ends_at,
                renewsAt: dto.subscription.renews_at,
                cancelledAt: dto.subscription.cancelled_at,
            }
            : null,
        trial: dto.trial
            ? {
                active: dto.trial.active,
                trialEndsAt: dto.trial.trial_ends_at,
            }
            : null,
        usage: mapUsage(dto.usage),
        features: dto.features.map((feature) => ({
            key: feature.key,
            label: feature.label,
            branchScoped: feature.branch_scoped,
            enabled: feature.enabled,
            limit: feature.limit,
        })),
        entitled: dto.entitled,
    };
}

/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/** GET /subscription — the business's full billing summary. */
async function fetchSummary(): Promise<SubscriptionSummary> {
    const response = await apiClient.get<ApiSuccessResponse<SubscriptionSummaryDto>>('/subscription');
    return mapSummary(response.data.data);
}

/** GET /subscription/plans — the active plan catalogue. */
async function fetchPlans(): Promise<ManagementPlan[]> {
    const response = await apiClient.get<ApiSuccessResponse<PlanDto[]>>('/subscription/plans');
    return response.data.data.map(mapPlan);
}

/** GET /subscription/usage — current branch + per-branch employee usage. */
async function fetchUsage(): Promise<UsageOverview> {
    const response = await apiClient.get<ApiSuccessResponse<UsageOverviewDto>>('/subscription/usage');
    return {
        branches: {
            used: number(response.data.data.branches.used),
            limit: response.data.data.branches.limit,
        },
        branchesUsage: response.data.data.branches_usage.map(mapBranchUsage),
    };
}

/** POST /subscription/upgrade or /downgrade — change the active plan. */
async function changePlan(
    endpoint: 'upgrade' | 'downgrade',
    planId: string,
    billingCycle?: BillingCycle,
): Promise<SubscriptionSummary> {
    const response = await apiClient.post<ApiSuccessResponse<SubscriptionSummaryDto>>(
        `/subscription/${endpoint}`,
        { plan_id: Number(planId), billing_cycle: billingCycle },
    );
    return mapSummary(response.data.data);
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                */
/* -------------------------------------------------------------------------- */

/** Reads the business's full subscription summary. */
export function useSubscriptionSummary(): UseQueryResult<SubscriptionSummary, Error> {
    return useQuery<SubscriptionSummary, Error>({
        queryKey: SUBSCRIPTION_KEYS.summary,
        queryFn: fetchSummary,
        staleTime: 15_000,
    });
}

/** Reads the active plan catalogue. */
export function useManagementPlans(): UseQueryResult<ManagementPlan[], Error> {
    return useQuery<ManagementPlan[], Error>({
        queryKey: SUBSCRIPTION_KEYS.plans,
        queryFn: fetchPlans,
        staleTime: 60_000,
    });
}

/** Reads current branch + per-branch employee usage. */
export function useUsageOverview(): UseQueryResult<UsageOverview, Error> {
    return useQuery<UsageOverview, Error>({
        queryKey: SUBSCRIPTION_KEYS.usage,
        queryFn: fetchUsage,
        staleTime: 15_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                             */
/* -------------------------------------------------------------------------- */

/** Upgrades the subscription to a larger/equal plan and refreshes billing caches. */
export function useUpgradeSubscription(): UseMutationResult<
    SubscriptionSummary,
    Error,
    { planId: string; billingCycle?: BillingCycle }
> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionSummary, Error, { planId: string; billingCycle?: BillingCycle }>({
        mutationFn: ({ planId, billingCycle }) => changePlan('upgrade', planId, billingCycle),
        onSuccess: (summary) => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
            queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, summary);
        },
    });
}

/** Downgrades the subscription to a smaller plan and refreshes billing caches. */
export function useDowngradeSubscription(): UseMutationResult<
    SubscriptionSummary,
    Error,
    { planId: string; billingCycle?: BillingCycle }
> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionSummary, Error, { planId: string; billingCycle?: BillingCycle }>({
        mutationFn: ({ planId, billingCycle }) => changePlan('downgrade', planId, billingCycle),
        onSuccess: (summary) => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
            queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, summary);
        },
    });
}
