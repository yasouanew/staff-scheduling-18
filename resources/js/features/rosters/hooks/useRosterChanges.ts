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
    RosterChange,
    RosterChangeAction,
    RosterChangeMutation,
} from '@/types/roster-management';

import { ROSTERS_KEYS } from './useRosters';

/**
 * Data-access layer for post-publication roster change management
 * (`/v1/rosters/{roster}/changes`).
 *
 * Three endpoints are wrapped here:
 *  - `preview`  — POST  `/changes/preview`: no-write summary of the employees a
 *                 set of mutations will affect (backend is the source of truth).
 *  - `apply`    — POST  `/changes/apply`: persist mutations, record change rows,
 *                 notify affected employees (grouped) and bump `version`.
 *  - `index`    — GET   `/changes`: paginated audit/change history.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const ROSTER_CHANGES_KEYS = {
    all: (rosterId: string) => ['rosters', 'changes', rosterId] as const,
    list: (rosterId: string, params: { page?: number; perPage?: number }) =>
        ['rosters', 'changes', rosterId, 'list', params] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Domain result shapes (mirror RosterChangeService::preview()/apply())        */
/* -------------------------------------------------------------------------- */

/** A single employee plus the changes that affect them (preview/apply result). */
export interface EmployeeChangeGroup {
    employee_id: number;
    employee_name: string | null;
    changes: RosterChange[];
}

/** Summary returned by both `preview()` and `apply()`. */
export interface RosterChangeSummary {
    roster_id: number;
    /** Optimistic-lock version the summary was computed against. */
    version: number;
    affected_employee_count: number;
    change_count: number;
    changes: RosterChange[];
    employees: EmployeeChangeGroup[];
}

/** Raw backend summary (snake_case change rows) before DTO mapping. */
interface RosterChangeSummaryDto {
    roster_id: number;
    version: number;
    affected_employee_count: number;
    change_count: number;
    changes: RosterChangeDto[];
    employees: Array<{
        employee_id: number;
        employee_name: string | null;
        changes: RosterChangeDto[];
    }>;
}

/** A page of change-history records plus its pagination metadata. */
export interface RosterChangesPage {
    data: RosterChange[];
    meta: PaginationMeta;
}

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror RosterChangeResource)                                */
/* -------------------------------------------------------------------------- */

interface RosterChangeDto {
    id: number;
    roster_id: number;
    shift_id: number | null;
    employee_id: number | null;
    action: string;
    old_data: Record<string, unknown> | null;
    new_data: Record<string, unknown> | null;
    performed_by: number | null;
    performed_by_name: string | null;
    employee_name: string | null;
    created_at: string | null;
}

/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                      */
/* -------------------------------------------------------------------------- */

/** Coerce an arbitrary backend action string into the change-action union. */
function normalizeAction(raw: string | null | undefined): RosterChangeAction {
    switch (raw) {
        case 'roster_published':
        case 'roster_updated':
        case 'shift_added':
        case 'shift_updated':
        case 'shift_cancelled':
        case 'shift_assigned':
        case 'shift_reassigned':
        case 'shift_location_changed':
            return raw;
        default:
            return 'roster_updated';
    }
}

/** Convert a raw {@link RosterChangeDto} into the stable domain shape. */
function mapChange(dto: RosterChangeDto): RosterChange {
    return {
        id: dto.id,
        rosterId: dto.roster_id,
        shiftId: dto.shift_id,
        employeeId: dto.employee_id,
        action: normalizeAction(dto.action),
        oldData: dto.old_data,
        newData: dto.new_data,
        performedBy: dto.performed_by,
        performedByName: dto.performed_by_name,
        employeeName: dto.employee_name,
        createdAt: dto.created_at,
    };
}

/** Convert a raw backend summary into the stable domain shape. */
function mapSummary(dto: RosterChangeSummaryDto): RosterChangeSummary {
    return {
        roster_id: dto.roster_id,
        version: dto.version,
        affected_employee_count: dto.affected_employee_count,
        change_count: dto.change_count,
        changes: dto.changes.map(mapChange),
        employees: dto.employees.map((group) => ({
            employee_id: group.employee_id,
            employee_name: group.employee_name,
            changes: group.changes.map(mapChange),
        })),
    };
}

/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * POST /rosters/{roster}/changes/preview — compute the affected-employee
 * summary for a set of mutations without writing anything.
 */
async function fetchChangePreview(
    rosterId: string,
    mutations: RosterChangeMutation[],
): Promise<RosterChangeSummary> {
    const response = await apiClient.post<ApiSuccessResponse<RosterChangeSummaryDto>>(
        `/rosters/${rosterId}/changes/preview`,
        { mutations },
    );

    return mapSummary(response.data.data);
}

/**
 * POST /rosters/{roster}/changes/apply — persist mutations, record changes and
 * notify affected employees. Sends the roster's optimistic-lock `version` so a
 * stale save is rejected with HTTP 409.
 */
async function applyRosterChanges(
    rosterId: string,
    version: number,
    mutations: RosterChangeMutation[],
): Promise<RosterChangeSummary> {
    const response = await apiClient.post<ApiSuccessResponse<RosterChangeSummaryDto>>(
        `/rosters/${rosterId}/changes/apply`,
        { version, mutations },
    );

    return mapSummary(response.data.data);
}

/** GET /rosters/{roster}/changes — paginated change/audit history. */
async function fetchRosterChanges(
    rosterId: string,
    params: { page?: number; perPage?: number },
): Promise<RosterChangesPage> {
    const response = await apiClient.get<
        ApiSuccessResponse<PaginatedCollection<RosterChangeDto>>
    >(`/rosters/${rosterId}/changes`, {
        params: {
            page: params.page ?? 1,
            per_page: params.perPage ?? 25,
        },
    });

    return {
        data: response.data.data.data.map(mapChange),
        meta: response.data.data.meta,
    };
}

/* -------------------------------------------------------------------------- */
/* Query + mutation hooks                                                     */
/* -------------------------------------------------------------------------- */

/** Reads a page of change/audit history for a roster. */
export function useRosterChanges(
    rosterId: string | undefined,
    params: { page?: number; perPage?: number } = {},
): UseQueryResult<RosterChangesPage, Error> {
    return useQuery<RosterChangesPage, Error>({
        queryKey: ROSTER_CHANGES_KEYS.list(rosterId ?? 'unknown', params),
        queryFn: () => fetchRosterChanges(rosterId as string, params),
        enabled: Boolean(rosterId),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Computes the affected-employee preview for staged mutations (no writes). */
export function useRosterChangePreview(): UseMutationResult<
    RosterChangeSummary,
    Error,
    { rosterId: string; mutations: RosterChangeMutation[] }
> {
    return useMutation<RosterChangeSummary, Error, { rosterId: string; mutations: RosterChangeMutation[] }>({
        mutationFn: ({ rosterId, mutations }) => fetchChangePreview(rosterId, mutations),
    });
}

/**
 * Persists staged mutations against a published roster, recording every change
 * and notifying affected employees (grouped). On success the detail + list
 * caches are refreshed so the grid shows the new version and shifts.
 */
export function useApplyRosterChanges(): UseMutationResult<
    RosterChangeSummary,
    Error,
    { rosterId: string; version: number; mutations: RosterChangeMutation[] }
> {
    const queryClient = useQueryClient();

    return useMutation<
        RosterChangeSummary,
        Error,
        { rosterId: string; version: number; mutations: RosterChangeMutation[] }
    >({
        mutationFn: ({ rosterId, version, mutations }) =>
            applyRosterChanges(rosterId, version, mutations),
        onSuccess: (summary, variables) => {
            const rosterId = String(variables.rosterId);
            // Bump the cached version immediately so a follow-up preview/apply
            // (before the detail refetch lands) carries the correct optimistic
            // lock, then refresh the shifts + history + list caches.
            const cached = queryClient.getQueryData<Roster>(ROSTERS_KEYS.detail(rosterId));
            if (cached) {
                queryClient.setQueryData<Roster>(ROSTERS_KEYS.detail(rosterId), {
                    ...cached,
                    version: summary.version,
                });
            }
            void queryClient.invalidateQueries({ queryKey: ROSTERS_KEYS.detail(rosterId) });
            void queryClient.invalidateQueries({ queryKey: ROSTERS_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ROSTER_CHANGES_KEYS.all(rosterId) });
        },
    });
}
