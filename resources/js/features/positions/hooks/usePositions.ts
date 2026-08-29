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
import type { Position, PositionListParams, PositionStatus } from '@/types/position';

import type { PositionFormValues } from '../schemas';

/**
 * Data-access layer for the Positions feature.
 *
 * All transport concerns (Axios, Laravel resource envelopes, snake_case DTOs)
 * live behind the exported hooks. Components consume the stable {@link Position}
 * domain type and never touch the wire format. Mirrors the departments /
 * branches feature hook conventions for consistency.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const POSITIONS_KEYS = {
    all: ['positions'] as const,
    options: (departmentId?: number) => ['positions', 'options', departmentId ?? null] as const,

    list: (params: PositionListParams) => ['positions', 'list', params] as const,
    detail: (id: string) => ['positions', 'detail', id] as const,
} as const;

/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror the backend PositionResource)                       */
/* -------------------------------------------------------------------------- */

/** Minimal named relation exposed on a position payload. */
interface PositionRelationDto {
    id: number;
    name: string;
}

/** Raw position payload as serialized by `PositionResource`. */
interface PositionDto {
    id: number;
    company_id: number | null;
    department_id: number | null;
    name: string;
    code: string | null;
    description: string | null;
    default_hourly_rate: string | number | null;
    color: string | null;
    status: string | null;
    company?: PositionRelationDto | null;
    department?: PositionRelationDto | null;
    created_at: string | null;
    updated_at: string | null;
}

/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                       */
/* -------------------------------------------------------------------------- */

/** Coerce an arbitrary backend status into the UI's status union. */
function normalizeStatus(raw: string | null | undefined): PositionStatus {
    return raw === 'inactive' ? 'inactive' : 'active';
}

/** Parse the decimal-string hourly rate into a number (or null when absent). */
function parseRate(raw: string | number | null): number | null {
    if (raw === null || raw === '') {
        return null;
    }

    const value = typeof raw === 'number' ? raw : Number(raw);
    return Number.isNaN(value) ? null : value;
}

/** Convert a raw {@link PositionDto} into the stable {@link Position} shape. */
function mapPosition(dto: PositionDto): Position {
    return {
        id: String(dto.id),
        companyId: dto.company_id,
        departmentId: dto.department_id,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        defaultHourlyRate: parseRate(dto.default_hourly_rate),
        color: dto.color,
        status: normalizeStatus(dto.status),
        companyName: dto.company?.name ?? null,
        departmentName: dto.department?.name ?? null,
        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

/** A page of positions plus its pagination metadata. */
export interface PositionsPage {
    data: Position[];
    meta: PaginationMeta;
}

/* -------------------------------------------------------------------------- */
/* Form values -> request payload mapping                                     */
/* -------------------------------------------------------------------------- */

/** Serialize position form values into the snake_case backend payload. */
function toPositionPayload(values: PositionFormValues): Record<string, unknown> {
    return {
        name: values.name,
        // Sent as an id (not a name) so the position is genuinely linked to the
        // department record; null clears the link for company-wide positions.
        department_id: values.departmentId ? Number(values.departmentId) : null,
        code: values.code ?? null,

        description: values.description ?? null,
        default_hourly_rate: values.payScale ?? null,
        color: values.color ?? null,
        status: values.status,
    };
}

/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/** GET /positions — paginated, searchable, filterable list. */
async function fetchPositions(params: PositionListParams): Promise<PositionsPage> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<PositionDto>>>(
        '/positions',
        {
            params: {
                search: params.search || undefined,
                status: params.status || undefined,
                department_id: params.departmentId || undefined,
                per_page: params.perPage ?? 15,
            },
        },
    );

    return {
        data: response.data.data.data.map(mapPosition),
        meta: response.data.data.meta,
    };
}

/** GET /positions/{id} — single position with relations. */
async function fetchPosition(id: string): Promise<Position> {
    const response = await apiClient.get<ApiSuccessResponse<PositionDto>>(`/positions/${id}`);
    return mapPosition(response.data.data);
}

/** POST /positions — create a position. */
async function createPosition(values: PositionFormValues): Promise<Position> {
    const response = await apiClient.post<ApiSuccessResponse<PositionDto>>(
        '/positions',
        toPositionPayload(values),
    );
    return mapPosition(response.data.data);
}

/** PUT /positions/{id} — update a position. */
async function updatePosition(id: string, values: PositionFormValues): Promise<Position> {
    const response = await apiClient.put<ApiSuccessResponse<PositionDto>>(
        `/positions/${id}`,
        toPositionPayload(values),
    );
    return mapPosition(response.data.data);
}

/** DELETE /positions/{id} — permanently remove a position. */
async function deletePosition(id: string): Promise<void> {
    await apiClient.delete<ApiSuccessResponse<null>>(`/positions/${id}`);
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                */
/* -------------------------------------------------------------------------- */

/** Minimal `{ id, name }` pair used to populate position (job title) selects. */
export interface PositionOption {
    id: string;
    name: string;
}

/**
 * Lightweight `{ id, name }` pairs for job title select controls, optionally
 * narrowed to a single department. Forms read from this hook rather than asking
 * the user to free-type a title, so employees always reference a real position
 * record. Not cached long, so a position added moments ago is offered here.
 */
export function usePositionOptions(departmentId?: number): UseQueryResult<PositionOption[], Error> {
    return useQuery<PositionOption[], Error>({
        queryKey: POSITIONS_KEYS.options(departmentId),
        queryFn: async () => {
            const page = await fetchPositions({ status: 'active', departmentId, perPage: 100 });
            return page.data.map((position) => ({ id: position.id, name: position.name }));
        },
        staleTime: 0,
    });
}

/** Reads a page of positions. Keeps the previous page while fetching next. */
export function usePositions(params: PositionListParams): UseQueryResult<PositionsPage, Error> {

    return useQuery<PositionsPage, Error>({
        queryKey: POSITIONS_KEYS.list(params),
        queryFn: () => fetchPositions(params),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Reads a single position by id. */
export function usePosition(id: string): UseQueryResult<Position, Error> {
    return useQuery<Position, Error>({
        queryKey: POSITIONS_KEYS.detail(id),
        queryFn: () => fetchPosition(id),
        enabled: Boolean(id),
        staleTime: 15_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                             */
/* -------------------------------------------------------------------------- */

/** Creates a position and refreshes every positions list query. */
export function useCreatePosition(): UseMutationResult<Position, Error, PositionFormValues> {
    const queryClient = useQueryClient();

    return useMutation<Position, Error, PositionFormValues>({
        mutationFn: createPosition,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: POSITIONS_KEYS.all });
        },
    });
}

/** Input for {@link useUpdatePosition}: the target id plus new form values. */
export interface UpdatePositionInput {
    id: string;
    values: PositionFormValues;
}

/** Updates a position and refreshes its detail + list caches. */
export function useUpdatePosition(): UseMutationResult<Position, Error, UpdatePositionInput> {
    const queryClient = useQueryClient();

    return useMutation<Position, Error, UpdatePositionInput>({
        mutationFn: ({ id, values }) => updatePosition(id, values),
        onSuccess: (position) => {
            void queryClient.invalidateQueries({ queryKey: POSITIONS_KEYS.all });
            queryClient.setQueryData(POSITIONS_KEYS.detail(position.id), position);
        },
    });
}

/** Deletes a position and refreshes every positions list query. */
export function useDeletePosition(): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: deletePosition,
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: POSITIONS_KEYS.detail(id) });
            void queryClient.invalidateQueries({ queryKey: POSITIONS_KEYS.all });
        },
    });
}
