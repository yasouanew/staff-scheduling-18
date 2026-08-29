import * as Dialog from '@radix-ui/react-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { Shift, ShiftInput } from '@/types/roster';

import {
    detectConflict,
    ROSTER_DEPARTMENTS,
    ROSTER_EMPLOYEES,
    useCreateShift,
    useDeleteShift,
    useUpdateShift,
} from '../hooks/useRoster';

interface QuickShiftModalProps {
    /** Controls modal visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
    /** When provided, the modal edits this shift; otherwise creates a new one. */
    editShift?: Shift;
}

/**
 * Validation schema enforcing date boundary + time ordering plus break-minute
 * bounds. `breakMinutes` is registered with `valueAsNumber` so it arrives as a
 * number; NaN (empty field) is caught by the `int()` check.
 */
const shiftSchema = z
    .object({
        employeeId: z.string().min(1, 'Please select an employee.'),
        departmentId: z.string().min(1, 'Please select a department.'),
        startTime: z.string().min(1, 'Start time is required.'),
        endTime: z.string().min(1, 'End time is required.'),
        breakMinutes: z
            .number()
            .int('Break must be a whole number.')
            .min(0, 'Break must be 0 or more minutes.')
            .max(480, 'Break cannot exceed 8 hours.'),
        role: z.string().min(1, 'Please provide a role label.'),
    })
    .refine((data) => data.endTime > data.startTime, {
        message: 'End time must be after start time.',
        path: ['endTime'],
    });

type ShiftFormValues = z.infer<typeof shiftSchema>;

/** Shared field styling. */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/**
 * Quick shift creation/edit modal. Integrates conflict detection: when the form
 * values change, evaluates them against approved leave windows and displays a
 * danger-themed warning if the employee is unavailable during the shift window.
 */
export function QuickShiftModal({
    open,
    onOpenChange,
    editShift,
}: QuickShiftModalProps): JSX.Element {
    const createShift = useCreateShift();
    const updateShift = useUpdateShift();
    const deleteShift = useDeleteShift();

    const isEditMode = Boolean(editShift);

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<ShiftFormValues>({
        resolver: zodResolver(shiftSchema),
        defaultValues: {
            employeeId: '',
            departmentId: '',
            startTime: '',
            endTime: '',
            breakMinutes: 30,
            role: '',
        },
    });

    // Populate form when editing an existing shift.
    useEffect(() => {
        if (open && editShift) {
            reset({
                employeeId: editShift.employeeId,
                departmentId: editShift.departmentId,
                startTime: editShift.startTime,
                endTime: editShift.endTime,
                breakMinutes: editShift.breakMinutes,
                role: editShift.role,
            });
        } else if (open && !editShift) {
            reset({
                employeeId: '',
                departmentId: '',
                startTime: '',
                endTime: '',
                breakMinutes: 30,
                role: '',
            });
        }
    }, [open, editShift, reset]);

    // Watch form values for live conflict detection.
    const watchedValues = watch();
    const conflict =
        watchedValues.employeeId && watchedValues.startTime && watchedValues.endTime
            ? detectConflict(watchedValues.employeeId, watchedValues.startTime, watchedValues.endTime)
            : { hasConflict: false };

    const submit = handleSubmit(async (values) => {
        const payload: ShiftInput = {
            employeeId: values.employeeId,
            departmentId: values.departmentId,
            startTime: values.startTime,
            endTime: values.endTime,
            breakMinutes: values.breakMinutes,
            role: values.role,
        };

        try {
            if (isEditMode && editShift) {
                await updateShift.mutateAsync({ id: editShift.id, input: payload });
                toast.success('Shift updated', {
                    description: 'The roster has been updated successfully.',
                });
            } else {
                await createShift.mutateAsync(payload);
                toast.success('Shift created', {
                    description: 'The new shift has been added to the roster.',
                });
            }
            onOpenChange(false);
        } catch {
            toast.error('Unable to save shift', {
                description: 'Something went wrong. Please try again.',
            });
        }
    });

    const handleDelete = async (): Promise<void> => {
        if (!editShift) return;

        try {
            await deleteShift.mutateAsync(editShift.id);
            toast.success('Shift deleted', {
                description: 'The shift has been removed from the roster.',
            });
            onOpenChange(false);
        } catch {
            toast.error('Unable to delete shift', {
                description: 'Something went wrong. Please try again.',
            });
        }
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content
                    className={cn(
                        'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl focus:outline-none',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out',
                        'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
                    )}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-border p-6">
                        <div className="space-y-1">
                            <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                                {isEditMode ? 'Edit shift' : 'Create shift'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                {isEditMode
                                    ? 'Update the shift details below.'
                                    : 'Schedule a new shift for an employee.'}
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    {/* Body */}
                    <form onSubmit={submit} noValidate className="flex flex-1 flex-col overflow-y-auto">
                        <div className="flex-1 space-y-5 p-6">
                            {/* Conflict warning banner */}
                            {conflict.hasConflict && conflict.window && (
                                <div className="flex gap-3 rounded-lg border border-danger bg-danger/10 p-3 text-danger">
                                    <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                                    <div className="min-w-0 space-y-1">
                                        <p className="text-sm font-semibold">Scheduling conflict</p>
                                        <p className="text-sm">
                                            This employee is unavailable: {conflict.window.reason}.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Employee */}
                            <div className="space-y-1.5">
                                <label htmlFor="employeeId" className="block text-sm font-medium text-foreground">
                                    Employee
                                </label>
                                <select
                                    id="employeeId"
                                    aria-invalid={Boolean(errors.employeeId)}
                                    className={fieldClasses}
                                    {...register('employeeId')}
                                >
                                    <option value="">Select employee...</option>
                                    {ROSTER_EMPLOYEES.map((employee) => (
                                        <option key={employee.id} value={employee.id}>
                                            {employee.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.employeeId && (
                                    <p className="text-sm text-danger">{errors.employeeId.message}</p>
                                )}
                            </div>

                            {/* Department */}
                            <div className="space-y-1.5">
                                <label htmlFor="departmentId" className="block text-sm font-medium text-foreground">
                                    Department
                                </label>
                                <select
                                    id="departmentId"
                                    aria-invalid={Boolean(errors.departmentId)}
                                    className={fieldClasses}
                                    {...register('departmentId')}
                                >
                                    <option value="">Select department...</option>
                                    {ROSTER_DEPARTMENTS.map((department) => (
                                        <option key={department.id} value={department.id}>
                                            {department.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.departmentId && (
                                    <p className="text-sm text-danger">{errors.departmentId.message}</p>
                                )}
                            </div>

                            {/* Role */}
                            <div className="space-y-1.5">
                                <label htmlFor="role" className="block text-sm font-medium text-foreground">
                                    Role
                                </label>
                                <input
                                    id="role"
                                    type="text"
                                    placeholder="e.g. Barista, Line Cook"
                                    aria-invalid={Boolean(errors.role)}
                                    className={fieldClasses}
                                    {...register('role')}
                                />
                                {errors.role && (
                                    <p className="text-sm text-danger">{errors.role.message}</p>
                                )}
                            </div>

                            {/* Start Time */}
                            <div className="space-y-1.5">
                                <label htmlFor="startTime" className="block text-sm font-medium text-foreground">
                                    Start time
                                </label>
                                <input
                                    id="startTime"
                                    type="datetime-local"
                                    aria-invalid={Boolean(errors.startTime)}
                                    className={fieldClasses}
                                    {...register('startTime')}
                                />
                                {errors.startTime && (
                                    <p className="text-sm text-danger">{errors.startTime.message}</p>
                                )}
                            </div>

                            {/* End Time */}
                            <div className="space-y-1.5">
                                <label htmlFor="endTime" className="block text-sm font-medium text-foreground">
                                    End time
                                </label>
                                <input
                                    id="endTime"
                                    type="datetime-local"
                                    aria-invalid={Boolean(errors.endTime)}
                                    className={fieldClasses}
                                    {...register('endTime')}
                                />
                                {errors.endTime && (
                                    <p className="text-sm text-danger">{errors.endTime.message}</p>
                                )}
                            </div>

                            {/* Break Minutes */}
                            <div className="space-y-1.5">
                                <label htmlFor="breakMinutes" className="block text-sm font-medium text-foreground">
                                    Break duration (minutes)
                                </label>
                                <input
                                    id="breakMinutes"
                                    type="number"
                                    min="0"
                                    step="15"
                                    aria-invalid={Boolean(errors.breakMinutes)}
                                    className={fieldClasses}
                                    {...register('breakMinutes', { valueAsNumber: true })}
                                />
                                {errors.breakMinutes && (
                                    <p className="text-sm text-danger">{errors.breakMinutes.message}</p>
                                )}
                            </div>
                        </div>

                        {/* Footer actions */}
                        <div className="flex items-center justify-between gap-3 border-t border-border p-6">
                            {isEditMode && editShift ? (
                                <button
                                    type="button"
                                    onClick={() => void handleDelete()}
                                    disabled={deleteShift.isPending}
                                    className={cn(
                                        'inline-flex h-11 items-center justify-center rounded-lg border border-danger bg-danger/10 px-4 text-sm font-medium text-danger transition-colors',
                                        'hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        'disabled:pointer-events-none disabled:opacity-50',
                                    )}
                                >
                                    Delete
                                </button>
                            ) : (
                                <div />
                            )}

                            <div className="flex items-center gap-3">
                                <Dialog.Close asChild>
                                    <button
                                        type="button"
                                        className={cn(
                                            'inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                                            'hover:bg-secondary hover:text-secondary-foreground',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        )}
                                    >
                                        Cancel
                                    </button>
                                </Dialog.Close>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={cn(
                                        'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                                        'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                        'disabled:cursor-not-allowed disabled:opacity-70',
                                    )}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <LoadingSpinner className="text-primary-foreground" label="Saving" />
                                            Saving...
                                        </>
                                    ) : isEditMode ? (
                                        'Update shift'
                                    ) : (
                                        'Create shift'
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
