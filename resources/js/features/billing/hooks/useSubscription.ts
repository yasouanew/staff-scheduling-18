import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';

import { apiClient, type ApiSuccessResponse, type PaginatedCollection } from '@/lib/api-client';
import { normalizeFeatureList } from '@/lib/utils';

import type { BillingPage, BillingPayment } from '@/types/billing';

import type {
    BillingCycle,
    ManagementPlan,
    PlanChangeEstimate,
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
    payments: (page: number) => ['billing', 'management', 'payments', page] as const,
    invoices: (page: number) => ['billing', 'management', 'invoices', page] as const,
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
    max_seats?: number | null;
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
    max_seats?: number | null;
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

/** One previous/present subscription record from the summary payload. */
interface SubscriptionHistoryDto {
    id: number;
    status: string;
    billing_cycle: BillingCycle;
    plan_name: string | null;
    starts_at: string | null;
    ends_at: string | null;
    cancelled_at: string | null;
    is_current: boolean;
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
    seats?: { used: number; limit: number | null };
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

interface PlanChangeDto {
    amount_due: number | string;
    currency: string;
    renews_at: string | null;
    elapsed: number | null;
}

interface SubscriptionSummaryDto {
    plan: PlanSummaryDto | null;
    subscription: SubscriptionDto | null;
    trial: TrialDto | null;
    usage: UsageDto;
    features: FeatureDto[];
    plan_change?: PlanChangeDto | null;
    entitled: boolean;
    subscription_history?: SubscriptionHistoryDto[];
}

interface UsageOverviewDto {
    seats: { used: number; limit: number | null };
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
        // The seat cap reuses `max_employees`; prefer the explicit `max_seats`
        // field when the backend supplies it, otherwise fall back to employees.
        maxSeats: dto.max_seats !== undefined ? dto.max_seats : dto.max_employees,
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
        maxSeats: dto.max_seats !== undefined ? dto.max_seats : dto.max_employees,
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
        seats: {
            used: number(dto.seats?.used),
            limit: dto.seats?.limit ?? null,
        },
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
        subscriptionHistory: (dto.subscription_history ?? []).map((record) => ({
            id: String(record.id),
            status: record.status,
            billingCycle: record.billing_cycle,
            planName: record.plan_name,
            startsAt: record.starts_at,
            endsAt: record.ends_at,
            cancelledAt: record.cancelled_at,
            isCurrent: record.is_current,
        })),
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
        planChange: {
            amountDue: number(dto.plan_change?.amount_due),
            currency: dto.plan_change?.currency || dto.plan?.currency || 'AUD',
            renewsAt: dto.plan_change?.renews_at ?? dto.subscription?.renews_at ?? null,
            elapsed: dto.plan_change?.elapsed ?? null,
        },
        entitled: dto.entitled,
    };
}

interface SubscriptionPaymentDto {
    id: number;
    subscription_id: number;
    amount: number | string;
    amount_refunded: number | string;
    currency: string;
    payment_provider: string;
    provider_reference: string | null;
    stripe_payment_intent_id: string | null;
    status: string;
    is_refundable: boolean;
    is_refunded: boolean;
    paid_at: string | null;
    refunded_at: string | null;
    created_at: string;
    subscription?: {
        id: number;
        status: string;
        billing_cycle: BillingCycle;
        starts_at: string | null;
        ends_at: string | null;
        cancelled_at: string | null;
    } | null;
}

interface BillingPortalDto {
    url: string;
}

interface CheckoutDto {
    checkout_url: string;
    checkout_session_id: string;
}

/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                       */
/* -------------------------------------------------------------------------- */

function mapPayment(dto: SubscriptionPaymentDto): BillingPayment {
    return {
        id: String(dto.id),
        amount: number(dto.amount),
        amountRefunded: number(dto.amount_refunded),
        currency: dto.currency,
        provider: dto.payment_provider,
        reference: dto.provider_reference,
        status: dto.status,
        paidAt: dto.paid_at,
        refundedAt: dto.refunded_at,
        isRefundable: dto.is_refundable,
        isRefunded: dto.is_refunded,
        subscription: dto.subscription
            ? {
                id: String(dto.subscription.id),
                status: dto.subscription.status,
                billingCycle: dto.subscription.billing_cycle,
                startsAt: dto.subscription.starts_at,
                endsAt: dto.subscription.ends_at,
                cancelledAt: dto.subscription.cancelled_at,
            }
            : null,
    };
}

function mapPaymentPage(payload: PaginatedCollection<SubscriptionPaymentDto>): BillingPage<BillingPayment> {
    return {
        data: payload.data.map(mapPayment),
        currentPage: payload.meta.current_page,
        lastPage: payload.meta.last_page,
        total: payload.meta.total,
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
        seats: {
            used: number(response.data.data.seats.used),
            limit: response.data.data.seats.limit,
        },
        branches: {
            used: number(response.data.data.branches.used),
            limit: response.data.data.branches.limit,
        },
        branchesUsage: response.data.data.branches_usage.map(mapBranchUsage),
    };
}

/**
 * GET /subscription/plan-change — server-computed proration estimate for
 * switching to a selected plan/cycle. `amount_due` is the "rest of the money"
 * to top up to the target plan for the current period (negative = credit back
 * on a downgrade); `renews_at` mirrors the subscription's `ends_at` (a plan
 * switch never changes the renewal date).
 */
async function fetchPlanChangeEstimate(
    planId: string,
    billingCycle?: BillingCycle,
): Promise<PlanChangeEstimate> {
    const response = await apiClient.get<ApiSuccessResponse<PlanChangeDto>>('/subscription/plan-change', {
        params: { plan_id: Number(planId), billing_cycle: billingCycle },
    });
    return {
        amountDue: number(response.data.data.amount_due),
        currency: response.data.data.currency,
        renewsAt: response.data.data.renews_at,
        elapsed: response.data.data.elapsed,
    };
}

/** Result of a plan-change mutation (upgrade / downgrade). */
export interface PlanChangeResult {
    /** The (possibly unchanged) subscription summary after the request. */
    subscription: SubscriptionSummary;
    /** Whether the plan was actually switched on the server. */
    planChanged: boolean;
    /** Immediate proration charge for an upgrade (rest of the money). */
    charge: { amount: number; currency: string; reference: string | null; payment_intent: string | null } | null;
    /** Cash refund issued for a downgrade (prorated difference). */
    refund: { amount: number; currency: string; refund_id: string | null } | null;
    /** Hosted Checkout URL when the upgrade must be paid first (no card on file). */
    checkoutUrl: string | null;
}

/** POST /subscription/upgrade or /downgrade — change the active plan. */
async function changePlan(
    endpoint: 'upgrade' | 'downgrade',
    planId: string,
    billingCycle?: BillingCycle,
): Promise<PlanChangeResult> {
    const response = await apiClient.post<ApiSuccessResponse<Record<string, unknown>>>(
        `/subscription/${endpoint}`,
        { plan_id: Number(planId), billing_cycle: billingCycle },
    );

    const data = response.data.data as {
        subscription?: unknown;
        plan_changed?: boolean;
        charge?: PlanChangeResult['charge'];
        refund?: PlanChangeResult['refund'];
        checkout_url?: string | null;
        // Legacy shape: the bare subscription summary.
        plan?: unknown;
    };

    // New envelope: { subscription, plan_changed, charge, refund, checkout_url }.
    if (data && typeof data === 'object' && 'subscription' in data && data.subscription) {
        return {
            subscription: mapSummary(data.subscription as SubscriptionSummaryDto),
            planChanged: Boolean(data.plan_changed),
            charge: data.charge ?? null,
            refund: data.refund ?? null,
            checkoutUrl: data.checkout_url ?? null,
        };
    }

    // Legacy shape (bare summary) for backwards compatibility.
    return {
        subscription: mapSummary(response.data.data as unknown as SubscriptionSummaryDto),
        planChanged: true,
        charge: null,
        refund: null,
        checkoutUrl: null,
    };
}

/** GET /subscription/payments — paginated payment history for the entitled subscription. */
async function fetchPayments(pageNumber: number): Promise<BillingPage<BillingPayment>> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<SubscriptionPaymentDto>>>(
        '/subscription/payments',
        { params: { per_page: 15, page: pageNumber } },
    );
    return mapPaymentPage(response.data.data);
}

/** GET /subscription/invoices — paginated invoice history (same rows as payments). */
async function fetchInvoices(pageNumber: number): Promise<BillingPage<BillingPayment>> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<SubscriptionPaymentDto>>>(
        '/subscription/invoices',
        { params: { per_page: 15, page: pageNumber } },
    );
    return mapPaymentPage(response.data.data);
}

/** POST /subscription/billing-portal — opens the Stripe customer portal. */
async function fetchBillingPortalUrl(): Promise<string> {
    const response = await apiClient.post<ApiSuccessResponse<BillingPortalDto>>('/subscription/billing-portal');
    return response.data.data.url;
}

/** POST /subscription/checkout — starts a hosted Stripe Checkout session. */
async function startCheckout(planId: string, billingCycle: BillingCycle): Promise<string> {
    const response = await apiClient.post<ApiSuccessResponse<CheckoutDto>>('/subscription/checkout', {
        plan_id: Number(planId),
        billing_cycle: billingCycle,
    });
    return response.data.data.checkout_url;
}

/**
 * POST /subscription/checkout/retry — resumes an abandoned checkout attempt:
 * closes the stale `incomplete` row and opens a fresh Stripe session for the
 * same plan/cycle. Returns the new hosted-checkout URL.
 */
async function retryCheckout(): Promise<string> {
    const response = await apiClient.post<ApiSuccessResponse<CheckoutDto>>('/subscription/checkout/retry');
    return response.data.data.checkout_url;
}

/** POST /subscription/checkout/discard — abandons the pending `incomplete` attempt. */
async function discardIncompleteCheckout(): Promise<SubscriptionSummary> {
    const response = await apiClient.post<ApiSuccessResponse<SubscriptionSummaryDto>>(
        '/subscription/checkout/discard',
    );
    return mapSummary(response.data.data);
}

/**
 * POST /subscription/checkout/confirm — activate the local subscription after a
 * paid Stripe Checkout redirect (session id from the success URL).
 */
async function confirmCheckout(sessionId: string): Promise<SubscriptionSummary> {
    const response = await apiClient.post<ApiSuccessResponse<SubscriptionSummaryDto>>(
        '/subscription/checkout/confirm',
        { session_id: sessionId },
    );
    return mapSummary(response.data.data);
}

/** POST /subscription/cancel — cancels at the end of the current period (or immediately). */
async function cancelSubscription(immediately = false): Promise<SubscriptionSummary> {
    const response = await apiClient.post<ApiSuccessResponse<SubscriptionSummaryDto>>('/subscription/cancel', {
        immediately,
    });
    return mapSummary(response.data.data);
}

/** POST /subscription/resume — resumes the business's most recent cancelled subscription. */
async function resumeSubscription(): Promise<SubscriptionSummary> {
    const response = await apiClient.post<ApiSuccessResponse<SubscriptionSummaryDto>>('/subscription/resume');
    return mapSummary(response.data.data);
}

/** POST /subscription/billing-period — switches the active billing cycle. */
async function changeBillingPeriod(cycle: BillingCycle): Promise<SubscriptionSummary> {
    const response = await apiClient.post<ApiSuccessResponse<SubscriptionSummaryDto>>('/subscription/billing-period', {
        billing_cycle: cycle,
    });
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

/**
 * Reads the server-computed proration estimate for switching to a given
 * plan/cycle (GET /subscription/plan-change). The estimate is informational —
 * the billing provider remains authoritative for the final charge.
 */
export function usePlanChangeEstimate(
    planId: string | null,
    billingCycle?: BillingCycle,
): UseQueryResult<PlanChangeEstimate, Error> {
    return useQuery<PlanChangeEstimate, Error>({
        queryKey: ['billing', 'management', 'plan-change', planId, billingCycle],
        queryFn: () => fetchPlanChangeEstimate(planId ?? '', billingCycle),
        enabled: planId !== null && planId !== '',
        staleTime: 30_000,
    });
}

/** Reads the paginated payment history (GET /subscription/payments). */
export function useSubscriptionPayments(pageNumber = 1): UseQueryResult<BillingPage<BillingPayment>, Error> {
    return useQuery<BillingPage<BillingPayment>, Error>({
        queryKey: SUBSCRIPTION_KEYS.payments(pageNumber),
        queryFn: () => fetchPayments(pageNumber),
        placeholderData: (previous) => previous,
        staleTime: 30_000,
    });
}

/** Reads the paginated invoice history (GET /subscription/invoices). */
export function useSubscriptionInvoices(pageNumber = 1): UseQueryResult<BillingPage<BillingPayment>, Error> {
    return useQuery<BillingPage<BillingPayment>, Error>({
        queryKey: SUBSCRIPTION_KEYS.invoices(pageNumber),
        queryFn: () => fetchInvoices(pageNumber),
        placeholderData: (previous) => previous,
        staleTime: 30_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                             */
/* -------------------------------------------------------------------------- */

/** Upgrades the subscription to a larger/equal plan and refreshes billing caches. */
export function useUpgradeSubscription(): UseMutationResult<
    PlanChangeResult,
    Error,
    { planId: string; billingCycle?: BillingCycle }
> {
    const queryClient = useQueryClient();

    return useMutation<PlanChangeResult, Error, { planId: string; billingCycle?: BillingCycle }>({
        mutationFn: ({ planId, billingCycle }) => changePlan('upgrade', planId, billingCycle),
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
            queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, result.subscription);

            // No default payment method on file: the prorated "rest of the
            // money" must be paid through hosted Checkout before the plan is
            // applied — forward the admin to the payment gateway.
            if (result.checkoutUrl) {
                window.location.assign(result.checkoutUrl);
            }
        },
    });
}

/** Downgrades the subscription to a smaller plan and refreshes billing caches. */
export function useDowngradeSubscription(): UseMutationResult<
    PlanChangeResult,
    Error,
    { planId: string; billingCycle?: BillingCycle }
> {
    const queryClient = useQueryClient();

    return useMutation<PlanChangeResult, Error, { planId: string; billingCycle?: BillingCycle }>({
        mutationFn: ({ planId, billingCycle }) => changePlan('downgrade', planId, billingCycle),
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
            queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, result.subscription);
        },
    });
}

/** Opens the Stripe customer portal (billing portal) in a new tab. */
export function useBillingPortal(): UseMutationResult<string, Error, void> {
    return useMutation<string, Error, void>({
        mutationFn: () => fetchBillingPortalUrl(),
    });
}

/** Starts a self-service Stripe Checkout session and returns the redirect URL. */
export function useSelfServiceCheckout(): UseMutationResult<string, Error, { planId: string; billingCycle: BillingCycle }> {
    return useMutation<string, Error, { planId: string; billingCycle: BillingCycle }>({
        mutationFn: ({ planId, billingCycle }) => startCheckout(planId, billingCycle),
    });
}

/**
 * Confirms a paid Stripe Checkout session and activates the local subscription,
 * then refreshes all billing + session caches.
 */
export function useConfirmCheckout(): UseMutationResult<SubscriptionSummary, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionSummary, Error, string>({
        mutationFn: (sessionId) => confirmCheckout(sessionId),
        onSuccess: (summary) => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
            queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, summary);
        },
    });
}

/** Cancels the active subscription and refreshes billing caches. */
export function useCancelSubscription(): UseMutationResult<SubscriptionSummary, Error, { immediately?: boolean }> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionSummary, Error, { immediately?: boolean }>({
        mutationFn: ({ immediately = false }) => cancelSubscription(immediately),
        onSuccess: (summary) => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
            queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, summary);
        },
    });
}

/** Resumes the most recent cancelled subscription and refreshes billing caches. */
export function useResumeSubscription(): UseMutationResult<SubscriptionSummary, Error, void> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionSummary, Error, void>({
        mutationFn: () => resumeSubscription(),
        onSuccess: (summary) => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
            queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, summary);
        },
    });
}

/** Switches the active billing cycle and refreshes billing caches. */
export function useChangeBillingPeriod(): UseMutationResult<SubscriptionSummary, Error, BillingCycle> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionSummary, Error, BillingCycle>({
        mutationFn: (cycle) => changeBillingPeriod(cycle),
        onSuccess: (summary) => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
            queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, summary);
        },
    });
}

/**
 * Resumes an abandoned checkout attempt and returns the new Stripe Checkout
 * URL to redirect to. Refreshes billing caches when the caller comes back.
 */
export function useRetryCheckout(): UseMutationResult<string, Error, void> {
    const queryClient = useQueryClient();

    return useMutation<string, Error, void>({
        mutationFn: () => retryCheckout(),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
        },
    });
}

/** Discards the pending `incomplete` checkout attempt and refreshes billing caches. */
export function useDiscardIncompleteCheckout(): UseMutationResult<SubscriptionSummary, Error, void> {
    const queryClient = useQueryClient();

    return useMutation<SubscriptionSummary, Error, void>({
        mutationFn: () => discardIncompleteCheckout(),
        onSuccess: (summary) => {
            void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.all });
            queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, summary);
        },
    });
}
