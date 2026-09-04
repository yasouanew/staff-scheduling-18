import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import {
    apiClient,
    type ApiSuccessResponse,
    type PaginatedCollection,
} from '@/lib/api-client';
import type { Company, CompanyStatus } from '@/types/company';

import type {
    DistributionTone,
    PlanDistributionSlice,
    PlatformAuditDto,
    PlatformAuditEvent,
    PlatformBillingMetrics,
    PlatformMetrics,
    PlatformMetricsDto,
    PlatformOverviewDto,
    PlatformPayment,
    PlatformPaymentDto,
    PlatformSubscription,
    PlatformSubscriptionDto,
    RecentCompanyDto,
} from '@/types/super-admin';

/**
 * Cross-tenant data-access layer for the Super Admin platform module.
 *
 * The backend is the source of truth: platform metrics come from
 * `GET /dashboard/overview` (role-aware) and the company ledger comes from
 * `GET /companies` (super-admin scope). No in-memory seed data is used —
 * everything is fetched live from the API (§41).
 *
 * Company status toggles are intentionally not defined here: the real
 * endpoint is `PUT /companies/{id}` with a `{ status }` body, which is already
 * encapsulated by `useUpdateCompanyStatus` in the companies module. Super-admin
 * pages reuse that mutation so there is exactly one status-update path.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const SUPER_ADMIN_KEYS = {
    metrics: ['super-admin', 'metrics'] as const,
    tenants: ['super-admin', 'tenants'] as const,
    suspendedTenants: ['super-admin', 'suspended-tenants'] as const,
    billing: ['super-admin', 'billing-metrics'] as const,
    subscriptions: (page: number) => ['super-admin', 'subscriptions', page] as const,
    payments: (page: number) => ['super-admin', 'payments', page] as const,
    audit: (page: number) => ['super-admin', 'audit', page] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror the backend resource shapes)                        */
/* -------------------------------------------------------------------------- */

/** Raw company payload as serialized by `CompanyResource`. */
interface CompanyDto {
    id: number;
    name: string;
    abn: string | null;
    email: string | null;
    phone: string | null;
    logo: string | null;
    timezone: string | null;
    country: string | null;
    state: string | null;
    business_type: string | null;
    status: string | null;
    trial_ends_at: string | null;
    locked_at: string | null;
    subscription_id: number | null;
    branches_count?: number;
    employees_count?: number;
    users_count?: number;
    created_at: string | null;
    updated_at: string | null;
}

/** Coerce an arbitrary backend status into the UI's status union. */
function normalizeStatus(raw: string | null | undefined): CompanyStatus {
    switch (raw) {
        case 'inactive':
            return 'inactive';
        case 'suspended':
            return 'suspended';
        default:
            return 'active';
    }
}

/** Convert a raw {@link CompanyDto} into the stable {@link Company} shape. */
function mapCompany(dto: CompanyDto): Company {
    return {
        id: String(dto.id),
        name: dto.name,
        abn: dto.abn,
        email: dto.email,
        phone: dto.phone,
        logo: dto.logo,
        timezone: dto.timezone,
        country: dto.country,
        state: dto.state,
        businessType: dto.business_type,
        status: normalizeStatus(dto.status),
        subscriptionId: dto.subscription_id,
        trialEndsAt: dto.trial_ends_at,
        lockedAt: dto.locked_at,
        branchesCount: dto.branches_count ?? null,
        employeesCount: dto.employees_count ?? null,
        usersCount: dto.users_count ?? null,
        settings: null,
        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

async function fetchPlatformMetrics(): Promise<PlatformMetrics> {
    const response = await apiClient.get<ApiSuccessResponse<PlatformOverviewDto>>('/dashboard/overview');

    const dto = response.data.data;

    // Plan distribution: map real plan rows (name + active subscription count).
    const totalPlanTenants = dto.plan_distribution.reduce((sum, plan) => sum + plan.tenant_count, 0);
    const tones: DistributionTone[] = ['primary', 'success', 'info', 'warning'];
    const planDistribution: PlanDistributionSlice[] = dto.plan_distribution.map((plan, index) => ({
        id: String(plan.id),
        planName: plan.name,
        tenantCount: plan.tenant_count,
        sharePct: totalPlanTenants > 0 ? Math.round((plan.tenant_count / totalPlanTenants) * 100) : 0,
        tone: tones[index % tones.length],
    }));

    const { stats } = dto;

    return {
        stats: {
            totalCompanies: stats.total_companies,
            activeCompanies: stats.active_companies,
            totalEmployees: stats.total_employees,
            activeSubscriptions: stats.active_subscriptions,
        },
        planDistribution,
        recentCompanies: dto.recent_companies ?? [],
    };
}

async function fetchTenantCompanies(pageNumber: number): Promise<PlatformPage<Company>> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<CompanyDto>>>(
        '/companies',
        { params: { per_page: 15, page: pageNumber } },
    );
    return mapPage(response.data.data, mapCompany);
}

/** Reads the paginated tenant-company ledger (super-admin scope). */
export function useTenantCompanies(pageNumber: number): UseQueryResult<PlatformPage<Company>, Error> {
    return useQuery<PlatformPage<Company>, Error>({
        queryKey: [...SUPER_ADMIN_KEYS.tenants, pageNumber],
        queryFn: () => fetchTenantCompanies(pageNumber),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

async function fetchSuspendedTenantCount(): Promise<number> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<CompanyDto>>>(
        '/companies',
        { params: { per_page: 1, status: 'suspended' } },
    );
    return response.data.data.meta.total;
}

/** Reads the real suspended-tenant count (backend `status=suspended` filter). */
export function useSuspendedTenantCount(): UseQueryResult<number, Error> {
    return useQuery<number, Error>({
        queryKey: SUPER_ADMIN_KEYS.suspendedTenants,
        queryFn: fetchSuspendedTenantCount,
        staleTime: 30_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                */
/* -------------------------------------------------------------------------- */

/** Reads the aggregated, cross-tenant platform metrics snapshot. */
export function usePlatformMetrics(): UseQueryResult<PlatformMetrics, Error> {
    return useQuery<PlatformMetrics, Error>({
        queryKey: SUPER_ADMIN_KEYS.metrics,
        queryFn: fetchPlatformMetrics,
        staleTime: 15_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Platform billing metrics (MRR / ARR / Revenue / Churn)                     */
/* -------------------------------------------------------------------------- */

async function fetchPlatformBillingMetrics(): Promise<PlatformBillingMetrics> {
    const response = await apiClient.get<ApiSuccessResponse<PlatformMetricsDto>>('/super-admin/metrics');
    const { metrics } = response.data.data;
    return {
        mrr: Number(metrics.mrr),
        arr: Number(metrics.arr),
        revenue: Number(metrics.revenue),
        churnRate: Number(metrics.churn.rate),
        churnedCount: Number(metrics.churn.churned_count),
        churnActiveBase: Number(metrics.churn.active_base),
    };
}

/** Reads the real MRR/ARR/Revenue/Churn aggregates for the platform dashboard. */
export function usePlatformBillingMetrics(): UseQueryResult<PlatformBillingMetrics, Error> {
    return useQuery<PlatformBillingMetrics, Error>({
        queryKey: SUPER_ADMIN_KEYS.billing,
        queryFn: fetchPlatformBillingMetrics,
        staleTime: 30_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Global subscriptions (platform admin view)                                 */
/* -------------------------------------------------------------------------- */

function mapSubscription(dto: PlatformSubscriptionDto): PlatformSubscription {
    return {
        id: String(dto.id),
        companyId: String(dto.company_id),
        companyName: dto.company?.name ?? '—',
        companyStatus: dto.company?.status ?? 'unknown',
        planId: String(dto.plan_id),
        planName: dto.plan_name ?? dto.plan?.name ?? '—',
        status: dto.status,
        billingCycle: dto.billing_cycle,
        onTrial: dto.on_trial,
        isActive: dto.is_active,
        isCancelled: dto.is_cancelled,
        startsAt: dto.starts_at,
        endsAt: dto.ends_at,
        trialEndsAt: dto.trial_ends_at,
        cancelledAt: dto.cancelled_at,
        activeBranchesCount: dto.active_branches_count ?? 0,
        createdAt: dto.created_at,
    };
}

export interface PlatformPage<T> {
    data: T[];
    currentPage: number;
    lastPage: number;
    total: number;
}

function mapPage<T, D>(payload: PaginatedCollection<D>, map: (dto: D) => T): PlatformPage<T> {
    return {
        data: payload.data.map(map),
        currentPage: payload.meta.current_page,
        lastPage: payload.meta.last_page,
        total: payload.meta.total,
    };
}

async function fetchSubscriptions(pageNumber: number): Promise<PlatformPage<PlatformSubscription>> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<PlatformSubscriptionDto>>>(
        '/super-admin/subscriptions',
        { params: { per_page: 15, page: pageNumber } },
    );
    return mapPage(response.data.data, mapSubscription);
}

/** Reads the paginated global subscriptions list (super-admin scope). */
export function usePlatformSubscriptions(pageNumber: number): UseQueryResult<PlatformPage<PlatformSubscription>, Error> {
    return useQuery<PlatformPage<PlatformSubscription>, Error>({
        queryKey: SUPER_ADMIN_KEYS.subscriptions(pageNumber),
        queryFn: () => fetchSubscriptions(pageNumber),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Global payments (platform billing view)                                    */
/* -------------------------------------------------------------------------- */

function mapPayment(dto: PlatformPaymentDto): PlatformPayment {
    return {
        id: String(dto.id),
        subscriptionId: String(dto.subscription_id),
        amount: Number(dto.amount ?? 0),
        amountRefunded: Number(dto.amount_refunded ?? 0),
        currency: dto.currency,
        provider: dto.payment_provider,
        reference: dto.provider_reference,
        status: dto.status,
        isRefundable: dto.is_refundable,
        isRefunded: dto.is_refunded,
        paidAt: dto.paid_at,
        refundedAt: dto.refunded_at,
        companyName: dto.company?.name ?? '—',
        companyStatus: dto.company?.status ?? 'unknown',
        planName: dto.plan?.name ?? null,
    };
}

async function fetchPayments(pageNumber: number): Promise<PlatformPage<PlatformPayment>> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<PlatformPaymentDto>>>(
        '/super-admin/payments',
        { params: { per_page: 15, page: pageNumber } },
    );
    return mapPage(response.data.data, mapPayment);
}

/** Reads the paginated global payments list (super-admin scope). */
export function usePlatformPayments(pageNumber: number): UseQueryResult<PlatformPage<PlatformPayment>, Error> {
    return useQuery<PlatformPage<PlatformPayment>, Error>({
        queryKey: SUPER_ADMIN_KEYS.payments(pageNumber),
        queryFn: () => fetchPayments(pageNumber),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Platform audit log                                                         */
/* -------------------------------------------------------------------------- */

function mapAudit(dto: PlatformAuditDto): PlatformAuditEvent {
    return {
        id: String(dto.id),
        event: dto.event ?? 'unknown',
        description: dto.description ?? '',
        causerName: dto.causer?.name ?? null,
        subjectType: dto.subject?.type ?? null,
        companyName: dto.company?.name ?? null,
        createdAt: dto.created_at,
    };
}

async function fetchAudit(pageNumber: number): Promise<PlatformPage<PlatformAuditEvent>> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<PlatformAuditDto>>>(
        '/super-admin/audit',
        { params: { per_page: 20, page: pageNumber } },
    );
    return mapPage(response.data.data, mapAudit);
}

/** Reads the paginated platform audit log (super-admin scope). */
export function usePlatformAudit(pageNumber: number): UseQueryResult<PlatformPage<PlatformAuditEvent>, Error> {
    return useQuery<PlatformPage<PlatformAuditEvent>, Error>({
        queryKey: SUPER_ADMIN_KEYS.audit(pageNumber),
        queryFn: () => fetchAudit(pageNumber),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

