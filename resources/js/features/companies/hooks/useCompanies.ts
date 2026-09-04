import {
    useMutation,
    useQuery,
    useQueryClient,
    keepPreviousData,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';

import {
    apiClient,
    type ApiSuccessResponse,
    type PaginatedCollection,
    type PaginationMeta,
} from '@/lib/api-client';
import type {
    Company,
    CompanyListParams,
    CompanySettings,
    CompanyStatus,
    CompanySubscription,
} from '@/types/company';
import type { CompanyFormValues, CompanySettingsFormValues } from '../schemas';

/**
 * Data-access layer for the Companies feature.
 *
 * All transport concerns (Axios, Laravel resource envelopes, snake_case DTOs)
 * live behind the exported hooks. Components consume the stable {@link Company}
 * / {@link CompanySettings} domain types and never touch the wire format.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const COMPANIES_KEYS = {
    all: ['companies'] as const,
    list: (params: CompanyListParams) => ['companies', 'list', params] as const,
    detail: (id: string) => ['companies', 'detail', id] as const,
    settings: (id: string) => ['companies', 'settings', id] as const,
    subscriptions: (id: string) => ['companies', 'subscriptions', id] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror the backend API resources)                          */
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
    settings?: CompanySettingsDto | null;
    created_at: string | null;
    updated_at: string | null;
}

/** Raw settings payload as serialized by `CompanySettingResource`. */
interface CompanySettingsDto {
    id: number;
    company_id: number;
    timezone?: string | null;
    date_format?: string | null;
    time_format?: string | null;
    week_start_day?: string | null;
    default_shift_duration?: number | null;
    default_break_minutes?: number | null;
    currency?: string | null;
    language?: string | null;
    allow_shift_swap?: boolean | number | null;
    allow_employee_availability?: boolean | number | null;
    allow_leave_requests?: boolean | number | null;
    allow_push_notifications?: boolean | number | null;
    logo?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
}

/** Raw subscription payload (subset) as serialized by `SubscriptionResource`. */
interface SubscriptionDto {
    id: number;
    status: string | null;
    stripe_status: string | null;
    billing_cycle: string | null;
    on_trial: boolean;
    is_active: boolean;
    is_cancelled: boolean;
    starts_at: string | null;
    ends_at: string | null;
    trial_ends_at: string | null;
    plan?: { id: number; name: string } | null;
}

/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                       */
/* -------------------------------------------------------------------------- */

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
        settings: dto.settings ? mapSettings(dto.settings) : null,
        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

/** Best-effort boolean coercion (Laravel may serialize 0/1 or true/false). */
function toBool(value: boolean | number | null | undefined): boolean {
    return value === true || value === 1;
}

/** Convert a raw {@link CompanySettingsDto} into {@link CompanySettings}. */
function mapSettings(dto: CompanySettingsDto): CompanySettings {
    return {
        id: dto.id,
        companyId: dto.company_id,
        timezone: dto.timezone ?? 'Australia/Sydney',
        dateFormat: dto.date_format ?? 'd/m/Y',
        timeFormat: dto.time_format === '12h' ? '12h' : '24h',
        weekStartDay: dto.week_start_day ?? 'Monday',
        defaultShiftDuration: dto.default_shift_duration ?? 480,
        defaultBreakMinutes: dto.default_break_minutes ?? 30,
        currency: dto.currency ?? 'AUD',
        language: dto.language ?? 'en',
        allowShiftSwap: toBool(dto.allow_shift_swap),
        allowEmployeeAvailability: toBool(dto.allow_employee_availability),
        allowLeaveRequests: toBool(dto.allow_leave_requests),
        allowPushNotifications: toBool(dto.allow_push_notifications),
        logo: dto.logo ?? null,
        primaryColor: dto.primary_color ?? null,
        secondaryColor: dto.secondary_color ?? null,
    };
}

/** Convert a raw {@link SubscriptionDto} into {@link CompanySubscription}. */
function mapSubscription(dto: SubscriptionDto): CompanySubscription {
    return {
        id: dto.id,
        status: dto.status ?? 'unknown',
        stripeStatus: dto.stripe_status,
        billingCycle: dto.billing_cycle,
        planName: dto.plan?.name ?? null,
        onTrial: dto.on_trial,
        isActive: dto.is_active,
        isCancelled: dto.is_cancelled,
        startsAt: dto.starts_at,
        endsAt: dto.ends_at,
        trialEndsAt: dto.trial_ends_at,
    };
}

/** A page of companies plus its pagination metadata. */
export interface CompaniesPage {
    data: Company[];
    meta: PaginationMeta;
}

/* -------------------------------------------------------------------------- */
/* Form values -> request payload mapping                                     */
/* -------------------------------------------------------------------------- */

/** Serialize company form values into the snake_case backend payload. */
function toCompanyPayload(values: CompanyFormValues): Record<string, unknown> {
    return {
        name: values.name,
        abn: values.abn ?? null,
        email: values.email ?? null,
        phone: values.phone ?? null,
        logo: values.logo ?? null,
        timezone: values.timezone,
        country: values.country ?? null,
        state: values.state ?? null,
        business_type: values.businessType ?? null,
        status: values.status,
        subscription_id: values.subscriptionId ?? null,
    };
}

/** Serialize settings form values into the snake_case backend payload. */
function toSettingsPayload(values: CompanySettingsFormValues): Record<string, unknown> {
    return {
        timezone: values.timezone,
        date_format: values.dateFormat,
        time_format: values.timeFormat,
        week_start_day: values.weekStartDay,
        default_shift_duration: values.defaultShiftDuration,
        default_break_minutes: values.defaultBreakMinutes,
        currency: values.currency,
        language: values.language,
        allow_shift_swap: values.allowShiftSwap,
        allow_employee_availability: values.allowEmployeeAvailability,
        allow_leave_requests: values.allowLeaveRequests,
        allow_push_notifications: values.allowPushNotifications,
        logo: values.logo ?? null,
        primary_color: values.primaryColor ?? null,
        secondary_color: values.secondaryColor ?? null,
    };
}

/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/** GET /companies — paginated, searchable, filterable list. */
async function fetchCompanies(params: CompanyListParams): Promise<CompaniesPage> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<CompanyDto>>>(
        '/companies',
        {
            params: {
                search: params.search || undefined,
                status: params.status || undefined,
                business_type: params.businessType || undefined,
                per_page: params.perPage ?? 15,
            },
        },
    );

    return {
        data: response.data.data.data.map(mapCompany),
        meta: response.data.data.meta,
    };
}

/** GET /companies/{id} — single company with relation counts + settings. */
async function fetchCompany(id: string): Promise<Company> {
    const response = await apiClient.get<ApiSuccessResponse<CompanyDto>>(`/companies/${id}`);
    return mapCompany(response.data.data);
}

/** GET /companies/{id}/settings — operational + localisation settings. */
async function fetchCompanySettings(id: string): Promise<CompanySettings> {
    const response = await apiClient.get<ApiSuccessResponse<CompanySettingsDto>>(
        `/companies/${id}/settings`,
    );
    return mapSettings(response.data.data);
}

/**
 * GET /companies/{id}/subscriptions — the company's current subscription.
 *
 * Returns the most recent subscription (the list endpoint is ordered newest
 * first), or `null` when the company has never subscribed. A 403 (insufficient
 * permission) resolves to `null` so the detail page degrades gracefully rather
 * than erroring.
 */
async function fetchCurrentSubscription(id: string): Promise<CompanySubscription | null> {
    try {
        const response = await apiClient.get<
            ApiSuccessResponse<PaginatedCollection<SubscriptionDto>>
        >(`/companies/${id}/subscriptions`, { params: { per_page: 1 } });

        const first = response.data.data.data[0];
        return first ? mapSubscription(first) : null;
    } catch {
        return null;
    }
}

/** POST /companies — create a company. */
async function createCompany(values: CompanyFormValues): Promise<Company> {
    const response = await apiClient.post<ApiSuccessResponse<CompanyDto>>(
        '/companies',
        toCompanyPayload(values),
    );
    return mapCompany(response.data.data);
}

/** PUT /companies/{id} — update a company. */
async function updateCompany(id: string, values: CompanyFormValues): Promise<Company> {
    const response = await apiClient.put<ApiSuccessResponse<CompanyDto>>(
        `/companies/${id}`,
        toCompanyPayload(values),
    );
    return mapCompany(response.data.data);
}

/** PUT /companies/{id} — update only the status (used by status toggles). */
async function updateCompanyStatus(id: string, status: CompanyStatus): Promise<Company> {
    const response = await apiClient.put<ApiSuccessResponse<CompanyDto>>(`/companies/${id}`, {
        status,
    });
    return mapCompany(response.data.data);
}

/** PUT /companies/{id}/settings — update operational settings. */
async function updateCompanySettings(
    id: string,
    values: CompanySettingsFormValues,
): Promise<CompanySettings> {
    const response = await apiClient.put<ApiSuccessResponse<CompanySettingsDto>>(
        `/companies/${id}/settings`,
        toSettingsPayload(values),
    );
    return mapSettings(response.data.data);
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                */
/* -------------------------------------------------------------------------- */

/** Reads a page of companies. Keeps the previous page while fetching the next. */
export function useCompanies(params: CompanyListParams): UseQueryResult<CompaniesPage, Error> {
    return useQuery<CompaniesPage, Error>({
        queryKey: COMPANIES_KEYS.list(params),
        queryFn: () => fetchCompanies(params),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Reads a single company by id. */
export function useCompany(id: string): UseQueryResult<Company, Error> {
    return useQuery<Company, Error>({
        queryKey: COMPANIES_KEYS.detail(id),
        queryFn: () => fetchCompany(id),
        enabled: Boolean(id),
        staleTime: 15_000,
    });
}

/** Reads a company's operational settings. */
export function useCompanySettings(id: string): UseQueryResult<CompanySettings, Error> {
    return useQuery<CompanySettings, Error>({
        queryKey: COMPANIES_KEYS.settings(id),
        queryFn: () => fetchCompanySettings(id),
        enabled: Boolean(id),
        staleTime: 15_000,
    });
}

/** Reads a company's current subscription (or `null`). */
export function useCompanySubscription(
    id: string,
): UseQueryResult<CompanySubscription | null, Error> {
    return useQuery<CompanySubscription | null, Error>({
        queryKey: COMPANIES_KEYS.subscriptions(id),
        queryFn: () => fetchCurrentSubscription(id),
        enabled: Boolean(id),
        staleTime: 30_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                             */
/* -------------------------------------------------------------------------- */

/** Creates a company and refreshes every companies list query on success. */
export function useCreateCompany(): UseMutationResult<Company, Error, CompanyFormValues> {
    const queryClient = useQueryClient();

    return useMutation<Company, Error, CompanyFormValues>({
        mutationFn: createCompany,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: COMPANIES_KEYS.all });
        },
    });
}

/** Input for {@link useUpdateCompany}: the target id plus new form values. */
export interface UpdateCompanyInput {
    id: string;
    values: CompanyFormValues;
}

/** Updates a company and refreshes its detail + list caches. */
export function useUpdateCompany(): UseMutationResult<Company, Error, UpdateCompanyInput> {
    const queryClient = useQueryClient();

    return useMutation<Company, Error, UpdateCompanyInput>({
        mutationFn: ({ id, values }) => updateCompany(id, values),
        onSuccess: (company) => {
            void queryClient.invalidateQueries({ queryKey: COMPANIES_KEYS.all });
            queryClient.setQueryData(COMPANIES_KEYS.detail(company.id), company);
        },
    });
}

/** Input for {@link useUpdateCompanyStatus}. */
export interface UpdateCompanyStatusInput {
    id: string;
    status: CompanyStatus;
}

/** Toggles a company's status (active / inactive / suspended). */
export function useUpdateCompanyStatus(): UseMutationResult<
    Company,
    Error,
    UpdateCompanyStatusInput
> {
    const queryClient = useQueryClient();

    return useMutation<Company, Error, UpdateCompanyStatusInput>({
        mutationFn: ({ id, status }) => updateCompanyStatus(id, status),
        onSuccess: (company) => {
            void queryClient.invalidateQueries({ queryKey: COMPANIES_KEYS.all });
            queryClient.setQueryData(COMPANIES_KEYS.detail(company.id), company);
        },
    });
}

/** Input for {@link useUpdateCompanySettings}. */
export interface UpdateCompanySettingsInput {
    id: string;
    values: CompanySettingsFormValues;
}

/** Updates a company's operational settings and refreshes its settings cache. */
export function useUpdateCompanySettings(): UseMutationResult<
    CompanySettings,
    Error,
    UpdateCompanySettingsInput
> {
    const queryClient = useQueryClient();

    return useMutation<CompanySettings, Error, UpdateCompanySettingsInput>({
        mutationFn: ({ id, values }) => updateCompanySettings(id, values),
        onSuccess: (settings, variables) => {
            queryClient.setQueryData(COMPANIES_KEYS.settings(variables.id), settings);
        },
    });
}
