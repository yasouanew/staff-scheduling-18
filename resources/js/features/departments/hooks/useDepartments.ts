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
import type { Department, DepartmentListParams, DepartmentStatus } from '@/types/department';

import type { DepartmentFormValues } from '../schemas';

/**
 * Data-access layer for the Departments feature.
 *
 * All transport concerns (Axios, Laravel resource envelopes, snake_case DTOs)
 * live behind the exported hooks. Components consume the stable
 * {@link Department} domain type and never touch the wire format. Mirrors the
 * branches / companies feature hook conventions for consistency.
 */

/* -------------------------------------------------------------------------- */
/* Query key registry                                                         */
/* -------------------------------------------------------------------------- */

export const DEPARTMENTS_KEYS = {
    all: ['departments'] as const,
    list: (params: DepartmentListParams) => ['departments', 'list', params] as const,
    detail: (id: string) => ['departments', 'detail', id] as const,
    options: ['departments', 'options'] as const,
} as const;

/** Minimal `{ id, name }` pair used to populate department selects and filters. */
export interface DepartmentOption {
    id: string;
    name: string;
}


/* -------------------------------------------------------------------------- */
/* Transport DTOs (mirror the backend DepartmentResource)                     */
/* -------------------------------------------------------------------------- */

/** Minimal company relation exposed on a department payload. */
interface DepartmentCompanyDto {
    id: number;
    name: string;
}

/** Raw department payload as serialized by `DepartmentResource`. */
interface DepartmentDto {
    id: number;
    company_id: number | null;
    name: string;
    code: string | null;
    description: string | null;
    color: string | null;
    status: string | null;
    company?: DepartmentCompanyDto | null;
    positions_count?: number;
    created_at: string | null;
    updated_at: string | null;
}

/* -------------------------------------------------------------------------- */
/* DTO -> domain mapping                                                       */
/* -------------------------------------------------------------------------- */

/** Coerce an arbitrary backend status into the UI's status union. */
function normalizeStatus(raw: string | null | undefined): DepartmentStatus {
    return raw === 'inactive' ? 'inactive' : 'active';
}

/** Convert a raw {@link DepartmentDto} into the stable {@link Department} shape. */
function mapDepartment(dto: DepartmentDto): Department {
    return {
        id: String(dto.id),
        companyId: dto.company_id,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        color: dto.color,
        status: normalizeStatus(dto.status),
        companyName: dto.company?.name ?? null,
        positionsCount: dto.positions_count ?? null,
        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

/** A page of departments plus its pagination metadata. */
export interface DepartmentsPage {
    data: Department[];
    meta: PaginationMeta;
}

/* -------------------------------------------------------------------------- */
/* Form values -> request payload mapping                                     */
/* -------------------------------------------------------------------------- */

/** Serialize department form values into the snake_case backend payload. */
function toDepartmentPayload(values: DepartmentFormValues): Record<string, unknown> {
    return {
        name: values.name,
        code: values.code ?? null,
        description: values.description ?? null,
        color: values.color ?? null,
        status: values.status,
    };
}

/* -------------------------------------------------------------------------- */
/* Transport functions                                                        */
/* -------------------------------------------------------------------------- */

/** GET /departments — paginated, searchable, filterable list. */
async function fetchDepartments(params: DepartmentListParams): Promise<DepartmentsPage> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<DepartmentDto>>>(
        '/departments',
        {
            params: {
                search: params.search || undefined,
                status: params.status || undefined,
                per_page: params.perPage ?? 15,
            },
        },
    );

    return {
        data: response.data.data.data.map(mapDepartment),
        meta: response.data.data.meta,
    };
}

/** GET /departments/{id} — single department with relation counts. */
async function fetchDepartment(id: string): Promise<Department> {
    const response = await apiClient.get<ApiSuccessResponse<DepartmentDto>>(`/departments/${id}`);
    return mapDepartment(response.data.data);
}

/** POST /departments — create a department. */
async function createDepartment(values: DepartmentFormValues): Promise<Department> {
    const response = await apiClient.post<ApiSuccessResponse<DepartmentDto>>(
        '/departments',
        toDepartmentPayload(values),
    );
    return mapDepartment(response.data.data);
}

/** PUT /departments/{id} — update a department. */
async function updateDepartment(id: string, values: DepartmentFormValues): Promise<Department> {
    const response = await apiClient.put<ApiSuccessResponse<DepartmentDto>>(
        `/departments/${id}`,
        toDepartmentPayload(values),
    );
    return mapDepartment(response.data.data);
}

/** DELETE /departments/{id} — permanently remove a department. */
async function deleteDepartment(id: string): Promise<void> {
    await apiClient.delete<ApiSuccessResponse<null>>(`/departments/${id}`);
}

/* -------------------------------------------------------------------------- */
/* Query hooks                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Lightweight `{ id, name }` pairs for department select controls.
 *
 * Any form that assigns a department reads from this hook so no screen ever
 * hardcodes department names. Only active departments are offered. The list is
 * cached briefly (not for minutes) so a department created moments earlier on
 * another screen appears without needing a manual refresh.
 */
export function useDepartmentOptions(): UseQueryResult<DepartmentOption[], Error> {
    return useQuery<DepartmentOption[], Error>({
        queryKey: DEPARTMENTS_KEYS.options,
        queryFn: async () => {
            const page = await fetchDepartments({ status: 'active', perPage: 100 });
            return page.data.map((department) => ({ id: department.id, name: department.name }));
        },
        staleTime: 0,
    });
}

/** Reads a page of departments. Keeps the previous page while fetching next. */
export function useDepartments(

    params: DepartmentListParams,
): UseQueryResult<DepartmentsPage, Error> {
    return useQuery<DepartmentsPage, Error>({
        queryKey: DEPARTMENTS_KEYS.list(params),
        queryFn: () => fetchDepartments(params),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Reads a single department by id. */
export function useDepartment(id: string): UseQueryResult<Department, Error> {
    return useQuery<Department, Error>({
        queryKey: DEPARTMENTS_KEYS.detail(id),
        queryFn: () => fetchDepartment(id),
        enabled: Boolean(id),
        staleTime: 15_000,
    });
}

/* -------------------------------------------------------------------------- */
/* Mutation hooks                                                             */
/* -------------------------------------------------------------------------- */

/** Creates a department and refreshes every departments list query. */
export function useCreateDepartment(): UseMutationResult<Department, Error, DepartmentFormValues> {
    const queryClient = useQueryClient();

    return useMutation<Department, Error, DepartmentFormValues>({
        mutationFn: createDepartment,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEYS.all });
        },
    });
}

/** Input for {@link useUpdateDepartment}: the target id plus new form values. */
export interface UpdateDepartmentInput {
    id: string;
    values: DepartmentFormValues;
}

/** Updates a department and refreshes its detail + list caches. */
export function useUpdateDepartment(): UseMutationResult<Department, Error, UpdateDepartmentInput> {
    const queryClient = useQueryClient();

    return useMutation<Department, Error, UpdateDepartmentInput>({
        mutationFn: ({ id, values }) => updateDepartment(id, values),
        onSuccess: (department) => {
            void queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEYS.all });
            queryClient.setQueryData(DEPARTMENTS_KEYS.detail(department.id), department);
        },
    });
}

/** Deletes a department and refreshes every departments list query. */
export function useDeleteDepartment(): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: deleteDepartment,
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: DEPARTMENTS_KEYS.detail(id) });
            void queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEYS.all });
        },
    });
}
