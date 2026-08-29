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
    RosterOption,
    ShiftTemplate,
    ShiftTemplateListParams,
    ShiftTemplateStatus,
} from '@/types/shift-template';

import { normalizeTime } from '../lib/shift-time';
import type { ShiftTemplateFormValues, UseTemplateFormValues } from '../schemas';

/**
 * Data-access layer for the Shift Templates feature.
 *
 * All transport concerns (Axios, Laravel resource envelopes, snake_case DTOs)
 * live behind the exported hooks. Components consume the stable
 * {@link ShiftTemplate} domain type and never touch the wire format. Mirrors the
 * positions / departments feature hook conventions for consistency.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const SHIFT_TEMPLATES_KEYS = {
    all: ['shift-templates'] as const,
    list: (params: ShiftTemplateListParams) => ['shift-templates', 'list', params] as const,
    detail: (id: string) => ['shift-templates', 'detail', id] as const,
    rosterOptions: ['shift-templates', 'roster-options'] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror the backend resources)                              */
/* -------------------------------------------------------------------------- */

/** Minimal named relation exposed on a template payload. */
interface NamedRelationDto {
    id: number;
    name: string;
}

/** Raw template payload as serialized by `ShiftTemplateResource`. */
interface ShiftTemplateDto {
    id: number;
    company_id: number | null;
    branch_id: number | null;
    department_id: number | null;
    position_id: number | null;
    name: string;
    description: string | null;
    start_time: string | null;
    end_time: string | null;
    break_minutes: number | string | null;
    color: string | null;
    is_paid_break: boolean | number | null;
    status: string | null;
    branch?: NamedRelationDto | null;
    department?: NamedRelationDto | null;
    position?: NamedRelationDto | null;
    created_at: string | null;
    updated_at: string | null;
}

/** Raw roster payload (subset of `RosterResource`) used for the target select. */
interface RosterOptionDto {
    id: number;
    branch_id: number | null;
    week_start: string | null;
    week_end: string | null;
    status: string | null;
    branch?: NamedRelationDto | null;
}

/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                       */
/* -------------------------------------------------------------------------- */

/** Coerce an arbitrary backend status into the UI's status union. */
function normalizeStatus(raw: string | null | undefined): ShiftTemplateStatus {
    return raw === 'inactive' ? 'inactive' : 'active';
}

/** Parse a nullable numeric-ish value into a safe integer. */
function parseMinutes(raw: number | string | null): number {
    if (raw === null || raw === '') {
        return 0;
    }

    const value = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Convert a raw {@link ShiftTemplateDto} into the stable domain shape. */
function mapShiftTemplate(dto: ShiftTemplateDto): ShiftTemplate {
    return {
        id: String(dto.id),
        companyId: dto.company_id,
        branchId: dto.branch_id,
        departmentId: dto.department_id,
        positionId: dto.position_id,
        name: dto.name,
        description: dto.description,
        startTime: normalizeTime(dto.start_time),
        endTime: normalizeTime(dto.end_time),
        breakMinutes: parseMinutes(dto.break_minutes),
        isPaidBreak: Boolean(dto.is_paid_break),
        color: dto.color,
        status: normalizeStatus(dto.status),
        branchName: dto.branch?.name ?? null,
        departmentName: dto.department?.name ?? null,
        positionName: dto.position?.name ?? null,
        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

/** Convert a raw roster payload into the stable {@link RosterOption} shape. */
function mapRosterOption(dto: RosterOptionDto): RosterOption {
    return {
        id: String(dto.id),
        weekStart: dto.week_start,
        weekEnd: dto.week_end,
        status: dto.status,
        branchName: dto.branch?.name ?? null,
        branchId: dto.branch_id,
    };
}

/** A page of templates plus its pagination metadata. */
export interface ShiftTemplatesPage {
    data: ShiftTemplate[];
    meta: PaginationMeta;
}

/* -------------------------------------------------------------------------- */
/* Form values -> request payload mapping                                     */
/* -------------------------------------------------------------------------- */

/** Serialize template form values into the snake_case backend payload. */
function toTemplatePayload(values: ShiftTemplateFormValues): Record<string, unknown> {
    return {
        name: values.name,
        description: values.description ?? null,
        start_time: values.startTime,
        end_time: values.endTime,
        break_minutes: values.breakMinutes,
        is_paid_break: values.isPaidBreak,
        position_id: values.defaultPositionId ?? null,
        branch_id: values.branchId ?? null,
        department_id: values.departmentId ?? null,
        color: values.color ?? null,
        status: values.status,
    };
}

/** Serialize "use template" values into the shift-creation payload. */
function toShiftPayload(values: UseTemplateFormValues): Record<string, unknown> {
    return {
        roster_id: values.rosterId,
        date: values.date,
        start_time: values.startTime,
        end_time: values.endTime,
        break_minutes: values.breakMinutes,
        paid_break: values.isPaidBreak,
        employee_id: values.employeeId ?? null,
        position_id: values.positionId ?? null,
        department_id: values.departmentId ?? null,
        branch_id: values.branchId ?? null,
        notes: values.notes ?? null,
        status: 'scheduled',
    };
}

/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/** GET /shift-templates — paginated, searchable, filterable list. */
async function fetchShiftTemplates(params: ShiftTemplateListParams): Promise<ShiftTemplatesPage> {
    const response = await apiClient.get<
        ApiSuccessResponse<PaginatedCollection<ShiftTemplateDto>>
    >('/shift-templates', {
        params: {
            search: params.search || undefined,
            status: params.status || undefined,
            branch_id: params.branchId || undefined,
            department_id: params.departmentId || undefined,
            position_id: params.positionId || undefined,
            per_page: params.perPage ?? 15,
        },
    });

    return {
        data: response.data.data.data.map(mapShiftTemplate),
        meta: response.data.data.meta,
    };
}

/** GET /shift-templates/{id} — single template with relations. */
async function fetchShiftTemplate(id: string): Promise<ShiftTemplate> {
    const response = await apiClient.get<ApiSuccessResponse<ShiftTemplateDto>>(
        `/shift-templates/${id}`,
    );
    return mapShiftTemplate(response.data.data);
}

/** POST /shift-templates — create a template. */
async function createShiftTemplate(values: ShiftTemplateFormValues): Promise<ShiftTemplate> {
    const response = await apiClient.post<ApiSuccessResponse<ShiftTemplateDto>>(
        '/shift-templates',
        toTemplatePayload(values),
    );
    return mapShiftTemplate(response.data.data);
}

/** PUT /shift-templates/{id} — update a template. */
async function updateShiftTemplate(
    id: string,
    values: ShiftTemplateFormValues,
): Promise<ShiftTemplate> {
    const response = await apiClient.put<ApiSuccessResponse<ShiftTemplateDto>>(
        `/shift-templates/${id}`,
        toTemplatePayload(values),
    );
    return mapShiftTemplate(response.data.data);
}

/** DELETE /shift-templates/{id} — permanently remove a template. */
async function deleteShiftTemplate(id: string): Promise<void> {
    await apiClient.delete<ApiSuccessResponse<null>>(`/shift-templates/${id}`);
}

/** GET /rosters — roster weeks offered as the target of a new shift. */
async function fetchRosterOptions(): Promise<RosterOption[]> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<RosterOptionDto>>>(
        '/rosters',
        { params: { per_page: 50 } },
    );

    return response.data.data.data.map(mapRosterOption);
}

/** POST /shifts — create a real shift from a template's settings. */
async function createShiftFromTemplate(values: UseTemplateFormValues): Promise<void> {
    await apiClient.post<ApiSuccessResponse<unknown>>('/shifts', toShiftPayload(values));
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                */
/* -------------------------------------------------------------------------- */

/** Reads a page of templates. Keeps the previous page while fetching next. */
export function useShiftTemplates(
    params: ShiftTemplateListParams,
): UseQueryResult<ShiftTemplatesPage, Error> {
    return useQuery<ShiftTemplatesPage, Error>({
        queryKey: SHIFT_TEMPLATES_KEYS.list(params),
        queryFn: () => fetchShiftTemplates(params),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Reads a single template by id. */
export function useShiftTemplate(id: string): UseQueryResult<ShiftTemplate, Error> {
    return useQuery<ShiftTemplate, Error>({
        queryKey: SHIFT_TEMPLATES_KEYS.detail(id),
        queryFn: () => fetchShiftTemplate(id),
        enabled: Boolean(id),
        staleTime: 15_000,
    });
}

/**
 * Reads the roster weeks a template-created shift can be attached to.
 *
 * Only fetched while the "use template" dialog is open (`enabled`), so the list
 * page never pays for data it does not render.
 */
export function useRosterOptions(enabled: boolean): UseQueryResult<RosterOption[], Error> {
    return useQuery<RosterOption[], Error>({
        queryKey: SHIFT_TEMPLATES_KEYS.rosterOptions,
        queryFn: fetchRosterOptions,
        enabled,
        staleTime: 60_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                             */
/* -------------------------------------------------------------------------- */

/** Creates a template and refreshes every templates list query. */
export function useCreateShiftTemplate(): UseMutationResult<
    ShiftTemplate,
    Error,
    ShiftTemplateFormValues
> {
    const queryClient = useQueryClient();

    return useMutation<ShiftTemplate, Error, ShiftTemplateFormValues>({
        mutationFn: createShiftTemplate,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: SHIFT_TEMPLATES_KEYS.all });
        },
    });
}

/** Input for {@link useUpdateShiftTemplate}: the target id plus new values. */
export interface UpdateShiftTemplateInput {
    id: string;
    values: ShiftTemplateFormValues;
}

/** Updates a template and refreshes its detail + list caches. */
export function useUpdateShiftTemplate(): UseMutationResult<
    ShiftTemplate,
    Error,
    UpdateShiftTemplateInput
> {
    const queryClient = useQueryClient();

    return useMutation<ShiftTemplate, Error, UpdateShiftTemplateInput>({
        mutationFn: ({ id, values }) => updateShiftTemplate(id, values),
        onSuccess: (template) => {
            void queryClient.invalidateQueries({ queryKey: SHIFT_TEMPLATES_KEYS.all });
            queryClient.setQueryData(SHIFT_TEMPLATES_KEYS.detail(template.id), template);
        },
    });
}

/** Deletes a template and refreshes every templates list query. */
export function useDeleteShiftTemplate(): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: deleteShiftTemplate,
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: SHIFT_TEMPLATES_KEYS.detail(id) });
            void queryClient.invalidateQueries({ queryKey: SHIFT_TEMPLATES_KEYS.all });
        },
    });
}

/** Creates a scheduled shift from a template and refreshes roster caches. */
export function useCreateShiftFromTemplate(): UseMutationResult<
    void,
    Error,
    UseTemplateFormValues
> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, UseTemplateFormValues>({
        mutationFn: createShiftFromTemplate,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['rosters'] });
            void queryClient.invalidateQueries({ queryKey: ['shifts'] });
        },
    });
}
