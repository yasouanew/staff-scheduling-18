import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { useLeaveTypes } from '@/features/leave-types/hooks/useLeaveTypes';
import { getApiErrorMessage } from '@/lib/api-client';
import type { CreateLeaveRequestInput } from '@/types/leave-request';

import { LeaveRequestForm } from '../components/LeaveRequestForm';
import {
    canReviewLeaveRequests,
    useCreateLeaveRequest,
    useCurrentLeaveUser,
    useLeaveRequests,
} from '../hooks/useLeaveRequests';

/** Dedicated leave request submission route at `/leave-requests/new`. */
export default function LeaveRequestNewPage(): JSX.Element {
    const navigate = useNavigate();
    const currentUserQuery = useCurrentLeaveUser();
    const canManageRequests = canReviewLeaveRequests(currentUserQuery.data);
    const currentEmployeeId = currentUserQuery.data?.employee_id
        ? String(currentUserQuery.data.employee_id)
        : null;
    const leaveTypesQuery = useLeaveTypes({ status: 'active', perPage: 100 });
    const employeesQuery = useEmployees({ status: 'active', perPage: 100 });
    const requestsQuery = useLeaveRequests({
        employeeId: canManageRequests ? undefined : currentEmployeeId ?? undefined,
        perPage: 100,
    });
    const createRequest = useCreateLeaveRequest();

    const hasError =
        currentUserQuery.isError ||
        leaveTypesQuery.isError ||
        employeesQuery.isError ||
        requestsQuery.isError;
    const isLoading =
        currentUserQuery.isLoading ||
        leaveTypesQuery.isLoading ||
        employeesQuery.isLoading ||
        requestsQuery.isLoading;

    const handleSubmit = async (values: CreateLeaveRequestInput): Promise<void> => {
        try {
            const request = await createRequest.mutateAsync(values);
            toast.success('Leave request submitted', {
                description: 'Your reviewer has been notified. You will receive an update when a decision is made.',
            });
            navigate(`/leave-requests/${request.id}`, { replace: true });
        } catch (error) {
            toast.error('Unable to submit leave request', {
                description: getApiErrorMessage(error, 'Review the details and try again.'),
            });
        }
    };

    if (hasError) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Unable to prepare the leave request form</p>
                    <p className="text-sm text-muted-foreground">
                        Leave policy or employee information could not be loaded. Please try again.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        void currentUserQuery.refetch();
                        void leaveTypesQuery.refetch();
                        void employeesQuery.refetch();
                        void requestsQuery.refetch();
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (!isLoading && !canManageRequests && !currentEmployeeId) {
        return (
            <div className="space-y-6">
                <Link
                    to="/leave-requests"
                    className="inline-flex items-center gap-2 rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to leave requests
                </Link>
                <div className="rounded-xl border border-warning/30 bg-warning/10 p-6 text-warning">
                    <div className="flex gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        <div className="space-y-1">
                            <p className="font-semibold">Employee profile required</p>
                            <p className="text-sm">
                                Your account is not linked to an employee profile, so a leave request cannot be submitted
                                yet. Ask a company administrator to link your employee record.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Link
                to="/leave-requests"
                className="inline-flex items-center gap-2 rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to leave requests
            </Link>
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">New leave request</h1>
                <p className="text-sm text-muted-foreground">
                    Select an active leave policy, check your available allowance and submit your request for review.
                </p>
            </div>

            {isLoading ? (
                <div className="space-y-4" aria-busy="true">
                    <div className="h-24 animate-pulse rounded-xl bg-muted" />
                    <div className="h-96 animate-pulse rounded-xl bg-muted" />
                </div>
            ) : (
                <LeaveRequestForm
                    leaveTypes={leaveTypesQuery.data ?? []}
                    employees={employeesQuery.data ?? []}
                    requests={requestsQuery.data ?? []}
                    currentEmployeeId={currentEmployeeId}
                    canManageRequests={canManageRequests}
                    isSaving={createRequest.isPending}
                    onSubmit={handleSubmit}
                />
            )}
        </div>
    );
}
