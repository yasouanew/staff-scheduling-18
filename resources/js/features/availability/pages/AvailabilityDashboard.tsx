import * as Tabs from '@radix-ui/react-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { AlertTriangle, CalendarClock, CalendarPlus, Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DataTable } from '@/Components/tables/DataTable';
import { cn } from '@/lib/utils';
import type { LeaveRequest } from '@/types/availability';

import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { LeaveStatusBadge } from '../components/LeaveStatusBadge';
import { WeeklyAvailabilityGrid } from '../components/WeeklyAvailabilityGrid';
import {
    AVAILABILITY_EMPLOYEES,
    useApproveLeaveRequest,
    useAvailability,
    useLeaveRequests,
    useRejectLeaveRequest,
} from '../hooks/useAvailability';

/** Dedicated client so the feature works standalone without global setup. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Formats an inclusive date range into a readable duration label. */
function formatDuration(startDate: string, endDate: string): string {
    const days = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Shared tab trigger styling using semantic tokens. */
const tabTriggerClasses = cn(
    'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors',
    'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
);

/** Inner "Base Availability" tab — employee selector + weekly grid. */
function BaseAvailabilityTab(): JSX.Element {
    const [employeeId, setEmployeeId] = useState<string>(AVAILABILITY_EMPLOYEES[0]?.id ?? '');
    const { data, isLoading } = useAvailability(employeeId);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        Weekly Base Availability
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Recurring hours the selected employee is able to work.
                    </p>
                </div>
                <div className="w-full sm:w-56">
                    <label htmlFor="availability-employee" className="sr-only">
                        Select employee
                    </label>
                    <select
                        id="availability-employee"
                        value={employeeId}
                        onChange={(event) => setEmployeeId(event.target.value)}
                        className={cn(
                            'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                    >
                        {AVAILABILITY_EMPLOYEES.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                                {employee.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" />
                    Available
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full bg-danger" aria-hidden="true" />
                    Unavailable
                </span>
            </div>

            <WeeklyAvailabilityGrid availability={data ?? null} isLoading={isLoading} />
        </div>
    );
}

/** Inner "Leave Requests" tab — approval workflow + tracking table. */
function LeaveRequestsTab(): JSX.Element {
    const { data, isLoading, isError, refetch } = useLeaveRequests();
    const approveRequest = useApproveLeaveRequest();
    const rejectRequest = useRejectLeaveRequest();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const requests = useMemo(() => data ?? [], [data]);

    const handleApprove = async (request: LeaveRequest): Promise<void> => {
        try {
            await approveRequest.mutateAsync({ requestId: request.id });
            toast.success('Leave approved', {
                description: `${request.employeeName}'s ${request.leaveType.toLowerCase()} has been approved.`,
            });
        } catch {
            toast.error('Unable to approve request', {
                description: 'Something went wrong. Please try again.',
            });
        }
    };

    const handleReject = async (request: LeaveRequest): Promise<void> => {
        try {
            await rejectRequest.mutateAsync({ requestId: request.id });
            toast.success('Leave rejected', {
                description: `${request.employeeName}'s request has been rejected.`,
            });
        } catch {
            toast.error('Unable to reject request', {
                description: 'Something went wrong. Please try again.',
            });
        }
    };

    const columns = useMemo<ColumnDef<LeaveRequest>[]>(
        () => [
            {
                id: 'employeeName',
                accessorKey: 'employeeName',
                header: 'Employee',
                cell: ({ row }) => (
                    <span className="font-medium text-foreground">{row.original.employeeName}</span>
                ),
            },
            {
                id: 'leaveType',
                accessorKey: 'leaveType',
                header: 'Type',
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.leaveType}</span>
                ),
                meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
            },
            {
                id: 'startDate',
                accessorKey: 'startDate',
                header: 'Dates',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {format(parseISO(row.original.startDate), 'dd MMM')} –{' '}
                        {format(parseISO(row.original.endDate), 'dd MMM yyyy')}
                    </span>
                ),
            },
            {
                id: 'duration',
                header: 'Duration',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {formatDuration(row.original.startDate, row.original.endDate)}
                    </span>
                ),
                meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
            },
            {
                id: 'status',
                accessorKey: 'status',
                header: 'Status',
                cell: ({ row }) => <LeaveStatusBadge status={row.original.status} />,
            },
            {
                id: 'actions',
                header: () => <span className="sr-only">Actions</span>,
                cell: ({ row }) => {
                    const request = row.original;
                    if (request.status !== 'pending') {
                        return <span className="text-xs text-muted-foreground">—</span>;
                    }

                    return (
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => void handleApprove(request)}
                                disabled={approveRequest.isPending}
                                className={cn(
                                    'inline-flex h-8 items-center gap-1 rounded-lg bg-success/10 px-2.5 text-xs font-medium text-success transition-colors',
                                    'hover:bg-success/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    'disabled:pointer-events-none disabled:opacity-50',
                                )}
                            >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                Approve
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleReject(request)}
                                disabled={rejectRequest.isPending}
                                className={cn(
                                    'inline-flex h-8 items-center gap-1 rounded-lg bg-danger/10 px-2.5 text-xs font-medium text-danger transition-colors',
                                    'hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    'disabled:pointer-events-none disabled:opacity-50',
                                )}
                            >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                Reject
                            </button>
                        </div>
                    );
                },
                meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
            },
        ],
        // handleApprove/handleReject are stable within render scope; mutation state drives disabled.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [approveRequest.isPending, rejectRequest.isPending],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        Leave Requests
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Review, approve and track employee leave.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className={cn(
                        'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                        'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    )}
                >
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    Book leave
                </button>
            </div>

            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Unable to load leave requests
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Something went wrong while fetching the records.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <DataTable<LeaveRequest, unknown>
                    columns={columns}
                    data={requests}
                    isLoading={isLoading}
                    searchKey="employeeName"
                    searchPlaceholder="Search by employee..."
                />
            )}

            <LeaveRequestModal open={isModalOpen} onOpenChange={setIsModalOpen} />
        </div>
    );
}

/** Inner dashboard view (relies on an ancestor QueryClientProvider). */
function AvailabilityDashboardView(): JSX.Element {
    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Availability & Leave
                </h1>
                <p className="text-sm text-muted-foreground">
                    Manage recurring availability patterns and employee leave requests.
                </p>
            </div>

            <Tabs.Root defaultValue="availability" className="space-y-6">
                <Tabs.List
                    aria-label="Availability and leave views"
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1"
                >
                    <Tabs.Trigger value="availability" className={tabTriggerClasses}>
                        <CalendarClock className="h-4 w-4" aria-hidden="true" />
                        Weekly Availability
                    </Tabs.Trigger>
                    <Tabs.Trigger value="leave" className={tabTriggerClasses}>
                        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                        Leave Requests
                    </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="availability" className="focus-visible:outline-none">
                    <BaseAvailabilityTab />
                </Tabs.Content>
                <Tabs.Content value="leave" className="focus-visible:outline-none">
                    <LeaveRequestsTab />
                </Tabs.Content>
            </Tabs.Root>
        </div>
    );
}

/**
 * Employee Availability & Leave Requests dashboard. Owns the feature-scoped
 * QueryClient and composes a tabbed interface separating the Weekly Base
 * Availability viewer from the Leave Requests tracking table + approval flow.
 */
export default function AvailabilityDashboard(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <AvailabilityDashboardView />
        </QueryClientProvider>
    );
}
