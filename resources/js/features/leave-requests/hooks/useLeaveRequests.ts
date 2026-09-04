import {
    keepPreviousData,
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';

import type { AuthUser } from '@/features/auth/hooks/useAuth';
import {
    apiClient,
    type ApiSuccessResponse,
    type PaginatedCollection,
} from '@/lib/api-client';
import type {
    ApproveLeaveRequestInput,
    CreateLeaveRequestInput,
    LeaveBalance,
    LeaveRequest,
    LeaveRequestEmployee,
    LeaveRequestLeaveType,
    LeaveRequestListParams,
    LeaveRequestReviewer,
    LeaveRequestStatus,
    LeaveSession,
    RejectLeaveRequestInput,
} from '@/types/leave-request';

/** Query keys used by leave lists, detail views, balance checks, and calendar events. */
export const LEAVE_REQUEST_KEYS = {
    all: ['leave-requests'] as const,
    list: (params: LeaveRequestListParams) => ['leave-requests', 'list', params] as const,
    detail: (id: string) => ['leave-requests', 'detail', id] as const,
    currentUser: ['auth', 'current-user'] as const,
} as const;

interface NamedReferenceDto {
    id: number;
    name?: string | null;
}

interface EmployeeUserDto {
    id: number;
    name: string;
    email: string;
}

interface EmployeeDto {
    id: number;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
    user?: EmployeeUserDto | null;
    branch?: NamedReferenceDto | null;
}

interface LeaveTypeDto {
    id: number;
    name: string;
    allowance_days?: number | string | null;
    is_paid?: boolean | number | null;
    allow_half_day?: boolean | number | null;
}

interface ReviewerDto {
    id: number;
    name: string;
}

/** API resource payload for a leave request. */
interface LeaveRequestDto {
    id: number;
    company_id: number | null;
    employee_id: number;
    leave_type_id: number;
    start_date: string | null;
    end_date: string | null;
    start_session: string | null;
    end_session: string | null;
    total_days: number | string | null;
    reason: string | null;
    attachment: string | null;
    attachments?: string[] | null;
    status: string | null;
    approved_by: number | null;
    approved_at: string | null;
    rejected_by: number | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    admin_notes: string | null;
    employee?: EmployeeDto | null;
    leave_type?: LeaveTypeDto | null;
    approver?: ReviewerDto | null;
    rejecter?: ReviewerDto | null;
    created_at: string | null;
    updated_at: string | null;
}

/** Backend user response extended with its optional employee profile id. */
interface CurrentLeaveUser extends AuthUser {
    employee_id?: number | null;
}

function normalizeStatus(raw: string | null | undefined): LeaveRequestStatus {
    switch (raw) {
        case 'approved':
        case 'rejected':
        case 'cancelled':
            return raw;
        default:
            return 'pending';
    }
}

function normalizeSession(raw: string | null | undefined): LeaveSession {
    switch (raw) {
        case 'first_half':
        case 'second_half':
            return raw;
        default:
            return 'full_day';
    }
}

function parseNumber(raw: number | string | null | undefined, fallback = 0): number {
    const value = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(value) ? value : fallback;
}

function mapEmployee(dto: EmployeeDto | null | undefined): LeaveRequestEmployee | null {
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
        avatarUrl: dto.photo_url,
        branchName: dto.branch?.name ?? null,
    };
}

function mapLeaveType(dto: LeaveTypeDto | null | undefined): LeaveRequestLeaveType | null {
    if (!dto) {
        return null;
    }

    return {
        id: String(dto.id),
        name: dto.name,
        allowanceDays:
            dto.allowance_days === null || dto.allowance_days === undefined
                ? null
                : parseNumber(dto.allowance_days),
        isPaid: Boolean(dto.is_paid),
        allowsHalfDay: Boolean(dto.allow_half_day),
    };
}

function mapReviewer(dto: ReviewerDto | null | undefined): LeaveRequestReviewer | null {
    return dto ? { id: String(dto.id), name: dto.name } : null;
}

/** Converts an API resource payload into the leave request domain type. */
function mapLeaveRequest(dto: LeaveRequestDto): LeaveRequest {
    const attachments = dto.attachments ?? (dto.attachment ? [dto.attachment] : []);

    return {
        id: String(dto.id),
        companyId: dto.company_id,
        employeeId: String(dto.employee_id),
        leaveTypeId: String(dto.leave_type_id),
        startDate: dto.start_date ?? '',
        endDate: dto.end_date ?? '',
        startSession: normalizeSession(dto.start_session),
        endSession: normalizeSession(dto.end_session),
        totalDays: parseNumber(dto.total_days),
        reason: dto.reason,
        attachments,
        status: normalizeStatus(dto.status),
        approvedBy: dto.approved_by === null ? null : String(dto.approved_by),
        approvedAt: dto.approved_at,
        rejectedBy: dto.rejected_by === null ? null : String(dto.rejected_by),
        rejectedAt: dto.rejected_at,
        rejectionReason: dto.rejection_reason,
        adminNotes: dto.admin_notes,
        employee: mapEmployee(dto.employee),
        leaveType: mapLeaveType(dto.leave_type),
        approver: mapReviewer(dto.approver),
        rejecter: mapReviewer(dto.rejecter),
        createdAt: dto.created_at,
        updatedAt: dto.updated_at,
    };
}

function appendOptionalField(formData: FormData, name: string, value: string | null): void {
    if (value) {
        formData.append(name, value);
    }
}

/** Serializes a leave submission—including files—to multipart form data. */
function toFormData(input: CreateLeaveRequestInput): FormData {
    const formData = new FormData();
    formData.append('employee_id', input.employeeId);
    formData.append('leave_type_id', input.leaveTypeId);
    formData.append('start_date', input.startDate);
    formData.append('end_date', input.endDate);
    formData.append('start_session', input.startSession);
    formData.append('end_session', input.endSession);
    appendOptionalField(formData, 'reason', input.reason);

    input.attachments.forEach((attachment) => {
        formData.append('attachments[]', attachment);
    });

    return formData;
}

async function fetchLeaveRequests(params: LeaveRequestListParams): Promise<LeaveRequest[]> {
    const response = await apiClient.get<ApiSuccessResponse<PaginatedCollection<LeaveRequestDto>>>(
        '/leave-requests',
        {
            params: {
                status: params.status || undefined,
                employee_id: params.employeeId || undefined,
                leave_type_id: params.leaveTypeId || undefined,
                date_from: params.dateFrom || undefined,
                date_to: params.dateTo || undefined,
                per_page: params.perPage ?? 100,
            },
        },
    );

    return response.data.data.data.map(mapLeaveRequest);
}

async function fetchLeaveRequest(id: string): Promise<LeaveRequest> {
    const response = await apiClient.get<ApiSuccessResponse<LeaveRequestDto>>(`/leave-requests/${id}`);
    return mapLeaveRequest(response.data.data);
}

async function submitLeaveRequest(input: CreateLeaveRequestInput): Promise<LeaveRequest> {
    const response = await apiClient.post<ApiSuccessResponse<LeaveRequestDto>>(
        '/leave-requests',
        toFormData(input),
    );
    return mapLeaveRequest(response.data.data);
}

async function approveLeaveRequest(input: ApproveLeaveRequestInput): Promise<LeaveRequest> {
    const response = await apiClient.post<ApiSuccessResponse<LeaveRequestDto>>(
        `/leave-requests/${input.id}/approve`,
        { admin_notes: input.adminNotes || null },
    );
    return mapLeaveRequest(response.data.data);
}

async function rejectLeaveRequest(input: RejectLeaveRequestInput): Promise<LeaveRequest> {
    const response = await apiClient.post<ApiSuccessResponse<LeaveRequestDto>>(
        `/leave-requests/${input.id}/reject`,
        { rejection_reason: input.rejectionReason },
    );
    return mapLeaveRequest(response.data.data);
}

async function fetchCurrentLeaveUser(): Promise<CurrentLeaveUser> {
    const response = await apiClient.get<ApiSuccessResponse<CurrentLeaveUser>>('/auth/me');
    return response.data.data;
}

/** Determines whether a user is allowed to review and decide leave requests. */
export function canReviewLeaveRequests(user: CurrentLeaveUser | undefined): boolean {
    return Boolean(
        user?.permissions?.includes('leave_request.approve') ||
        user?.permissions?.includes('leave_request.reject') ||
        user?.role === 'super_admin',
    );
}

/** Computes a selected leave type's available balance from approved and pending requests. */
export function deriveLeaveBalance({
    allowanceDays,
    requests,
    leaveTypeId,
}: {
    allowanceDays: number | null;
    requests: readonly LeaveRequest[];
    leaveTypeId: string;
}): LeaveBalance {
    const committedDays = requests
        .filter(
            (request) =>
                request.leaveTypeId === leaveTypeId &&
                (request.status === 'approved' || request.status === 'pending'),
        )
        .reduce((total, request) => total + request.totalDays, 0);
    const rawRemainingDays = allowanceDays === null ? null : allowanceDays - committedDays;
    const remainingDays = rawRemainingDays === null ? null : Math.max(0, rawRemainingDays);

    return {
        allowanceDays,
        committedDays,
        remainingDays,
        hasSufficientBalance: rawRemainingDays === null || rawRemainingDays >= 0,
    };
}

/** Lists requests for employee history, manager review, and calendar blocking. */
export function useLeaveRequests(
    params: LeaveRequestListParams = {},
): UseQueryResult<LeaveRequest[], Error> {
    return useQuery<LeaveRequest[], Error>({
        queryKey: LEAVE_REQUEST_KEYS.list(params),
        queryFn: () => fetchLeaveRequests(params),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Reads a leave request detail record when a route identifier is available. */
export function useLeaveRequest(id: string | undefined): UseQueryResult<LeaveRequest, Error> {
    return useQuery<LeaveRequest, Error>({
        queryKey: LEAVE_REQUEST_KEYS.detail(id ?? 'unknown'),
        queryFn: () => fetchLeaveRequest(id as string),
        enabled: Boolean(id),
        staleTime: 15_000,
    });
}

/** Reads the current authenticated user including their optional employee profile id. */
export function useCurrentLeaveUser(): UseQueryResult<CurrentLeaveUser, Error> {
    return useQuery<CurrentLeaveUser, Error>({
        queryKey: LEAVE_REQUEST_KEYS.currentUser,
        queryFn: fetchCurrentLeaveUser,
        staleTime: 300_000,
    });
}

/** Submits a new leave request and refreshes the employee, review, and calendar views. */
export function useCreateLeaveRequest(): UseMutationResult<
    LeaveRequest,
    Error,
    CreateLeaveRequestInput
> {
    const queryClient = useQueryClient();

    return useMutation<LeaveRequest, Error, CreateLeaveRequestInput>({
        mutationFn: submitLeaveRequest,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LEAVE_REQUEST_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['rosters'] });
        },
    });
}

/** Approves a pending request and refreshes manager, employee, and calendar views. */
export function useApproveLeaveRequest(): UseMutationResult<
    LeaveRequest,
    Error,
    ApproveLeaveRequestInput
> {
    const queryClient = useQueryClient();

    return useMutation<LeaveRequest, Error, ApproveLeaveRequestInput>({
        mutationFn: approveLeaveRequest,
        onSuccess: (request) => {
            queryClient.setQueryData(LEAVE_REQUEST_KEYS.detail(request.id), request);
            void queryClient.invalidateQueries({ queryKey: LEAVE_REQUEST_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['rosters'] });
            void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

/** Rejects a pending request and refreshes all decision and notification views. */
export function useRejectLeaveRequest(): UseMutationResult<
    LeaveRequest,
    Error,
    RejectLeaveRequestInput
> {
    const queryClient = useQueryClient();

    return useMutation<LeaveRequest, Error, RejectLeaveRequestInput>({
        mutationFn: rejectLeaveRequest,
        onSuccess: (request) => {
            queryClient.setQueryData(LEAVE_REQUEST_KEYS.detail(request.id), request);
            void queryClient.invalidateQueries({ queryKey: LEAVE_REQUEST_KEYS.all });
            void queryClient.invalidateQueries({ queryKey: ['rosters'] });
            void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}
