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
import type {
    LeaveType,
    LeaveTypeListParams,
    LeaveTypeMutationInput,
    LeaveTypeStats,
    LeaveTypeStatus,
} from '@/types/leave-type';

/** Cache keys for leave type data and future employee request selections. */
export const LEAVE_TYPE_KEYS = {
    all: ['leave-types'] as const,
    list: (params: LeaveTypeListParams) => ['leave-types', 'list', params] as const,
    detail: (id: string) => ['leave-types', 'detail', id] as const,
} as const;

/** DTO matching the API resource, including leave entitlement policy fields. */
interface LeaveTypeDto {
    id: number;
    company_id: number | null;
    name: string;
    code: string | null;
    description: string | null;
    allowance_days?: number | string | null;
    is_paid: boolean | number | null;
    allows_rollover?: boolean | number | null;
    max_rollover_days?: number | string | null;
    requires_approval: boolean | number | null;
    allow_half_day: boolean | number | null;
    max_days_per_request: number | string | null;
    color: string | null;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
}

function normalizeStatus(raw: string | null | undefined): LeaveTypeStatus {
    return raw === 'inactive' ? 'inactive' : 'active';
}

function parseNullableNumber(raw: number | string | null | undefined): number | null {
    if (raw === null || raw === undefined || raw === '') {
        return null;
    }

    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

/** Converts a backend leave type resource into a stable UI domain model. */
function mapLeaveType(dto: LeaveTypeDto): LeaveType {
    return {
        id: String(dto.id),
        companyId: dto.company_id,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        allowanceDays: parseNullableNumber(dto.allowance_days),
        isPaid: Boolean(dto.is_paid),
        allowsRollover: Boolean(dto.allows_rollover),
        maxRolloverDays: parseNullableNumber(dto.max_rollover_days),
        requiresApproval: Boolean(dto.requires_approval),
        allowsHalfDay: Boolean(dto.allow_half_day),
        maxDaysPerRequest: parseNullableNumber(dto.max_days_per_request),
        color: dto.color,
        status: normalizeStatus(dto.status),
        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

function toPayload(values: LeaveTypeMutationInput): Record<string, unknown> {
    return {
        name: values.name.trim(),
        code: values.code?.trim() || null,
        description: values.description?.trim() || null,
        allowance_days: values.allowanceDays,
        is_paid: values.isPaid,
        allows_rollover: values.allowsRollover,
        max_rollover_days: values.allowsRollover ? values.maxRolloverDays : null,
        requires_approval: values.requiresApproval,
        allow_half_day: values.allowsHalfDay,
        max_days_per_request: values.maxDaysPerRequest,
        status: values.status,
    };
}

/** Fetches the paginated leave type collection. */
async function fetchLeaveTypes(params: LeaveTypeListParams): Promise<LeaveType[]> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<LeaveTypeDto>>>(
        '/leave-types',
        {
            params: {
                search: params.search || undefined,
                status: params.status || undefined,
                per_page: params.perPage ?? 100,
            },
        },
    );

    return response.data.data.data.map(mapLeaveType);
}

async function createLeaveType(input: LeaveTypeMutationInput): Promise<LeaveType> {
    const response = await apiClient.post<ApiSuccessResponse<LeaveTypeDto>>(
        '/leave-types',
        toPayload(input),
    );
    return mapLeaveType(response.data.data);
}

async function updateLeaveType(id: string, input: LeaveTypeMutationInput): Promise<LeaveType> {
    const response = await apiClient.put<ApiSuccessResponse<LeaveTypeDto>>(
        `/leave-types/${id}`,
        toPayload(input),
    );
    return mapLeaveType(response.data.data);
}

async function deleteLeaveType(id: string): Promise<void> {
    await apiClient.delete<ApiSuccessResponse<null>>(`/leave-types/${id}`);
}

/** Derives page summary cards from the filtered collection. */
export function deriveLeaveTypeStats(leaveTypes: readonly LeaveType[]): LeaveTypeStats {
    return leaveTypes.reduce<LeaveTypeStats>(
        (stats, leaveType) => ({
            total: stats.total + 1,
            active: stats.active + (leaveType.status === 'active' ? 1 : 0),
            paid: stats.paid + (leaveType.isPaid ? 1 : 0),
            rolloverEnabled: stats.rolloverEnabled + (leaveType.allowsRollover ? 1 : 0),
        }),
        { total: 0, active: 0, paid: 0, rolloverEnabled: 0 },
    );
}

/** Lists leave types used to populate employee leave request forms. */
export function useLeaveTypes(
    params: LeaveTypeListParams = {},
): UseQueryResult<LeaveType[], Error> {
    return useQuery<LeaveType[], Error>({
        queryKey: LEAVE_TYPE_KEYS.list(params),
        queryFn: () => fetchLeaveTypes(params),
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });
}

/** Creates a leave type and refreshes all leave type lists and request options. */
export function useCreateLeaveType(): UseMutationResult<
    LeaveType,
    Error,
    LeaveTypeMutationInput
> {
    const queryClient = useQueryClient();

    return useMutation<LeaveType, Error, LeaveTypeMutationInput>({
        mutationFn: createLeaveType,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LEAVE_TYPE_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
        },
    });
}

/** Updates a leave type and synchronizes every cached employee request selector. */
export function useUpdateLeaveType(): UseMutationResult<
    LeaveType,
    Error,
    { id: string; input: LeaveTypeMutationInput }
> {
    const queryClient = useQueryClient();

    return useMutation<LeaveType, Error, { id: string; input: LeaveTypeMutationInput }>({
        mutationFn: ({ id, input }) => updateLeaveType(id, input),
        onSuccess: (leaveType) => {
            queryClient.setQueryData(LEAVE_TYPE_KEYS.detail(leaveType.id), leaveType);
            void queryClient.invalidateQueries({ queryKey: LEAVE_TYPE_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
        },
    });
}

/** Removes a leave type and refreshes cached leave request options. */
export function useDeleteLeaveType(): UseMutationResult<void, Error, string> {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: deleteLeaveType,
        onSuccess: (_result, id) => {
            queryClient.removeQueries({ queryKey: LEAVE_TYPE_KEYS.detail(id) });
            void queryClient.invalidateQueries({ queryKey: LEAVE_TYPE_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
        },
    });
}
