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
} from '@/lib/api-client';
import {
    NO_DEPARTMENT_LABEL,
    type Employee,
    type EmployeeStatus,
    type EmploymentType,
} from '@/types/employee';

import type { RosterStatus } from '@/types/roster-management';
import type {
    Shift,
    ShiftListParams,
    ShiftMutationInput,
    ShiftNamedReference,
    ShiftStatus,
} from '@/types/shift';


/** Query keys for every shifts read and mutation invalidation. */
export const SHIFT_KEYS = {
    all: ['shifts'] as const,
    list: (params: ShiftListParams) => ['shifts', 'list', params] as const,
    detail: (id: string) => ['shifts', 'detail', id] as const,
} as const;

interface NamedReferenceDto {
    id: number;
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
}

/**
 * Roster relation nested on a shift.
 *
 * A roster has no `name` column — it is identified by its branch and week — so it
 * needs its own DTO rather than reusing {@link NamedReferenceDto}. Its `status`
 * is what tells the calendar whether a shift is still a draft.
 */
interface ShiftRosterDto {
    id: number;
    status?: string | null;
    week_start?: string | null;
    week_end?: string | null;
}


interface EmployeeUserDto {
    id: number;
    name: string;
    email: string;
}

interface ShiftEmployeeDto {
    id: number;
    first_name: string;
    last_name: string;
    full_name: string | null;
    employee_number: string | null;
    employment_type: string | null;
    hourly_rate?: number | string | null;
    hire_date: string | null;
    photo_url: string | null;
    status: string | null;
    user?: EmployeeUserDto | null;
    department?: NamedReferenceDto | null;
    position?: NamedReferenceDto | null;
    branch?: NamedReferenceDto | null;
    created_at: string | null;
}

/** Raw payload emitted by the Laravel `ShiftResource`. */
interface ShiftDto {
    id: number;
    company_id: number | null;
    branch_id: number | null;
    roster_id: number;
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
    branch?: NamedReferenceDto | null;
    roster?: ShiftRosterDto | null;
    employee?: ShiftEmployeeDto | null;

    position?: NamedReferenceDto | null;
    department?: NamedReferenceDto | null;
    created_at: string | null;
    updated_at: string | null;
}

/** Maps a nullable named relation to a stable reference. */
function mapNamedReference(dto: NamedReferenceDto | null | undefined): ShiftNamedReference | null {
    if (!dto) {
        return null;
    }

    const name =
        dto.name?.trim() ||
        [dto.first_name, dto.last_name].filter(Boolean).join(' ').trim() ||
        'Unnamed record';

    return { id: String(dto.id), name };
}

/**
 * Maps the roster relation to a display reference.
 *
 * Rosters are named by their week, not a column, so the label is derived from
 * `week_start` and falls back to the id when the dates are absent.
 */
function mapRosterReference(dto: ShiftRosterDto | null | undefined): ShiftNamedReference | null {
    if (!dto) {
        return null;
    }

    return {
        id: String(dto.id),
        name: dto.week_start ? `Week of ${dto.week_start}` : `Roster #${dto.id}`,
    };
}

/**
 * Coerces the roster's publication state into the domain union.
 *
 * Anything unrecognised — including a missing relation — is read as `draft`,
 * because wrongly showing work as published would imply staff have already been
 * notified when they have not.
 */
function normalizeRosterStatus(raw: string | null | undefined): RosterStatus {
    return raw === 'published' || raw === 'archived' ? raw : 'draft';
}

function normalizeEmployeeStatus(raw: string | null | undefined): EmployeeStatus {

    if (raw === 'active') return 'active';
    if (raw === 'pending' || raw === 'invited') return 'pending';
    return 'inactive';
}

/** Coerces the backend `employment_type` string into the domain union. */
function normalizeEmploymentType(raw: string | null | undefined): EmploymentType {
    switch (raw) {
        case 'full_time':
        case 'part_time':
        case 'casual':
        case 'contract':
            return raw;
        default:
            // Casual is the safest assumption for scheduling: it implies no
            // guaranteed hours rather than inventing a full-time commitment.
            return 'casual';
    }
}



function mapEmployee(dto: ShiftEmployeeDto | null | undefined): Employee | null {
    if (!dto) {
        return null;
    }

    const name =
        dto.full_name?.trim() ||
        `${dto.first_name ?? ''} ${dto.last_name ?? ''}`.trim() ||
        dto.user?.name ||
        'Unnamed employee';

    return {
        id: String(dto.id),
        name,
        email: dto.user?.email ?? '',
        avatarUrl: dto.photo_url ?? undefined,
        position: dto.position?.name ?? '—',
        // Company-defined department name, shown as-is.
        department: dto.department?.name ?? NO_DEPARTMENT_LABEL,
        departmentId: dto.department ? String(dto.department.id) : null,
        branchId: dto.branch ? String(dto.branch.id) : null,

        branchName: dto.branch?.name ?? null,
        status: normalizeEmployeeStatus(dto.status),
        joinedDate: dto.hire_date ?? dto.created_at ?? new Date(0).toISOString(),
        positionId: dto.position ? String(dto.position.id) : null,
        employmentType: normalizeEmploymentType(dto.employment_type),
        hourlyRate: dto.hourly_rate != null ? String(dto.hourly_rate) : null,
        // Shift payloads carry only the scheduling slice of an employee, so the
        // access level and onboarding state are not included here. The team page
        // is the single source of truth for both.
        role: null,
        invitation: null,
    };
}

function normalizeStatus(raw: string | null | undefined): ShiftStatus {
    switch (raw) {
        case 'completed':
        case 'cancelled':
        case 'swap_requested':
            return raw;
        default:
            return 'scheduled';
    }
}

/** Normalizes a backend `HH:mm:ss` time to the browser input's `HH:mm` format. */
function normalizeTime(raw: string | null | undefined): string {
    if (!raw) {
        return '00:00';
    }

    const [hours = '00', minutes = '00'] = raw.split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

function parseNonNegativeInteger(raw: number | string | null | undefined, fallback: number): number {
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

/** Converts the server DTO to the stable client shift model. */
function mapShift(dto: ShiftDto): Shift {
    return {
        id: String(dto.id),
        companyId: dto.company_id,
        branchId: dto.branch_id === null ? null : String(dto.branch_id),
        rosterId: String(dto.roster_id),
        employeeId: dto.employee_id === null ? null : String(dto.employee_id),
        positionId: dto.position_id === null ? null : String(dto.position_id),
        departmentId: dto.department_id === null ? null : String(dto.department_id),
        date: dto.date ?? '',
        startTime: normalizeTime(dto.start_time),
        endTime: normalizeTime(dto.end_time),
        breakMinutes: parseNonNegativeInteger(dto.break_minutes, 0),
        isPaidBreak: Boolean(dto.paid_break),
        requiredStaff: Math.max(1, parseNonNegativeInteger(dto.required_staff, 1)),
        status: normalizeStatus(dto.status),
        notes: dto.notes,
        rosterStatus: normalizeRosterStatus(dto.roster?.status),
        branch: mapNamedReference(dto.branch),
        roster: mapRosterReference(dto.roster),

        employee: mapEmployee(dto.employee),
        position: mapNamedReference(dto.position),
        department: mapNamedReference(dto.department),
        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

function toPayload(values: ShiftMutationInput): Record<string, unknown> {
    return {
        roster_id: Number(values.rosterId),
        date: values.date,
        start_time: values.startTime,
        end_time: values.endTime,
        position_id: values.positionId ? Number(values.positionId) : null,
        employee_id: values.employeeId ? Number(values.employeeId) : null,
        required_staff: values.requiredStaff,
        notes: values.notes || null,
        status: values.status,
        // Break fields are only sent when the caller actually manages them, so a
        // partial update (moving a shift, say) never silently clears a break.
        ...(values.breakMinutes === undefined ? {} : { break_minutes: values.breakMinutes }),
        ...(values.isPaidBreak === undefined ? {} : { paid_break: values.isPaidBreak }),
    };
}


/** Fetches a filterable shifts collection from `GET /v1/shifts`. */
async function fetchShifts(params: ShiftListParams): Promise<Shift[]> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<ShiftDto>>>('/shifts', {
        params: {
            roster_id: params.rosterId || undefined,
            branch_id: params.branchId || undefined,
            employee_id: params.employeeId || undefined,
            status: params.status || undefined,
            date_from: params.dateFrom || undefined,
            date_to: params.dateTo || undefined,
            per_page: params.perPage ?? 100,
        },
    });

    return response.data.data.data.map(mapShift);
}

async function createShift(input: ShiftMutationInput): Promise<Shift> {
    const response = await apiClient.post<ApiSuccessResponse<ShiftDto>>('/shifts', toPayload(input));
    return mapShift(response.data.data);
}

async function updateShift(id: string, input: ShiftMutationInput): Promise<Shift> {
    const response = await apiClient.put<ApiSuccessResponse<ShiftDto>>(`/shifts/${id}`, toPayload(input));
    return mapShift(response.data.data);
}

async function deleteShift(id: string): Promise<void> {
    await apiClient.delete<ApiSuccessResponse<null>>(`/shifts/${id}`);
}

async function assignEmployee(id: string, employeeId: string): Promise<Shift> {
    const response = await apiClient.post<ApiSuccessResponse<ShiftDto>>(
        `/shifts/${id}/assign-employee`,
        { employee_id: Number(employeeId) },
    );
    return mapShift(response.data.data);
}

/** Lists shifts for the workspace. Components never call Axios directly. */
export function useShifts(params: ShiftListParams = {}): UseQueryResult<Shift[], Error> {
    return useQuery<Shift[], Error>({
        queryKey: SHIFT_KEYS.list(params),
        queryFn: () => fetchShifts(params),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Creates a shift and refreshes every shift and roster view. */
export function useCreateShift(): UseMutationResult<Shift, Error, ShiftMutationInput> {
    const queryClient = useQueryClient();

    return useMutation<Shift, Error, ShiftMutationInput>({
        mutationFn: createShift,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SHIFT_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['rosters'] });
        },
    });
}

/** Updates a shift and refreshes every dependent schedule view. */
export function useUpdateShift(): UseMutationResult<
    Shift,
    Error,
    { id: string; input: ShiftMutationInput }
> {
    const queryClient = useQueryClient();

    return useMutation<Shift, Error, { id: string; input: ShiftMutationInput }>({
        mutationFn: ({ id, input }) => updateShift(id, input),
        onSuccess: (shift) => {
            queryClient.setQueryData(SHIFT_KEYS.detail(shift.id), shift);
            void queryClient.invalidateQueries({ queryKey: SHIFT_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['rosters'] });
        },
    });
}

/** Deletes a shift and refreshes every dependent schedule view. */
export function useDeleteShift(): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: deleteShift,
        onSuccess: (_result, id) => {
            queryClient.removeQueries({ queryKey: SHIFT_KEYS.detail(id) });
            void queryClient.invalidateQueries({ queryKey: SHIFT_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['rosters'] });
        },
    });
}

/** Assigns an employee using the dedicated API action and refreshes schedules. */
export function useAssignEmployee(): UseMutationResult<
    Shift,
    Error,
    { id: string; employeeId: string }
> {
    const queryClient = useQueryClient();

    return useMutation<Shift, Error, { id: string; employeeId: string }>({
        mutationFn: ({ id, employeeId }) => assignEmployee(id, employeeId),
        onSuccess: (shift) => {
            queryClient.setQueryData(SHIFT_KEYS.detail(shift.id), shift);
            void queryClient.invalidateQueries({ queryKey: SHIFT_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['rosters'] });
        },
    });
}
