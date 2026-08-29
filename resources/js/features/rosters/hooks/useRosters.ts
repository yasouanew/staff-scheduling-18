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
import type {
    Roster,
    RosterListParams,
    RosterShift,
    RosterShiftStatus,
    RosterStats,
    RosterStatus,
} from '@/types/roster-management';

import type { CopyWeekValues, RosterFormValues } from '../schemas';

/**
 * Data-access layer for roster management (`/v1/rosters`).
 *
 * Wraps every transport concern (Axios, the Laravel success envelope and the
 * snake_case DTOs) so components only ever see the stable {@link Roster} domain
 * type. Mutations invalidate the roster caches so the list, detail view and KPI
 * counters stay in sync after a create, update, publish, copy or delete.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const ROSTERS_KEYS = {
    all: ['rosters'] as const,
    list: (params: RosterListParams) => ['rosters', 'list', params] as const,
    detail: (id: string) => ['rosters', 'detail', id] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror the backend resources)                              */
/* -------------------------------------------------------------------------- */

/** Minimal named relation exposed on roster payloads. */
interface NamedRelationDto {
    id: number;
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    /** Hex colour, present on position/department relations. */
    color?: string | null;
}

/** Employee relation nested on a shift payload. */
interface ShiftEmployeeDto extends NamedRelationDto {
    full_name?: string | null;
    photo_url?: string | null;
    department?: NamedRelationDto | null;
    branch?: NamedRelationDto | null;
}

/** Raw shift payload as serialized by `ShiftResource`. */
interface ShiftDto {
    id: number;
    roster_id: number | null;
    branch_id: number | null;
    employee_id: number | null;
    position_id: number | null;
    department_id: number | null;
    date: string | null;
    start_time: string | null;
    end_time: string | null;
    break_minutes: number | string | null;
    paid_break: boolean | number | null;
    required_staff?: number | string | null;
    status: string | null;
    notes: string | null;
    /** Transient roster validation flags (roster detail endpoint only). */
    overtime_risk?: boolean | number | null;
    leave_conflict?: boolean | number | null;
    double_booked?: boolean | number | null;
    employee?: ShiftEmployeeDto | null;
    position?: NamedRelationDto | null;
    department?: NamedRelationDto | null;
    branch?: NamedRelationDto | null;
}

/** Raw roster payload as serialized by `RosterResource`. */
interface RosterDto {
    id: number;
    company_id: number | null;
    branch_id: number | null;
    week_start: string | null;
    week_end: string | null;
    status: string | null;
    version: number | null;
    published_at: string | null;
    published_by: number | null;
    branch?: NamedRelationDto | null;
    publisher?: NamedRelationDto | null;
    shifts?: ShiftDto[] | null;
    shifts_count?: number | null;
    created_at: string | null;
    updated_at: string | null;
}

/** A page of rosters plus its pagination metadata. */
export interface RostersPage {
    data: Roster[];
    meta: PaginationMeta;
}

/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                       */
/* -------------------------------------------------------------------------- */

/** Coerce an arbitrary backend status into the roster status union. */
function normalizeRosterStatus(raw: string | null | undefined): RosterStatus {
    return raw === 'published' || raw === 'archived' ? raw : 'draft';
}

/** Coerce an arbitrary backend status into the shift status union. */
function normalizeShiftStatus(raw: string | null | undefined): RosterShiftStatus {
    switch (raw) {
        case 'confirmed':
        case 'completed':
        case 'cancelled':
        case 'open':
            return raw;
        default:
            return 'scheduled';
    }
}

/** Trim a `HH:mm:ss` value down to `HH:mm`. */
function normalizeTime(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }

    const [hours = '', minutes = ''] = raw.split(':');
    if (hours === '' || minutes === '') {
        return null;
    }

    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

/** Parse a nullable numeric-ish value into a safe non-negative integer. */
function parseMinutes(raw: number | string | null | undefined): number {
    if (raw === null || raw === undefined || raw === '') {
        return 0;
    }

    const value = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Best-effort display name for a related person record. */
function personName(relation: ShiftEmployeeDto | null | undefined): string | null {
    if (!relation) {
        return null;
    }

    if (relation.full_name) {
        return relation.full_name;
    }

    if (relation.name) {
        return relation.name;
    }

    const full = [relation.first_name, relation.last_name].filter(Boolean).join(' ').trim();
    return full === '' ? null : full;
}

/** Validate a 6-digit hex colour, discarding anything the UI can't use. */
function normalizeHexColor(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }

    return /^#[0-9a-f]{6}$/i.test(raw.trim()) ? raw.trim().toUpperCase() : null;
}

/** Convert a raw {@link ShiftDto} into the stable domain shape. */
function mapShift(dto: ShiftDto): RosterShift {
    return {
        id: String(dto.id),
        rosterId: dto.roster_id === null ? null : String(dto.roster_id),
        branchId: dto.branch_id,
        employeeId: dto.employee_id === null ? null : String(dto.employee_id),
        employeeName: personName(dto.employee),
        employeeAvatarUrl: dto.employee?.photo_url ?? null,
        positionId: dto.position_id,
        positionName: dto.position?.name ?? null,
        positionColor: normalizeHexColor(dto.position?.color),
        departmentId: dto.department_id,
        departmentName: dto.department?.name ?? dto.employee?.department?.name ?? null,
        branchName: dto.branch?.name ?? dto.employee?.branch?.name ?? null,
        date: dto.date,
        startTime: normalizeTime(dto.start_time),
        endTime: normalizeTime(dto.end_time),
        breakMinutes: parseMinutes(dto.break_minutes),
        isPaidBreak: Boolean(dto.paid_break),
        requiredStaff: Math.max(1, parseMinutes(dto.required_staff ?? 1) || 1),
        status: dto.employee_id === null ? 'open' : normalizeShiftStatus(dto.status),
        notes: dto.notes,
        flags: {
            overtimeRisk: Boolean(dto.overtime_risk),
            leaveConflict: Boolean(dto.leave_conflict),
            doubleBooked: Boolean(dto.double_booked),
        },
    };
}

/** Convert a raw {@link RosterDto} into the stable domain shape. */
function mapRoster(dto: RosterDto): Roster {
    return {
        id: String(dto.id),
        companyId: dto.company_id,
        branchId: dto.branch_id,
        branchName: dto.branch?.name ?? null,
        weekStart: dto.week_start,
        weekEnd: dto.week_end,
        status: normalizeRosterStatus(dto.status),
        version: typeof dto.version === 'number' ? dto.version : 1,
        publishedAt: dto.published_at,
        publishedByName: personName(dto.publisher),
        shiftsCount:
            typeof dto.shifts_count === 'number'
                ? dto.shifts_count
                : (dto.shifts?.length ?? null),
        shifts: (dto.shifts ?? []).map(mapShift),
        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

/* -------------------------------------------------------------------------- */
/* Form values -> request payload mapping                                     */
/* -------------------------------------------------------------------------- */

/** Serialize roster form values into the snake_case backend payload. */
function toRosterPayload(values: RosterFormValues): Record<string, unknown> {
    return {
        week_start: values.weekStart,
        week_end: values.weekEnd,
        branch_id: values.branchId ?? null,
        status: values.status,
    };
}

/** Serialize copy-week values into the copy-previous-week payload. */
function toCopyPayload(values: CopyWeekValues): Record<string, unknown> {
    return {
        week_start: values.weekStart,
        branch_id: values.branchId ?? null,
        source_roster_id: values.sourceRosterId ?? null,
    };
}

/* -------------------------------------------------------------------------- */
/* Derived helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Aggregate KPI counters from a page of rosters. */
export function deriveRosterStats(rosters: readonly Roster[]): RosterStats {
    return rosters.reduce<RosterStats>(
        (stats, roster) => ({
            total: stats.total + 1,
            draft: stats.draft + (roster.status === 'draft' ? 1 : 0),
            published: stats.published + (roster.status === 'published' ? 1 : 0),
            shifts: stats.shifts + (roster.shiftsCount ?? 0),
        }),
        { total: 0, draft: 0, published: 0, shifts: 0 },
    );
}

/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/** GET /rosters — paginated, filterable list. */
async function fetchRosters(params: RosterListParams): Promise<RostersPage> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<RosterDto>>>(
        '/rosters',
        {
            params: {
                status: params.status || undefined,
                branch_id: params.branchId || undefined,
                week_start: params.weekStart || undefined,
                week_end: params.weekEnd || undefined,
                per_page: params.perPage ?? 15,
            },
        },
    );

    return {
        data: response.data.data.data.map(mapRoster),
        meta: response.data.data.meta,
    };
}

/** GET /rosters/{id} — single roster with its shifts. */
async function fetchRoster(id: string): Promise<Roster> {
    const response = await apiClient.get<ApiSuccessResponse<RosterDto>>(`/rosters/${id}`);
    return mapRoster(response.data.data);
}

/** POST /rosters — create a roster week. */
async function createRoster(values: RosterFormValues): Promise<Roster> {
    const response = await apiClient.post<ApiSuccessResponse<RosterDto>>(
        '/rosters',
        toRosterPayload(values),
    );
    return mapRoster(response.data.data);
}

/** PUT /rosters/{id} — update a roster week. */
async function updateRoster(id: string, values: RosterFormValues): Promise<Roster> {
    const response = await apiClient.put<ApiSuccessResponse<RosterDto>>(
        `/rosters/${id}`,
        toRosterPayload(values),
    );
    return mapRoster(response.data.data);
}

/** DELETE /rosters/{id} — permanently remove a roster and its shifts. */
async function deleteRoster(id: string): Promise<void> {
    await apiClient.delete<ApiSuccessResponse<null>>(`/rosters/${id}`);
}

/** POST /rosters/{id}/publish — make the roster visible to employees. */
async function publishRoster(id: string): Promise<Roster> {
    const response = await apiClient.post<ApiSuccessResponse<RosterDto>>(
        `/rosters/${id}/publish`,
    );
    return mapRoster(response.data.data);
}

/** POST /rosters/copy-previous-week — clone a prior week's shifts. */
async function copyPreviousWeek(values: CopyWeekValues): Promise<Roster> {
    const response = await apiClient.post<ApiSuccessResponse<RosterDto>>(
        '/rosters/copy-previous-week',
        toCopyPayload(values),
    );
    return mapRoster(response.data.data);
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                */
/* -------------------------------------------------------------------------- */

/** Reads a page of rosters, keeping the previous page while refetching. */
export function useRosters(params: RosterListParams): UseQueryResult<RostersPage, Error> {
    return useQuery<RostersPage, Error>({
        queryKey: ROSTERS_KEYS.list(params),
        queryFn: () => fetchRosters(params),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Reads a single roster (with shifts) by id. */
export function useRoster(id: string | undefined): UseQueryResult<Roster, Error> {
    return useQuery<Roster, Error>({
        queryKey: ROSTERS_KEYS.detail(id ?? 'unknown'),
        queryFn: () => fetchRoster(id as string),
        enabled: Boolean(id),
        staleTime: 15_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                             */
/* -------------------------------------------------------------------------- */

/** Creates a roster week and refreshes the list caches. */
export function useCreateRoster(): UseMutationResult<Roster, Error, RosterFormValues> {
    const queryClient = useQueryClient();

    return useMutation<Roster, Error, RosterFormValues>({
        mutationFn: createRoster,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ROSTERS_KEYS.all });
        },
    });
}

/** Updates a roster week and refreshes both the list and detail caches. */
export function useUpdateRoster(): UseMutationResult<
    Roster,
    Error,
    { id: string; values: RosterFormValues }
> {
    const queryClient = useQueryClient();

    return useMutation<Roster, Error, { id: string; values: RosterFormValues }>({
        mutationFn: ({ id, values }) => updateRoster(id, values),
        onSuccess: (roster) => {
            queryClient.setQueryData(ROSTERS_KEYS.detail(roster.id), roster);
            void queryClient.invalidateQueries({ queryKey: ROSTERS_KEYS.all });
        },
    });
}

/** Deletes a roster week and refreshes the list caches. */
export function useDeleteRoster(): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: deleteRoster,
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: ROSTERS_KEYS.detail(id) });
            void queryClient.invalidateQueries({ queryKey: ROSTERS_KEYS.all });
        },
    });
}

/** Publishes a roster, notifying assigned employees server-side. */
export function usePublishRoster(): UseMutationResult<Roster, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<Roster, Error, string>({
        mutationFn: publishRoster,
        onSuccess: (roster) => {
            queryClient.setQueryData(ROSTERS_KEYS.detail(roster.id), roster);
            void queryClient.invalidateQueries({ queryKey: ROSTERS_KEYS.all });
        },
    });
}

/** Creates a new roster by cloning the shifts of a previous week. */
export function useCopyPreviousWeek(): UseMutationResult<Roster, Error, CopyWeekValues> {
    const queryClient = useQueryClient();

    return useMutation<Roster, Error, CopyWeekValues>({
        mutationFn: copyPreviousWeek,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ROSTERS_KEYS.all });
        },
    });
}

