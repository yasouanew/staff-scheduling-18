import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Clock3, UserCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types/employee';
import type { Shift } from '@/types/shift';

import { findEmployeeConflicts, formatShiftDate, formatShiftTimeRange } from '../lib/shift-utils';

interface AssignEmployeeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    shift: Shift | null;
    employees: Employee[];
    existingShifts: Shift[];
    isAssigning?: boolean;
    onAssign: (employeeId: string) => Promise<void>;
}

const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
);

/** Employee assignment dialog for an existing shift. */
export function AssignEmployeeModal({
    open,
    onOpenChange,
    shift,
    employees,
    existingShifts,
    isAssigning = false,
    onAssign,
}: AssignEmployeeModalProps): JSX.Element | null {
    const [employeeId, setEmployeeId] = useState('');

    useEffect(() => {
        if (open) {
            setEmployeeId(shift?.employeeId ?? '');
        }
    }, [open, shift?.employeeId]);

    const availableEmployees = useMemo(
        () =>
            employees.filter(
                (employee) =>
                    employee.status === 'active' &&
                    (!shift?.branchId || employee.branchId === null || employee.branchId === shift.branchId),
            ),
        [employees, shift?.branchId],
    );
    const conflicts = useMemo(
        () =>
            shift
                ? findEmployeeConflicts({
                      shifts: existingShifts,
                      employeeId: employeeId || null,
                      date: shift.date,
                      startTime: shift.startTime,
                      endTime: shift.endTime,
                      excludedShiftId: shift.id,
                  })
                : [],
        [employeeId, existingShifts, shift],
    );

    if (!shift) {
        return null;
    }

    const selectedEmployee = availableEmployees.find((employee) => employee.id === employeeId);

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <Dialog.Title className="text-lg font-semibold text-foreground">
                                {shift.employeeId ? 'Reassign employee' : 'Assign employee'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                {formatShiftDate(shift.date)} · {formatShiftTimeRange(shift.startTime, shift.endTime)}
                                {shift.position?.name ? ` · ${shift.position.name}` : ''}
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            aria-label="Close employee assignment"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    <div className="mt-5 space-y-4">
                        <div className="rounded-lg border border-info/20 bg-info/10 p-3 text-sm text-info">
                            <div className="flex gap-2">
                                <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <p>
                                    Assignment respects the shift’s stored roster date and local branch time.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="assign-employee" className="block text-sm font-medium text-foreground">
                                Employee <span aria-hidden="true">*</span>
                            </label>
                            <select
                                id="assign-employee"
                                value={employeeId}
                                onChange={(event) => setEmployeeId(event.target.value)}
                                className={fieldClasses}
                                aria-describedby="assign-employee-help"
                            >
                                <option value="">Select an available employee…</option>
                                {availableEmployees.map((employee) => (
                                    <option key={employee.id} value={employee.id}>
                                        {employee.name} · {employee.position}
                                    </option>
                                ))}
                            </select>
                            <p id="assign-employee-help" className="text-xs text-muted-foreground">
                                Active employees from this branch are shown first.
                            </p>
                        </div>

                        {availableEmployees.length === 0 ? (
                            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                                No active employees are available for this branch. Add or reactivate an employee, then
                                return to assign this shift.
                            </div>
                        ) : null}

                        {conflicts.length > 0 ? (
                            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-warning" role="alert">
                                <div className="flex gap-3">
                                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold">Employee is double-booked</p>
                                        <p className="text-sm">
                                            Review the overlap below before assigning this employee.
                                        </p>
                                        <ul className="list-disc space-y-0.5 pl-5 text-sm">
                                            {conflicts.map((conflict) => (
                                                <li key={conflict.shift.id}>{conflict.message}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {selectedEmployee ? (
                            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/10 text-success">
                                    <UserCheck className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">{selectedEmployee.name}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {selectedEmployee.position} · {selectedEmployee.branchName ?? 'All branches'}
                                    </p>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                disabled={isAssigning}
                                className="inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Cancel
                            </button>
                        </Dialog.Close>
                        <button
                            type="button"
                            disabled={!employeeId || isAssigning}
                            onClick={() => void onAssign(employeeId)}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isAssigning ? <LoadingSpinner className="text-primary-foreground" label="Assigning employee" /> : null}
                            {isAssigning ? 'Assigning…' : conflicts.length > 0 ? 'Assign anyway' : 'Assign employee'}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
