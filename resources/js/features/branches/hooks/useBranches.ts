import {
    keepPreviousData,
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';

import {
    apiClient,
    type ApiSuccessResponse,
    type PaginatedCollection,
    type PaginationMeta,
} from '@/lib/api-client';
import {
    WEEKDAYS,
    type Branch,
    type BranchListParams,
    type BranchManager,
    type BranchStatus,
    type DaySchedule,
    type WeekSchedule,
} from '@/types/branch';

import type { BranchFormValues } from '../schemas';


/**
 * Data-access layer for the Branches feature.
 *
 * All transport concerns (Axios, Laravel resource envelopes, snake_case DTOs)
 * live behind the exported hooks. Components consume the stable {@link Branch}
 * domain type and never touch the wire format. Mirrors the companies feature's
 * hook conventions for consistency.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const BRANCHES_KEYS = {
    all: ['branches'] as const,
    list: (params: BranchListParams) => ['branches', 'list', params] as const,
    detail: (id: string) => ['branches', 'detail', id] as const,
    options: ['branches', 'options'] as const,
} as const;

/** Minimal `{ id, name }` pair used to populate branch selects and filters. */
export interface BranchOption {
    id: string;
    name: string;
}

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror the backend BranchResource)                         */
/* -------------------------------------------------------------------------- */

/** Minimal company relation exposed on a branch payload. */
interface BranchCompanyDto {
    id: number;
    name: string;
}

/** Minimal manager (employee) relation exposed on a branch payload. */
interface BranchManagerDto {
    id: number;
    name: string;
}

/** One weekday's resolved schedule as serialized by `BranchResource`. */
interface DayScheduleDto {
    is_open: boolean;
    opens_at: string | null;
    closes_at: string | null;
    break_minutes: number | null;
    break_paid: boolean;
    is_custom: boolean;
}

/** Raw branch payload as serialized by `BranchResource`. */
interface BranchDto {
    id: number;
    company_id: number | null;
    manager_id: number | null;
    name: string;
    phone: string | null;
    address: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
    timezone: string | null;
    default_opens_at?: string | null;
    default_closes_at?: string | null;
    default_break_minutes?: number | null;
    default_break_paid?: boolean;
    day_schedules?: Record<string, DayScheduleDto> | null;
    status: string | null;

    company?: BranchCompanyDto | null;
    manager?: BranchManagerDto | null;
    users_count?: number;
    employees_count?: number;
    shifts_count?: number;

    created_at: string | null;
    updated_at: string | null;
}

/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                       */
/* -------------------------------------------------------------------------- */

/** Coerce an arbitrary backend status into the UI's status union. */
function normalizeStatus(raw: string | null | undefined): BranchStatus {
    return raw === 'inactive' ? 'inactive' : 'active';
}

/** Parse a decimal that Laravel may serialize as a string into a number. */
function parseCoordinate(raw: number | string | null | undefined): number | null {
    if (raw === null || raw === undefined || raw === '') {
        return null;
    }
    const value = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
    return Number.isFinite(value) ? value : null;
}

/** Map the optional manager relation into the stable domain shape. */
function mapManager(dto: BranchManagerDto | null | undefined): BranchManager | null {
    return dto ? { id: String(dto.id), name: dto.name } : null;
}

/**
 * Map the week of schedules, tolerating an absent `day_schedules`.
 *
 * A missing key is treated as "open, nothing configured" rather than throwing:
 * a branch saved before trading hours existed must still render, and the form
 * must still be able to open it.
 */
function mapDaySchedules(raw: Record<string, DayScheduleDto> | null | undefined): WeekSchedule {
    const fallback: DaySchedule = {
        isOpen: true,
        opensAt: null,
        closesAt: null,
        breakMinutes: null,
        breakPaid: false,
        isCustom: false,
    };

    return WEEKDAYS.reduce((week, weekday) => {
        const dto = raw?.[weekday];

        week[weekday] = dto
            ? {
                isOpen: dto.is_open,
                opensAt: dto.opens_at,
                closesAt: dto.closes_at,
                breakMinutes: dto.break_minutes,
                breakPaid: dto.break_paid,
                isCustom: dto.is_custom,
            }
            : { ...fallback };

        return week;
    }, {} as WeekSchedule);
}


/** Convert a raw {@link BranchDto} into the stable {@link Branch} shape. */
function mapBranch(dto: BranchDto): Branch {
    return {
        id: String(dto.id),
        companyId: dto.company_id,
        managerId: dto.manager_id !== null && dto.manager_id !== undefined ? String(dto.manager_id) : null,
        manager: mapManager(dto.manager),
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        latitude: parseCoordinate(dto.latitude),
        longitude: parseCoordinate(dto.longitude),
        timezone: dto.timezone,
        defaultOpensAt: dto.default_opens_at ?? null,
        defaultClosesAt: dto.default_closes_at ?? null,
        defaultBreakMinutes: dto.default_break_minutes ?? null,
        defaultBreakPaid: dto.default_break_paid ?? false,
        daySchedules: mapDaySchedules(dto.day_schedules),
        status: normalizeStatus(dto.status),
        companyName: dto.company?.name ?? null,

        // The API reports both separately: staff are linked through
        // `employees.branch_id` while `users_count` covers directly provisioned
        // accounts. The detail page shows each as its own StatCard.
        employeesCount: dto.employees_count ?? null,
        usersCount: dto.users_count ?? null,
        shiftsCount: dto.shifts_count ?? null,

        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

/** A page of branches plus its pagination metadata. */
export interface BranchesPage {
    data: Branch[];
    meta: PaginationMeta;
}

/* -------------------------------------------------------------------------- */
/* Form values -> request payload mapping                                     */
/* -------------------------------------------------------------------------- */

/**
 * Serialize the per-weekday overrides.
 *
 * Only the days the user actually customised are sent. Persisting all seven
 * would make every day permanently "custom", so a later change to the standard
 * hours would silently fail to reach the days that were meant to inherit it.
 */
function toDaySchedulesPayload(
    daySchedules: BranchFormValues['daySchedules'],
): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    for (const weekday of WEEKDAYS) {
        const day = daySchedules[weekday];

        if (day.useDefault) continue;

        // A closed day needs no times; sending them would imply it trades.
        payload[weekday] = day.isOpen
            ? {
                is_open: true,
                opens_at: day.opensAt ?? null,
                closes_at: day.closesAt ?? null,
                break_minutes: day.breakMinutes ?? null,
                break_paid: day.breakPayType === 'paid',
            }
            : { is_open: false };
    }

    return payload;
}

/** Serialize branch form values into the snake_case backend payload. */
function toBranchPayload(values: BranchFormValues): Record<string, unknown> {
    return {
        name: values.name,
        manager_id: values.managerId ? Number(values.managerId) : null,
        phone: values.phone ?? null,
        address: values.address ?? null,
        latitude: values.latitude ?? null,
        longitude: values.longitude ?? null,
        timezone: values.timezone,
        status: values.status,

        default_opens_at: values.defaultOpensAt ?? null,
        default_closes_at: values.defaultClosesAt ?? null,
        default_break_minutes: values.defaultBreakMinutes ?? null,
        default_break_paid: values.defaultBreakPayType === 'paid',
        day_schedules: toDaySchedulesPayload(values.daySchedules),
    };
}


/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/** GET /branches — paginated, searchable, filterable list. */
async function fetchBranches(params: BranchListParams): Promise<BranchesPage> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<BranchDto>>>(
        '/branches',
        {
            params: {
                search: params.search || undefined,
                status: params.status || undefined,
                per_page: params.perPage ?? 15,
            },
        },
    );

    return {
        data: response.data.data.data.map(mapBranch),
        meta: response.data.data.meta,
    };
}

/** GET /branches/{id} — single branch with relation counts. */
async function fetchBranch(id: string): Promise<Branch> {
    const response = await apiClient.get<ApiSuccessResponse<BranchDto>>(`/branches/${id}`);
    return mapBranch(response.data.data);
}

/** POST /branches — create a branch. */
async function createBranch(values: BranchFormValues): Promise<Branch> {
    const response = await apiClient.post<ApiSuccessResponse<BranchDto>>(
        '/branches',
        toBranchPayload(values),
    );
    return mapBranch(response.data.data);
}

/** PUT /branches/{id} — update a branch. */
async function updateBranch(id: string, values: BranchFormValues): Promise<Branch> {
    const response = await apiClient.put<ApiSuccessResponse<BranchDto>>(
        `/branches/${id}`,
        toBranchPayload(values),
    );
    return mapBranch(response.data.data);
}

/** DELETE /branches/{id} — permanently remove a branch. */
async function deleteBranch(id: string): Promise<void> {
    await apiClient.delete<ApiSuccessResponse<null>>(`/branches/${id}`);
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Lightweight `{ id, name }` pairs for branch filter/select controls.
 *
 * Shared by the employee directory's branch filter and any form that needs to
 * assign a branch, so no screen ever has to hardcode location names. Only
 * active branches are offered.
 *
 * The options are treated as always-stale and refetched whenever a consumer
 * mounts. A long cache previously meant a branch created seconds earlier was
 * missing from this list until the user navigated between pages enough times to
 * evict it, which read as "the dropdown is empty".
 */
export function useBranchOptions(): UseQueryResult<BranchOption[], Error> {
    return useQuery<BranchOption[], Error>({
        queryKey: BRANCHES_KEYS.options,
        queryFn: async () => {
            const page = await fetchBranches({ status: 'active', perPage: 100 });
            return page.data.map((branch) => ({ id: branch.id, name: branch.name }));
        },
        staleTime: 0,
        refetchOnMount: 'always',
    });
}


/** Reads a page of branches. Keeps the previous page while fetching the next. */
export function useBranches(params: BranchListParams): UseQueryResult<BranchesPage, Error> {
    return useQuery<BranchesPage, Error>({
        queryKey: BRANCHES_KEYS.list(params),
        queryFn: () => fetchBranches(params),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Reads a single branch by id. */
export function useBranch(id: string): UseQueryResult<Branch, Error> {
    return useQuery<Branch, Error>({
        queryKey: BRANCHES_KEYS.detail(id),
        queryFn: () => fetchBranch(id),
        enabled: Boolean(id),
        staleTime: 15_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                             */
/* -------------------------------------------------------------------------- */

/** Creates a branch and refreshes every branches list query on success. */
export function useCreateBranch(): UseMutationResult<Branch, Error, BranchFormValues> {
    const queryClient = useQueryClient();

    return useMutation<Branch, Error, BranchFormValues>({
        mutationFn: createBranch,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: BRANCHES_KEYS.all });
        },
    });
}

/** Input for {@link useUpdateBranch}: the target id plus new form values. */
export interface UpdateBranchInput {
    id: string;
    values: BranchFormValues;
}

/** Updates a branch and refreshes its detail + list caches. */
export function useUpdateBranch(): UseMutationResult<Branch, Error, UpdateBranchInput> {
    const queryClient = useQueryClient();

    return useMutation<Branch, Error, UpdateBranchInput>({
        mutationFn: ({ id, values }) => updateBranch(id, values),
        onSuccess: (branch) => {
            void queryClient.invalidateQueries({ queryKey: BRANCHES_KEYS.all });
            queryClient.setQueryData(BRANCHES_KEYS.detail(branch.id), branch);
        },
    });
}

/** Deletes a branch and refreshes every branches list query on success. */
export function useDeleteBranch(): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: deleteBranch,
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: BRANCHES_KEYS.detail(id) });
            void queryClient.invalidateQueries({ queryKey: BRANCHES_KEYS.all });
        },
    });
}
