import {
    AlertTriangle,
    ArrowLeft,
    CalendarCheck2,
    CalendarDays,
    CheckCircle,
    Clock3,
    Download,
    Paperclip,
    UserRound,
    XCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { LEAVE_REQUEST_STATUS_LABELS, type LeaveRequestStatus } from '@/types/leave-request';

import { ApproveRejectButtons } from '../components/ApproveRejectButtons';
import {
    canReviewLeaveRequests,
    useApproveLeaveRequest,
    useCurrentLeaveUser,
    useLeaveRequest,
    useRejectLeaveRequest,
} from '../hooks/useLeaveRequests';
import {
    formatLeaveDateRange,
    formatLeaveDuration,
    toAttachmentUrl,
} from '../lib/leave-request-utils';

const statusClasses: Record<LeaveRequestStatus, string> = {
    pending: 'bg-warning/10 text-warning',
    approved: 'bg-success/10 text-success',
    rejected: 'bg-danger/10 text-danger',
    cancelled: 'bg-muted text-muted-foreground',
};

function formatDecisionTime(value: string | null): string | null {
    if (!value) {
        return null;
    }

    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : format(parsed, "d MMM yyyy 'at' h:mm a");
}

/** Full leave request record and decision workflow at `/leave-requests/:id`. */
export default function LeaveRequestDetailPage(): JSX.Element {
    const { id } = useParams<{ id: string }>();
    const requestQuery = useLeaveRequest(id);
    const currentUserQuery = useCurrentLeaveUser();
    const approveRequest = useApproveLeaveRequest();
    const rejectRequest = useRejectLeaveRequest();

    const request = requestQuery.data;
    const canManageRequests = canReviewLeaveRequests(currentUserQuery.data);

    const handleApprove = async (adminNotes: string | null): Promise<void> => {
        if (!request) {
            return;
        }

        try {
            await approveRequest.mutateAsync({ id: request.id, adminNotes });
            toast.success('Leave request approved', {
                description: 'The employee has been notified and the calendar is now blocked.',
            });
        } catch (error) {
            toast.error('Unable to approve leave request', {
                description: getApiErrorMessage(error, 'Please try again.'),
            });
        }
    };

    const handleReject = async (rejectionReason: string): Promise<void> => {
        if (!request) {
            return;
        }

        try {
            await rejectRequest.mutateAsync({ id: request.id, rejectionReason });
            toast.success('Leave request rejected', {
                description: 'The employee has been notified of the decision.',
            });
        } catch (error) {
            toast.error('Unable to reject leave request', {
                description: getApiErrorMessage(error, 'Please try again.'),
            });
        }
    };

    if (requestQuery.isLoading || currentUserQuery.isLoading) {
        return (
            <div className="space-y-6" aria-busy="true">
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                <div className="h-28 animate-pulse rounded-xl bg-muted" />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="h-96 animate-pulse rounded-xl bg-muted lg:col-span-2" />
                    <div className="h-72 animate-pulse rounded-xl bg-muted" />
                </div>
            </div>
        );
    }

    if (requestQuery.isError || !request) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Unable to load this leave request</p>
                    <p className="text-sm text-muted-foreground">
                        The request may no longer be available, or you may not have permission to view it.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link
                        to="/leave-requests"
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Back to requests
                    </Link>
                    <button
                        type="button"
                        onClick={() => void requestQuery.refetch()}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    const decisionTime = formatDecisionTime(request.approvedAt ?? request.rejectedAt);

    return (
        <div className="space-y-6">
            <Link
                to="/leave-requests"
                className="inline-flex items-center gap-2 rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to leave requests
            </Link>

            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <CalendarDays className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                                {request.leaveType?.name ?? 'Leave request'}
                            </h1>
                            <span
                                className={cn(
                                    'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                                    statusClasses[request.status],
                                )}
                            >
                                {LEAVE_REQUEST_STATUS_LABELS[request.status]}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {formatLeaveDateRange(request.startDate, request.endDate)} · {formatLeaveDuration(request.totalDays)}
                        </p>
                    </div>
                </div>
                {canManageRequests && request.status === 'pending' ? (
                    <div className="w-full sm:w-auto sm:min-w-80">
                        <ApproveRejectButtons
                            request={request}
                            isApproving={approveRequest.isPending}
                            isRejecting={rejectRequest.isPending}
                            onApprove={handleApprove}
                            onReject={handleReject}
                        />
                    </div>
                ) : null}
            </div>

            {request.status === 'approved' ? (
                <div className="rounded-xl border border-success/20 bg-success/10 p-4 text-success">
                    <div className="flex gap-3">
                        <CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        <div className="space-y-1">
                            <p className="font-semibold">Calendar blocked for approved leave</p>
                            <p className="text-sm">
                                This approved absence is automatically shown as a blocking event in the roster calendar.
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="leave-details-heading">
                        <h2 id="leave-details-heading" className="text-base font-semibold text-foreground">
                            Request details
                        </h2>
                        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="rounded-lg bg-muted/50 p-4">
                                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dates</dt>
                                <dd className="mt-1 font-medium text-foreground">
                                    {formatLeaveDateRange(request.startDate, request.endDate)}
                                </dd>
                            </div>
                            <div className="rounded-lg bg-muted/50 p-4">
                                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Duration</dt>
                                <dd className="mt-1 inline-flex items-center gap-1.5 font-medium text-foreground">
                                    <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                    {formatLeaveDuration(request.totalDays)}
                                </dd>
                            </div>
                            <div className="rounded-lg bg-muted/50 p-4">
                                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Start session</dt>
                                <dd className="mt-1 font-medium text-foreground">
                                    {request.startSession === 'full_day'
                                        ? 'Full day'
                                        : request.startSession === 'first_half'
                                          ? 'First half'
                                          : 'Second half'}
                                </dd>
                            </div>
                            <div className="rounded-lg bg-muted/50 p-4">
                                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">End session</dt>
                                <dd className="mt-1 font-medium text-foreground">
                                    {request.endSession === 'full_day'
                                        ? 'Full day'
                                        : request.endSession === 'first_half'
                                          ? 'First half'
                                          : 'Second half'}
                                </dd>
                            </div>
                        </dl>
                        <div className="border-t border-border pt-4">
                            <h3 className="text-sm font-semibold text-foreground">Reason</h3>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                {request.reason ?? 'No additional reason was provided.'}
                            </p>
                        </div>
                    </section>

                    <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="leave-attachments-heading">
                        <h2 id="leave-attachments-heading" className="text-base font-semibold text-foreground">
                            Attachments
                        </h2>
                        {request.attachments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No documents were attached to this request.</p>
                        ) : (
                            <ul className="space-y-2">
                                {request.attachments.map((attachment) => {
                                    const fileName = attachment.split('/').pop() ?? 'Attachment';
                                    return (
                                        <li key={attachment}>
                                            <a
                                                href={toAttachmentUrl(attachment)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                    <span className="truncate">{fileName}</span>
                                                </span>
                                                <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                </div>

                <aside className="space-y-6">
                    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="leave-employee-heading">
                        <h2 id="leave-employee-heading" className="text-base font-semibold text-foreground">
                            Employee
                        </h2>
                        {request.employee ? (
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-accent-foreground">
                                    {request.employee.avatarUrl ? (
                                        <img src={request.employee.avatarUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <UserRound className="h-5 w-5" aria-hidden="true" />
                                    )}
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{request.employee.name}</p>
                                    <p className="truncate text-sm text-muted-foreground">{request.employee.email || 'No email'}</p>
                                    {request.employee.branchName ? (
                                        <p className="truncate text-xs text-muted-foreground">{request.employee.branchName}</p>
                                    ) : null}
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">Employee details are unavailable.</p>
                        )}
                    </section>

                    <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="leave-decision-heading">
                        <h2 id="leave-decision-heading" className="text-base font-semibold text-foreground">
                            Decision
                        </h2>
                        {request.status === 'pending' ? (
                            <p className="text-sm text-muted-foreground">This request is waiting for a manager decision.</p>
                        ) : request.status === 'approved' ? (
                            <div className="space-y-2 text-sm">
                                <p className="inline-flex items-center gap-2 font-semibold text-success">
                                    <CheckCircle className="h-4 w-4" aria-hidden="true" />
                                    Approved
                                </p>
                                {request.approver ? <p className="text-muted-foreground">By {request.approver.name}</p> : null}
                                {decisionTime ? <p className="text-muted-foreground">{decisionTime}</p> : null}
                                {request.adminNotes ? (
                                    <p className="rounded-lg bg-success/10 p-3 text-success">{request.adminNotes}</p>
                                ) : null}
                            </div>
                        ) : request.status === 'rejected' ? (
                            <div className="space-y-2 text-sm">
                                <p className="inline-flex items-center gap-2 font-semibold text-danger">
                                    <XCircle className="h-4 w-4" aria-hidden="true" />
                                    Rejected
                                </p>
                                {request.rejecter ? <p className="text-muted-foreground">By {request.rejecter.name}</p> : null}
                                {decisionTime ? <p className="text-muted-foreground">{decisionTime}</p> : null}
                                {request.rejectionReason ? (
                                    <p className="rounded-lg bg-danger/10 p-3 text-danger">{request.rejectionReason}</p>
                                ) : null}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">This request has been cancelled.</p>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
}
