import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';

import type {
    ApproveLeaveRequestInput,
    CreateLeaveRequestInput,
    LeaveRequest,
    RejectLeaveRequestInput,
    WeeklyAvailability,
} from '@/types/availability';

/**
 * Isolated mock data & network-simulation layer for the Availability module.
 *
 * All state/transport concerns live here so presentational components stay
 * decoupled. Swapping these Promises for Axios later requires no UI changes.
 */

/** Query cache keys. */
export const AVAILABILITY_QUERY_KEY = ['availability'] as const;
export const LEAVE_REQUESTS_QUERY_KEY = ['leave-requests'] as const;

/** Simulated network latency in milliseconds. */
const NETWORK_DELAY_MS = 500;

/** Selectable employees for the availability viewer. */
export interface AvailabilityEmployeeOption {
    id: string;
    name: string;
}

export const AVAILABILITY_EMPLOYEES: readonly AvailabilityEmployeeOption[] = [
    { id: 'emp-001', name: 'Olivia Bennett' },
    { id: 'emp-002', name: 'Liam Nguyen' },
    { id: 'emp-004', name: 'Noah Patel' },
];

/** In-memory recurring weekly availability keyed by employee id. */
const AVAILABILITY_STORE: Record<string, WeeklyAvailability> = {
    'emp-001': {
        Monday: [{ startTime: '09:00', endTime: '17:00', available: true }],
        Tuesday: [{ startTime: '09:00', endTime: '17:00', available: true }],
        Wednesday: [{ startTime: '09:00', endTime: '13:00', available: true }],
        Thursday: [{ startTime: '12:00', endTime: '20:00', available: true }],
        Friday: [{ startTime: '09:00', endTime: '17:00', available: true }],
        Saturday: [{ startTime: '00:00', endTime: '23:59', available: false }],
        Sunday: [{ startTime: '00:00', endTime: '23:59', available: false }],
    },
    'emp-002': {
        Monday: [{ startTime: '00:00', endTime: '23:59', available: false }],
        Tuesday: [{ startTime: '16:00', endTime: '23:00', available: true }],
        Wednesday: [{ startTime: '16:00', endTime: '23:00', available: true }],
        Thursday: [{ startTime: '16:00', endTime: '23:00', available: true }],
        Friday: [{ startTime: '16:00', endTime: '23:59', available: true }],
        Saturday: [{ startTime: '10:00', endTime: '23:59', available: true }],
        Sunday: [{ startTime: '10:00', endTime: '18:00', available: true }],
    },
    'emp-004': {
        Monday: [{ startTime: '07:00', endTime: '15:00', available: true }],
        Tuesday: [{ startTime: '07:00', endTime: '15:00', available: true }],
        Wednesday: [{ startTime: '07:00', endTime: '15:00', available: true }],
        Thursday: [{ startTime: '07:00', endTime: '15:00', available: true }],
        Friday: [{ startTime: '00:00', endTime: '23:59', available: false }],
        Saturday: [{ startTime: '00:00', endTime: '23:59', available: false }],
        Sunday: [{ startTime: '00:00', endTime: '23:59', available: false }],
    },
};

/** In-memory leave request records. */
let leaveRequestStore: LeaveRequest[] = [
    {
        id: 'lr-001',
        employeeId: 'emp-001',
        employeeName: 'Olivia Bennett',
        leaveType: 'Annual Leave',
        startDate: '2026-08-10',
        endDate: '2026-08-14',
        reason: 'Family holiday.',
        status: 'approved',
        createdAt: '2026-07-20',
        reviewedBy: 'admin-001',
        reviewedAt: '2026-07-21',
    },
    {
        id: 'lr-002',
        employeeId: 'emp-002',
        employeeName: 'Liam Nguyen',
        leaveType: 'Sick Leave',
        startDate: '2026-08-05',
        endDate: '2026-08-06',
        reason: 'Medical appointment.',
        status: 'pending',
        createdAt: '2026-08-01',
    },
    {
        id: 'lr-003',
        employeeId: 'emp-004',
        employeeName: 'Noah Patel',
        leaveType: 'Personal Leave',
        startDate: '2026-08-18',
        endDate: '2026-08-18',
        status: 'pending',
        createdAt: '2026-08-02',
    },
    {
        id: 'lr-004',
        employeeId: 'emp-001',
        employeeName: 'Olivia Bennett',
        leaveType: 'Unpaid Leave',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        reason: 'Overseas travel.',
        status: 'rejected',
        createdAt: '2026-07-15',
        reviewedBy: 'admin-001',
        reviewedAt: '2026-07-16',
    },
];

/** Resolves after {@link NETWORK_DELAY_MS} to emulate request latency. */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simulated GET /employees/:id/availability. */
async function fetchAvailability(employeeId: string): Promise<WeeklyAvailability | null> {
    await delay(NETWORK_DELAY_MS);
    return AVAILABILITY_STORE[employeeId] ?? null;
}

/** Simulated GET /leave-requests. */
async function fetchLeaveRequests(): Promise<LeaveRequest[]> {
    await delay(NETWORK_DELAY_MS);
    return [...leaveRequestStore];
}

/** Simulated POST /leave-requests. */
async function createLeaveRequest(input: CreateLeaveRequestInput): Promise<LeaveRequest> {
    await delay(NETWORK_DELAY_MS);

    const employee = AVAILABILITY_EMPLOYEES.find((item) => item.id === input.employeeId);

    const created: LeaveRequest = {
        id: `lr-${(leaveRequestStore.length + 1).toString().padStart(3, '0')}`,
        employeeId: input.employeeId,
        employeeName: employee?.name ?? 'Unknown Employee',
        leaveType: input.leaveType,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason,
        status: 'pending',
        createdAt: new Date().toISOString().slice(0, 10),
    };

    leaveRequestStore = [created, ...leaveRequestStore];
    return created;
}

/** Simulated PATCH /leave-requests/:id/approve. */
async function approveLeaveRequest(input: ApproveLeaveRequestInput): Promise<LeaveRequest> {
    await delay(NETWORK_DELAY_MS);

    leaveRequestStore = leaveRequestStore.map((request) =>
        request.id === input.requestId
            ? {
                ...request,
                status: 'approved',
                reviewedBy: 'admin-001',
                reviewedAt: new Date().toISOString().slice(0, 10),
            }
            : request,
    );

    const updated = leaveRequestStore.find((request) => request.id === input.requestId);
    if (!updated) throw new Error('Leave request not found.');
    return updated;
}

/** Simulated PATCH /leave-requests/:id/reject. */
async function rejectLeaveRequest(input: RejectLeaveRequestInput): Promise<LeaveRequest> {
    await delay(NETWORK_DELAY_MS);

    leaveRequestStore = leaveRequestStore.map((request) =>
        request.id === input.requestId
            ? {
                ...request,
                status: 'rejected',
                reason: input.reason ?? request.reason,
                reviewedBy: 'admin-001',
                reviewedAt: new Date().toISOString().slice(0, 10),
            }
            : request,
    );

    const updated = leaveRequestStore.find((request) => request.id === input.requestId);
    if (!updated) throw new Error('Leave request not found.');
    return updated;
}

/** Reads a single employee's recurring weekly availability. */
export function useAvailability(
    employeeId: string,
): UseQueryResult<WeeklyAvailability | null, Error> {
    return useQuery<WeeklyAvailability | null, Error>({
        queryKey: [...AVAILABILITY_QUERY_KEY, employeeId],
        queryFn: () => fetchAvailability(employeeId),
        enabled: employeeId.length > 0,
        staleTime: 30_000,
    });
}

/** Reads all leave requests. */
export function useLeaveRequests(): UseQueryResult<LeaveRequest[], Error> {
    return useQuery<LeaveRequest[], Error>({
        queryKey: LEAVE_REQUESTS_QUERY_KEY,
        queryFn: fetchLeaveRequests,
        staleTime: 15_000,
    });
}

/** Creates a leave request and invalidates the list cache on success. */
export function useCreateLeaveRequest(): UseMutationResult<
    LeaveRequest,
    Error,
    CreateLeaveRequestInput
> {
    const queryClient = useQueryClient();

    return useMutation<LeaveRequest, Error, CreateLeaveRequestInput>({
        mutationFn: createLeaveRequest,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LEAVE_REQUESTS_QUERY_KEY });
        },
    });
}

/** Approves a leave request and refreshes the list. */
export function useApproveLeaveRequest(): UseMutationResult<
    LeaveRequest,
    Error,
    ApproveLeaveRequestInput
> {
    const queryClient = useQueryClient();

    return useMutation<LeaveRequest, Error, ApproveLeaveRequestInput>({
        mutationFn: approveLeaveRequest,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LEAVE_REQUESTS_QUERY_KEY });
        },
    });
}

/** Rejects a leave request and refreshes the list. */
export function useRejectLeaveRequest(): UseMutationResult<
    LeaveRequest,
    Error,
    RejectLeaveRequestInput
> {
    const queryClient = useQueryClient();

    return useMutation<LeaveRequest, Error, RejectLeaveRequestInput>({
        mutationFn: rejectLeaveRequest,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LEAVE_REQUESTS_QUERY_KEY });
        },
    });
}
