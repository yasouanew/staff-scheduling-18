import * as Dialog from '@radix-ui/react-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Clock3, RotateCcw, X } from 'lucide-react';
import { format } from 'date-fns';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import { SHIFT_STATUS_LABELS, type Shift, type ShiftMutationInput, type ShiftPositionOption, type ShiftRosterOption } from '@/types/shift';
import type { Employee } from '@/types/employee';

import { findEmployeeConflicts, formatShiftTimeRange } from '../lib/shift-utils';
import { shiftFormSchema, type ShiftFormValues } from '../schemas';

interface ShiftFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    shift?: Shift;
    rosters: ShiftRosterOption[];
    positions: ShiftPositionOption[];
    employees: Employee[];
    existingShifts: Shift[];
    isSaving?: boolean;
    onSubmit: (values: ShiftMutationInput) => Promise<void>;
}

const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Default form state for a new shift. */
function createDefaultValues(): ShiftFormValues {
    return {
        rosterId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '09:00',
        endTime: '17:00',
        positionId: null,
        employeeId: null,
        requiredStaff: 1,
        notes: null,
        status: 'scheduled',
    };
}

/** Maps a persisted shift into the editor's form-shaped state. */
function toFormValues(shift: Shift): ShiftFormValues {
    return {
        rosterId: shift.rosterId,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        positionId: shift.positionId,
        employeeId: shift.employeeId,
        requiredStaff: shift.requiredStaff,
        notes: shift.notes,
        status: shift.status,
    };
}

/** Accessible helper text for the selected roster's local time convention. */
function TimezoneHint({ timezone }: { timezone: string | null | undefined }): JSX.Element {
    return (
        <p className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/10 p-3 text-sm text-info">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
                {timezone
                    ? `Shift date and times are saved in the roster branch timezone: ${timezone}.`
                    : 'Shift date and times are saved as the roster branch’s local wall time.'}
            </span>
        </p>
    );
}

/**
 * Stateful but transport-free shift editor. It receives all options, conflicts,
 * and persistence callbacks from its owning page so UI code never calls the API.
 */
export function ShiftForm({
    open,
    onOpenChange,
    shift,
    rosters,
    positions,
    employees,
    existingShifts,
    isSaving = false,
    onSubmit,
}: ShiftFormProps): JSX.Element {
    const isEditMode = Boolean(shift);
    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors },
    } = useForm<ShiftFormValues>({
        resolver: zodResolver(shiftFormSchema),
        defaultValues: createDefaultValues(),
    });

    const values = watch();
    const selectedRoster = useMemo(
        () => rosters.find((roster) => roster.id === values.rosterId),
        [rosters, values.rosterId],
    );
    const conflicts = useMemo(
        () =>
            findEmployeeConflicts({
                shifts: existingShifts,
                employeeId: values.employeeId,
                date: values.date,
                startTime: values.startTime,
                endTime: values.endTime,
                excludedShiftId: shift?.id,
            }),
        [existingShifts, shift?.id, values.date, values.employeeId, values.endTime, values.startTime],
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        reset(shift ? toFormValues(shift) : createDefaultValues());
    }, [open, reset, shift]);

    const submit = handleSubmit(async (formValues) => {
        await onSubmit({
            ...formValues,
            notes: formValues.notes?.trim() || null,
        });
    });

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-card shadow-xl focus:outline-none">
                    <div className="flex items-start justify-between border-b border-border p-6">
                        <div className="space-y-1">
                            <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                                {isEditMode ? 'Edit shift' : 'Create shift'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                Plan the coverage required, then assign an employee now or later.
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            aria-label="Close shift form"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                            <div className="space-y-1.5">
                                <label htmlFor="shift-roster" className="block text-sm font-medium text-foreground">
                                    Roster <span aria-hidden="true">*</span>
                                </label>
                                <select
                                    id="shift-roster"
                                    aria-invalid={Boolean(errors.rosterId)}
                                    className={fieldClasses}
                                    {...register('rosterId')}
                                >
                                    <option value="">Select a roster…</option>
                                    {rosters.map((roster) => (
                                        <option key={roster.id} value={roster.id}>
                                            {roster.label}
                                        </option>
                                    ))}
                                </select>
                                {errors.rosterId ? <p className="text-sm text-danger">{errors.rosterId.message}</p> : null}
                            </div>

                            <TimezoneHint timezone={selectedRoster?.timezone} />

                            {conflicts.length > 0 ? (
                                <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-warning" role="alert">
                                    <div className="flex gap-3">
                                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold">Potential scheduling conflict</p>
                                            <p className="text-sm">
                                                This employee is already rostered for the selected time.
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

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="shift-date" className="block text-sm font-medium text-foreground">
                                        Date <span aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="shift-date"
                                        type="date"
                                        aria-invalid={Boolean(errors.date)}
                                        className={fieldClasses}
                                        {...register('date')}
                                    />
                                    {errors.date ? <p className="text-sm text-danger">{errors.date.message}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="shift-required-staff" className="block text-sm font-medium text-foreground">
                                        Staff required <span aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="shift-required-staff"
                                        type="number"
                                        min="1"
                                        max="99"
                                        aria-invalid={Boolean(errors.requiredStaff)}
                                        className={fieldClasses}
                                        {...register('requiredStaff', { valueAsNumber: true })}
                                    />
                                    {errors.requiredStaff ? <p className="text-sm text-danger">{errors.requiredStaff.message}</p> : null}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="shift-start-time" className="block text-sm font-medium text-foreground">
                                        Start time <span aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="shift-start-time"
                                        type="time"
                                        aria-invalid={Boolean(errors.startTime)}
                                        className={fieldClasses}
                                        {...register('startTime')}
                                    />
                                    {errors.startTime ? <p className="text-sm text-danger">{errors.startTime.message}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="shift-end-time" className="block text-sm font-medium text-foreground">
                                        End time <span aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="shift-end-time"
                                        type="time"
                                        aria-invalid={Boolean(errors.endTime)}
                                        className={fieldClasses}
                                        {...register('endTime')}
                                    />
                                    {errors.endTime ? <p className="text-sm text-danger">{errors.endTime.message}</p> : null}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="shift-position" className="block text-sm font-medium text-foreground">
                                        Position
                                    </label>
                                    <select
                                        id="shift-position"
                                        aria-invalid={Boolean(errors.positionId)}
                                        className={fieldClasses}
                                        {...register('positionId', {
                                            setValueAs: (value: string) => value || null,
                                        })}
                                    >
                                        <option value="">No position selected</option>
                                        {positions.map((position) => (
                                            <option key={position.id} value={position.id}>
                                                {position.name}
                                                {position.departmentName ? ` · ${position.departmentName}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.positionId ? <p className="text-sm text-danger">{errors.positionId.message}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="shift-employee" className="block text-sm font-medium text-foreground">
                                        Assigned employee
                                    </label>
                                    <select
                                        id="shift-employee"
                                        aria-invalid={Boolean(errors.employeeId)}
                                        className={fieldClasses}
                                        {...register('employeeId', {
                                            setValueAs: (value: string) => value || null,
                                        })}
                                    >
                                        <option value="">Leave unassigned</option>
                                        {employees.map((employee) => (
                                            <option key={employee.id} value={employee.id}>
                                                {employee.name} · {employee.position}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.employeeId ? <p className="text-sm text-danger">{errors.employeeId.message}</p> : null}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="shift-status" className="block text-sm font-medium text-foreground">
                                    Status
                                </label>
                                <select id="shift-status" className={fieldClasses} {...register('status')}>
                                    {Object.entries(SHIFT_STATUS_LABELS).map(([status, label]) => (
                                        <option key={status} value={status}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="shift-notes" className="block text-sm font-medium text-foreground">
                                    Notes
                                </label>
                                <textarea
                                    id="shift-notes"
                                    rows={4}
                                    placeholder="Add operating instructions, skills needed or handover notes…"
                                    aria-invalid={Boolean(errors.notes)}
                                    className={cn(fieldClasses, 'h-auto resize-y py-3')}
                                    {...register('notes', {
                                        setValueAs: (value: string) => value || null,
                                    })}
                                />
                                {errors.notes ? <p className="text-sm text-danger">{errors.notes.message}</p> : null}
                            </div>
                        </div>

                        <div className="flex flex-col-reverse gap-3 border-t border-border p-6 sm:flex-row sm:items-center sm:justify-between">
                            <button
                                type="button"
                                onClick={() => reset(shift ? toFormValues(shift) : createDefaultValues())}
                                disabled={isSaving}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                Reset
                            </button>
                            <div className="flex flex-col-reverse gap-3 sm:flex-row">
                                <Dialog.Close asChild>
                                    <button
                                        type="button"
                                        disabled={isSaving}
                                        className="inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Cancel
                                    </button>
                                </Dialog.Close>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSaving ? <LoadingSpinner className="text-primary-foreground" label="Saving shift" /> : null}
                                    {isSaving ? 'Saving…' : isEditMode ? 'Save changes' : 'Create shift'}
                                </button>
                            </div>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
