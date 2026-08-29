import { AlertTriangle, CalendarDays, CheckCircle, RotateCcw, UserCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { LeaveType, LeaveTypeMutationInput, LeaveTypeStatus } from '@/types/leave-type';

import { LeaveTypeForm } from '../components/LeaveTypeForm';
import { LeaveTypesTable } from '../components/LeaveTypesTable';
import {
    deriveLeaveTypeStats,
    useCreateLeaveType,
    useDeleteLeaveType,
    useLeaveTypes,
    useUpdateLeaveType,
} from '../hooks/useLeaveTypes';

const ALL_VALUE = 'all';
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-48',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/** Administrator workspace for leave policies offered to employees in leave requests. */
export default function LeaveTypesPage(): JSX.Element {
    const [status, setStatus] = useState<LeaveTypeStatus | typeof ALL_VALUE>(ALL_VALUE);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);

    const leaveTypesQuery = useLeaveTypes({
        status: status === ALL_VALUE ? undefined : status,
        perPage: 100,
    });
    const createLeaveType = useCreateLeaveType();
    const updateLeaveType = useUpdateLeaveType();
    const deleteLeaveType = useDeleteLeaveType();

    const leaveTypes = useMemo(() => leaveTypesQuery.data ?? [], [leaveTypesQuery.data]);
    const stats = useMemo(() => deriveLeaveTypeStats(leaveTypes), [leaveTypes]);
    const isFormOpen = isCreateOpen || editingLeaveType !== null;

    const handleFormOpenChange = (open: boolean): void => {
        if (!open) {
            setIsCreateOpen(false);
            setEditingLeaveType(null);
        }
    };

    const handleSave = async (values: LeaveTypeMutationInput): Promise<void> => {
        try {
            if (editingLeaveType) {
                await updateLeaveType.mutateAsync({ id: editingLeaveType.id, input: values });
                toast.success('Leave type updated', {
                    description: `${values.name} is now configured for employee leave requests.`,
                });
            } else {
                await createLeaveType.mutateAsync(values);
                toast.success('Leave type created', {
                    description: `${values.name} is now available according to its active status.`,
                });
            }

            setIsCreateOpen(false);
            setEditingLeaveType(null);
        } catch (error) {
            toast.error('Unable to save leave type', {
                description: getApiErrorMessage(error, 'Review the policy details and try again.'),
            });
        }
    };

    const handleDelete = (leaveType: LeaveType): void => {
        deleteLeaveType.mutate(leaveType.id, {
            onSuccess: () =>
                toast.success('Leave type deleted', {
                    description: `${leaveType.name} is no longer available in new employee leave requests.`,
                }),
            onError: (error) =>
                toast.error('Unable to delete leave type', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Leave types</h1>
                    <p className="text-sm text-muted-foreground">
                        Configure leave categories, annual entitlement and rollover rules for employee requests.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsCreateOpen(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    Create leave type
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Leave Types"
                    value={stats.total}
                    icon={CalendarDays}
                    tone="primary"
                    description="In the current view"
                    isLoading={leaveTypesQuery.isLoading}
                />
                <StatCard
                    title="Available to Employees"
                    value={stats.active}
                    icon={UserCheck}
                    tone="success"
                    description="Active in new requests"
                    isLoading={leaveTypesQuery.isLoading}
                />
                <StatCard
                    title="Paid Categories"
                    value={stats.paid}
                    icon={CheckCircle}
                    tone="info"
                    description="Included in payroll"
                    isLoading={leaveTypesQuery.isLoading}
                />
                <StatCard
                    title="Rollover Enabled"
                    value={stats.rolloverEnabled}
                    icon={RotateCcw}
                    tone="warning"
                    description="Carry-over leave policies"
                    isLoading={leaveTypesQuery.isLoading}
                />
            </div>

            {leaveTypesQuery.isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Unable to load leave types</p>
                        <p className="text-sm text-muted-foreground">
                            The leave policy workspace could not be loaded. Please try again.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void leaveTypesQuery.refetch()}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3 text-sm text-muted-foreground">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                                <Users className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <p className="max-w-2xl pt-0.5">
                                Employees select from active leave types when submitting a leave request. Mark a type
                                inactive rather than deleting it when you need to preserve a policy for reference.
                            </p>
                        </div>
                        <div className="w-full space-y-1.5 sm:w-auto">
                            <label htmlFor="leave-type-status-filter" className="block text-sm font-medium text-foreground">
                                Availability
                            </label>
                            <select
                                id="leave-type-status-filter"
                                value={status}
                                onChange={(event) =>
                                    setStatus(event.target.value as LeaveTypeStatus | typeof ALL_VALUE)
                                }
                                className={selectClasses}
                            >
                                <option value={ALL_VALUE}>All leave types</option>
                                <option value="active">Active only</option>
                                <option value="inactive">Inactive only</option>
                            </select>
                        </div>
                    </div>

                    <LeaveTypesTable
                        leaveTypes={leaveTypes}
                        isLoading={leaveTypesQuery.isLoading}
                        onEdit={(leaveType) => setEditingLeaveType(leaveType)}
                        onDelete={handleDelete}
                    />
                </>
            )}

            <LeaveTypeForm
                open={isFormOpen}
                onOpenChange={handleFormOpenChange}
                leaveType={editingLeaveType ?? undefined}
                isSaving={createLeaveType.isPending || updateLeaveType.isPending}
                onSubmit={handleSave}
            />
        </div>
    );
}
