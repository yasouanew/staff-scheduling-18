import { CalendarDays, Clock3, Paperclip, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { LEAVE_REQUEST_STATUS_LABELS, type LeaveRequest, type LeaveRequestStatus } from '@/types/leave-request';

import { formatLeaveDateRange, formatLeaveDuration } from '../lib/leave-request-utils';

interface LeaveRequestCardProps {
    request: LeaveRequest;
    showEmployee?: boolean;
    actions?: ReactNode;
}

const statusClasses: Record<LeaveRequestStatus, string> = {
    pending: 'bg-warning/10 text-warning',
    approved: 'bg-success/10 text-success',
    rejected: 'bg-danger/10 text-danger',
    cancelled: 'bg-muted text-muted-foreground',
};

/** Responsive request summary card that links to the complete review record. */
export function LeaveRequestCard({
    request,
    showEmployee = false,
    actions,
}: LeaveRequestCardProps): JSX.Element {
    return (
        <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            to={`/leave-requests/${request.id}`}
                            className="rounded text-base font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {request.leaveType?.name ?? 'Leave request'}
                        </Link>
                        <span
                            className={cn(
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                                statusClasses[request.status],
                            )}
                        >
                            {LEAVE_REQUEST_STATUS_LABELS[request.status]}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4" aria-hidden="true" />
                            {formatLeaveDateRange(request.startDate, request.endDate)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-4 w-4" aria-hidden="true" />
                            {formatLeaveDuration(request.totalDays)}
                        </span>
                        {request.attachments.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                                <Paperclip className="h-4 w-4" aria-hidden="true" />
                                {request.attachments.length} attachment{request.attachments.length === 1 ? '' : 's'}
                            </span>
                        ) : null}
                    </div>
                </div>
                {showEmployee && request.employee ? (
                    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-accent-foreground">
                            {request.employee.avatarUrl ? (
                                <img src={request.employee.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <UserRound className="h-4 w-4" aria-hidden="true" />
                            )}
                        </span>
                        <span className="min-w-0 truncate font-medium">{request.employee.name}</span>
                    </div>
                ) : null}
            </div>

            {request.reason ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{request.reason}</p> : null}
            {request.status === 'rejected' && request.rejectionReason ? (
                <p className="mt-4 rounded-lg border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
                    <span className="font-semibold">Rejection reason:</span> {request.rejectionReason}
                </p>
            ) : null}
            {request.status === 'approved' ? (
                <p className="mt-4 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success">
                    This approved absence is blocking the roster calendar.
                </p>
            ) : null}
            {actions ? <div className="mt-4">{actions}</div> : null}
        </article>
    );
}
