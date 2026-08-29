import { AlertTriangle, CalendarCheck2, Clock3, Plus, UserCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { LeaveRequest, LeaveRequestStatus } from '@/types/leave-request';

import { ApproveRejectButtons } from '../components/ApproveRejectButtons';
import { LeaveRequestCard } from '../components/LeaveRequestCard';
import {
    canReviewLeaveRequests,
    useApproveLeaveRequest,
    useCurrentLeaveUser,
    useLeaveRequests,
    useRejectLeaveRequest,
} from '../hooks/useLeaveRequests';

const ALL_VALUE = 'all';
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-48',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

function deriveStats(requests: readonly LeaveRequest[]): {
    total: number;
    pending: number;
    approved: number;
    approvedDays: number;
} {
    return requests.reduce(
        (stats, request) => ({
            total: stats.total + 1,
            pending: stats.pending + (request.status === 'pending' ? 1 : 0),
            approved: stats.approved + (request.status === 'approved' ? 1 : 0),
            approvedDays:
                stats.approvedDays + (request.status === 'approved' ? request.totalDays : 0),
        }),
        { total: 0, pending: 0, approved: 0, approvedDays: 0 },
    );
}

/** Employee request history and manager review queue at `/leave-requests`. */
export default function LeaveRequestsListPage(): JSX.Element {
    const [status, setStatus] = useState<LeaveRequestStatus | typeof ALL_VALUE>(ALL_VALUE);
    const [employeeId, setEmployeeId] = useState(ALL_VALUE);

    const currentUserQuery = useCurrentLeaveUser();
    const canManageRequests = canReviewLeaveRequests(currentUserQuery.data);
    const currentEmployeeId = currentUserQuery.data?.employee_id
        ? String(currentUserQuery.data.employee_id)
        : undefined;
    const leaveRequestsQuery = useLeaveRequests({
        status: status === ALL_VALUE ? undefined : status,
        employeeId: canManageRequests
            ? employeeId === ALL_VALUE
                ? undefined
                : employeeId
            : currentEmployeeId,
        perPage: 100,
    });
    const employeesQuery = useEmployees({ status: 'active', perPage: 100 });
    const approveRequest = useApproveLeaveRequest();
    const rejectRequest = useRejectLeaveRequest();

    const requests = useMemo(() => leaveRequestsQuery.data ?? [], [leaveRequestsQuery.data]);
    const stats = useMemo(() => deriveStats(requests), [requests]);

    const handleApprove = async (request: LeaveRequest, adminNotes: string | null): Promise<void> => {
        try {
            await approveRequest.mutateAsync({ id: request.id, adminNotes });
            toast.success('Leave request approved', {
                description: `${request.employee?.name ?? 'The employee'} has been notified and the calendar is blocked.`,
            });
        } catch (error) {
            toast.error('Unable to approve leave request', {
                description: getApiErrorMessage(error, 'Please try again.'),
            });
        }
    };

    const handleReject = async (request: LeaveRequest, rejectionReason: string): Promise<void> => {
        try {
            await rejectRequest.mutateAsync({ id: request.id, rejectionReason });
            toast.success('Leave request rejected', {
                description: `${request.employee?.name ?? 'The employee'} has been notified of the decision.`,
            });
        } catch (error) {
            toast.error('Unable to reject leave request', {
                description: getApiErrorMessage(error, 'Please try again.'),
            });
        }
    };

    const hasError = leaveRequestsQuery.isError || currentUserQuery.isError || employeesQuery.isError;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        {canManageRequests ? 'Leave requests' : 'My leave requests'}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {canManageRequests
                            ? 'Review employee absences, approve coverage plans and communicate decisions.'
                            : 'Submit time away and follow each request through the review process.'}
                    </p>
                </div>
                <Link
                    to="/leave-requests/new"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New leave request
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Requests"
                    value={stats.total}
                    icon={CalendarCheck2}
                    tone="primary"
                    description="In the current view"
                    isLoading={leaveRequestsQuery.isLoading}
                />
                <StatCard
                    title="Pending Review"
                    value={stats.pending}
                    icon={Clock3}
                    tone="warning"
                    description={canManageRequests ? 'Awaiting a manager decision' : 'Awaiting review'}
                    isLoading={leaveRequestsQuery.isLoading}
                />
                <StatCard
                    title="Approved"
                    value={stats.approved}
                    icon={UserCheck}
                    tone="success"
                    description="Blocking calendar coverage"
                    isLoading={leaveRequestsQuery.isLoading}
                />
                <StatCard
                    title="Approved Days"
                    value={stats.approvedDays}
                    icon={Users}
                    tone="info"
                    description="Across this list"
                    isLoading={leaveRequestsQuery.isLoading}
                />
            </div>

            {hasError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Unable to load leave requests</p>
                        <p className="text-sm text-muted-foreground">
                            Check your connection and try loading the leave workflow again.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            void leaveRequestsQuery.refetch();
                            void currentUserQuery.refetch();
                            void employeesQuery.refetch();
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="space-y-1.5">
                                <label htmlFor="leave-request-status-filter" className="block text-sm font-medium text-foreground">
                                    Status
                                </label>
                                <select
                                    id="leave-request-status-filter"
                                    value={status}
                                    onChange={(event) =>
                                        setStatus(event.target.value as LeaveRequestStatus | typeof ALL_VALUE)
                                    }
                                    className={selectClasses}
                                >
                                    <option value={ALL_VALUE}>All requests</option>
                                    <option value="pending">Pending review</option>
                                    <option value="approved">Approved</option>
                                    <option value="rejected">Rejected</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                            {canManageRequests ? (
                                <div className="space-y-1.5">
                                    <label htmlFor="leave-request-employee-filter" className="block text-sm font-medium text-foreground">
                                        Employee
                                    </label>
                                    <select
                                        id="leave-request-employee-filter"
                                        value={employeeId}
                                        onChange={(event) => setEmployeeId(event.target.value)}
                                        className={selectClasses}
                                    >
                                        <option value={ALL_VALUE}>All employees</option>
                                        {(employeesQuery.data ?? []).map((employee) => (
                                            <option key={employee.id} value={employee.id}>
                                                {employee.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {canManageRequests
                                ? 'Approved requests appear as roster calendar blocks.'
                                : 'You will receive a notification when a decision is recorded.'}
                        </p>
                    </div>

                    {requests.length === 0 && !leaveRequestsQuery.isLoading ? (
                        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <CalendarCheck2 className="h-6 w-6" aria-hidden="true" />
                            </span>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">No leave requests found</p>
                                <p className="text-sm text-muted-foreground">
                                    {canManageRequests
                                        ? 'Change the filters or wait for an employee request to arrive.'
                                        : 'Create a request when you need time away from work.'}
                                </p>
                            </div>
                            <Link
                                to="/leave-requests/new"
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                New leave request
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4" aria-busy={leaveRequestsQuery.isLoading}>
                            {leaveRequestsQuery.isLoading
                                ? Array.from({ length: 4 }).map((_, index) => (
                                      <div key={index} className="h-44 animate-pulse rounded-xl bg-muted" />
                                  ))
                                : requests.map((request) => (
                                      <LeaveRequestCard
                                          key={request.id}
                                          request={request}
                                          showEmployee={canManageRequests}
                                          actions={
                                              canManageRequests && request.status === 'pending' ? (
                                                  <ApproveRejectButtons
                                                      request={request}
                                                      isApproving={approveRequest.isPending}
                                                      isRejecting={rejectRequest.isPending}
                                                      onApprove={(adminNotes) => handleApprove(request, adminNotes)}
                                                      onReject={(reason) => handleReject(request, reason)}
                                                  />
                                              ) : undefined
                                          }
                                      />
                                  ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
