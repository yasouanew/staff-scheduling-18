import { AlertTriangle, CalendarClock, Clock3, Plus, Users, UserCheck, UserRoundX } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { useBranches } from '@/features/branches/hooks/useBranches';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { usePositions } from '@/features/positions/hooks/usePositions';
import { useRosters } from '@/features/rosters/hooks/useRosters';
import { schedulingErrorMessage } from '@/lib/scheduling-errors';
import { cn } from '@/lib/utils';
import type { Shift, ShiftMutationInput, ShiftStatus } from '@/types/shift';

import { AssignEmployeeModal } from '../components/AssignEmployeeModal';
import { ShiftForm } from '../components/ShiftForm';
import { ShiftsTable } from '../components/ShiftsTable';
import {
    useAssignEmployee,
    useCreateShift,
    useDeleteShift,
    useShifts,
    useUpdateShift,
} from '../hooks/useShifts';
import { deriveShiftStats } from '../lib/shift-utils';

const ALL_VALUE = 'all';
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-48',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/** Formats a persisted roster week as a clear form-select label. */
function formatRosterLabel(weekStart: string | null, weekEnd: string | null, branchName: string | null): string {
    const start = weekStart ? parseISO(weekStart) : null;
    const end = weekEnd ? parseISO(weekEnd) : null;
    const range =
        start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
            ? `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
            : 'Untitled roster';

    return branchName ? `${range} · ${branchName}` : range;
}

/** Shift-management page at `/shifts`. The create/edit form opens as an inline drawer. */
export default function ShiftsListPage(): JSX.Element {
    const navigate = useNavigate();
    const [branchId, setBranchId] = useState(ALL_VALUE);
    const [status, setStatus] = useState<ShiftStatus | typeof ALL_VALUE>(ALL_VALUE);
    const [dateFrom, setDateFrom] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [assigningShift, setAssigningShift] = useState<Shift | null>(null);

    const shiftQuery = useShifts({
        branchId: branchId === ALL_VALUE ? undefined : branchId,
        status: status === ALL_VALUE ? undefined : status,
        dateFrom: dateFrom || undefined,
        perPage: 100,
    });
    const rostersQuery = useRosters({ perPage: 100 });
    const employeesQuery = useEmployees({ status: 'active', perPage: 100 });
    const positionsQuery = usePositions({ status: 'active', perPage: 100 });
    const branchesQuery = useBranches({ status: 'active', perPage: 100 });

    const createShift = useCreateShift();
    const updateShift = useUpdateShift();
    const deleteShift = useDeleteShift();
    const assignEmployee = useAssignEmployee();

    const shifts = useMemo(() => shiftQuery.data ?? [], [shiftQuery.data]);
    const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
    const stats = useMemo(() => deriveShiftStats(shifts), [shifts]);
    const isFormOpen = formOpen || editingShift !== null;
    const isReferenceLoading =
        rostersQuery.isLoading || employeesQuery.isLoading || positionsQuery.isLoading || branchesQuery.isLoading;

    const rosterOptions = useMemo(
        () =>
            (rostersQuery.data?.data ?? []).map((roster) => {
                const branch = branchesQuery.data?.data.find(
                    (candidate) => candidate.id === String(roster.branchId),
                );

                return {
                    id: roster.id,
                    label: formatRosterLabel(roster.weekStart, roster.weekEnd, roster.branchName),
                    branchId: roster.branchId === null ? null : String(roster.branchId),
                    branchName: roster.branchName,
                    timezone: branch?.timezone ?? null,
                };
            }),
        [branchesQuery.data?.data, rostersQuery.data?.data],
    );
    const positionOptions = useMemo(
        () =>
            (positionsQuery.data?.data ?? []).map((position) => ({
                id: position.id,
                name: position.name,
                departmentName: position.departmentName,
            })),
        [positionsQuery.data?.data],
    );

    const handleFormOpenChange = (open: boolean): void => {
        if (!open) {
            setEditingShift(null);
            setFormOpen(false);
        }
    };

    const handleSave = async (values: ShiftMutationInput): Promise<void> => {
        try {
            if (editingShift) {
                await updateShift.mutateAsync({ id: editingShift.id, input: values });
                toast.success('Shift updated', {
                    description: 'The shift details and staffing requirement have been saved.',
                });
            } else {
                await createShift.mutateAsync(values);
                toast.success('Shift created', {
                    description: 'The new shift is now available in this roster.',
                });
            }

            setEditingShift(null);
            navigate('/shifts', { replace: true });
        } catch (error) {
            toast.error('Unable to save shift', {
                description: schedulingErrorMessage(error, 'Review the details and try again.'),
            });
        }
    };

    const handleDelete = (shift: Shift): void => {
        deleteShift.mutate(shift.id, {
            onSuccess: () =>
                toast.success('Shift deleted', {
                    description: 'The shift was removed from the roster.',
                }),
            onError: (error) =>
                toast.error('Unable to delete shift', {
                    description: schedulingErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    const handleAssign = async (employeeId: string): Promise<void> => {
        if (!assigningShift) {
            return;
        }

        try {
            await assignEmployee.mutateAsync({ id: assigningShift.id, employeeId });
            toast.success('Employee assigned', {
                description: 'The employee has been assigned to this shift.',
            });
            setAssigningShift(null);
        } catch (error) {
            toast.error('Unable to assign employee', {
                description: schedulingErrorMessage(error, 'Please try again.'),
            });
        }
    };

    const hasLoadError =
        shiftQuery.isError || rostersQuery.isError || employeesQuery.isError || positionsQuery.isError || branchesQuery.isError;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Shifts</h1>
                    <p className="text-sm text-muted-foreground">
                        Create coverage requirements, manage shift times and assign employees with conflict awareness.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setEditingShift(null);
                        setFormOpen(true);
                    }}
                    disabled={isReferenceLoading}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create shift
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="All Shifts"
                    value={stats.total}
                    icon={CalendarClock}
                    tone="primary"
                    description="In the current view"
                    isLoading={shiftQuery.isLoading}
                />
                <StatCard
                    title="Open Shifts"
                    value={stats.open}
                    icon={UserRoundX}
                    tone="warning"
                    description="Need an employee"
                    isLoading={shiftQuery.isLoading}
                />
                <StatCard
                    title="Assigned"
                    value={stats.assigned}
                    icon={UserCheck}
                    tone="success"
                    description="Have an employee"
                    isLoading={shiftQuery.isLoading}
                />
                <StatCard
                    title="Scheduled Hours"
                    value={`${stats.totalHours.toFixed(1)}h`}
                    icon={Clock3}
                    tone="info"
                    description="Before breaks"
                    isLoading={shiftQuery.isLoading}
                />
            </div>

            {hasLoadError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Unable to load shift scheduling data</p>
                        <p className="text-sm text-muted-foreground">
                            Check your connection and try loading the workspace again.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            void shiftQuery.refetch();
                            void rostersQuery.refetch();
                            void employeesQuery.refetch();
                            void positionsQuery.refetch();
                            void branchesQuery.refetch();
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end">
                        <div className="w-full space-y-1.5 sm:w-48">
                            <label htmlFor="shift-branch-filter" className="block text-sm font-medium text-foreground">
                                Branch
                            </label>
                            <select
                                id="shift-branch-filter"
                                value={branchId}
                                onChange={(event) => setBranchId(event.target.value)}
                                disabled={branchesQuery.isLoading}
                                className={selectClasses}
                            >
                                <option value={ALL_VALUE}>All branches</option>
                                {(branchesQuery.data?.data ?? []).map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="w-full space-y-1.5 sm:w-48">
                            <label htmlFor="shift-status-filter" className="block text-sm font-medium text-foreground">
                                Status
                            </label>
                            <select
                                id="shift-status-filter"
                                value={status}
                                onChange={(event) =>
                                    setStatus(event.target.value as ShiftStatus | typeof ALL_VALUE)
                                }
                                className={selectClasses}
                            >
                                <option value={ALL_VALUE}>All statuses</option>
                                <option value="scheduled">Scheduled</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="swap_requested">Swap requested</option>
                            </select>
                        </div>
                        <div className="w-full space-y-1.5 sm:w-48">
                            <label htmlFor="shift-date-filter" className="block text-sm font-medium text-foreground">
                                From date
                            </label>
                            <input
                                id="shift-date-filter"
                                type="date"
                                value={dateFrom}
                                onChange={(event) => setDateFrom(event.target.value)}
                                className={selectClasses}
                            />
                        </div>
                        {(branchId !== ALL_VALUE || status !== ALL_VALUE || dateFrom) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setBranchId(ALL_VALUE);
                                    setStatus(ALL_VALUE);
                                    setDateFrom('');
                                }}
                                className="inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>

                    <ShiftsTable
                        shifts={shifts}
                        isLoading={shiftQuery.isLoading}
                        onEdit={(shift) => setEditingShift(shift)}
                        onAssign={(shift) => setAssigningShift(shift)}
                        onDelete={handleDelete}
                    />
                </>
            )}

            <ShiftForm
                open={isFormOpen}
                onOpenChange={handleFormOpenChange}
                shift={editingShift ?? undefined}
                rosters={rosterOptions}
                positions={positionOptions}
                employees={employees}
                existingShifts={shifts}
                isSaving={createShift.isPending || updateShift.isPending}
                onSubmit={handleSave}
            />
            <AssignEmployeeModal
                open={assigningShift !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setAssigningShift(null);
                    }
                }}
                shift={assigningShift}
                employees={employees}
                existingShifts={shifts}
                isAssigning={assignEmployee.isPending}
                onAssign={handleAssign}
            />
        </div>
    );
}
