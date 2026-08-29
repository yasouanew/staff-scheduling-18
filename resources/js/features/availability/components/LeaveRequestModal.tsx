import * as Dialog from '@radix-ui/react-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import { LEAVE_TYPES, type CreateLeaveRequestInput, type LeaveType } from '@/types/availability';

import { AVAILABILITY_EMPLOYEES, useCreateLeaveRequest } from '../hooks/useAvailability';

interface LeaveRequestModalProps {
    /** Controls drawer visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
}

/**
 * Validation schema with strict date-range boundary check enforced via Zod
 * `refine`. Prevents submitting leave requests where end < start.
 */
const leaveRequestSchema = z
    .object({
        employeeId: z.string().min(1, 'Please select an employee.'),
        leaveType: z.enum(LEAVE_TYPES as unknown as [LeaveType, ...LeaveType[]], {
            message: 'Please select a leave type.',
        }),
        startDate: z.string().min(1, 'Start date is required.'),
        endDate: z.string().min(1, 'End date is required.'),
        reason: z.string().optional(),
    })
    .refine((data) => data.endDate >= data.startDate, {
        message: 'End date must not be earlier than start date.',
        path: ['endDate'],
    });

type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;

/** Shared field styling. */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/**
 * Admin-initiated leave request creation form. Validates inline with Zod,
 * enforces date boundary rules, and fires a success toast on completion.
 * Composes the reusable `useCreateLeaveRequest` mutation.
 */
export function LeaveRequestModal({ open, onOpenChange }: LeaveRequestModalProps): JSX.Element {
    const createLeaveRequest = useCreateLeaveRequest();

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<LeaveRequestFormValues>({
        resolver: zodResolver(leaveRequestSchema),
        defaultValues: {
            employeeId: '',
            leaveType: 'Annual Leave',
            startDate: '',
            endDate: '',
            reason: '',
        },
    });

    // Reset form whenever the drawer is freshly opened.
    useEffect(() => {
        if (open) reset();
    }, [open, reset]);

    const submit = handleSubmit(async (values) => {
        const payload: CreateLeaveRequestInput = {
            employeeId: values.employeeId,
            leaveType: values.leaveType,
            startDate: values.startDate,
            endDate: values.endDate,
            reason: values.reason || undefined,
        };

        try {
            await createLeaveRequest.mutateAsync(payload);
            toast.success('Leave request created', {
                description: 'The request has been submitted and is pending approval.',
            });
            onOpenChange(false);
        } catch {
            toast.error('Unable to create leave request', {
                description: 'Something went wrong. Please try again.',
            });
        }
    });

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
                                Book leave request
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                Submit a new leave request for an employee.
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
                                    {AVAILABILITY_EMPLOYEES.map((employee) => (
                                        <option key={employee.id} value={employee.id}>
                                            {employee.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.employeeId && (
                                    <p className="text-sm text-danger">{errors.employeeId.message}</p>
                                )}
                            </div>

                            {/* Leave Type */}
                            <div className="space-y-1.5">
                                <label htmlFor="leaveType" className="block text-sm font-medium text-foreground">
                                    Leave type
                                </label>
                                <select
                                    id="leaveType"
                                    aria-invalid={Boolean(errors.leaveType)}
                                    className={fieldClasses}
                                    {...register('leaveType')}
                                >
                                    {LEAVE_TYPES.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                                {errors.leaveType && (
                                    <p className="text-sm text-danger">{errors.leaveType.message}</p>
                                )}
                            </div>

                            {/* Start Date */}
                            <div className="space-y-1.5">
                                <label htmlFor="startDate" className="block text-sm font-medium text-foreground">
                                    Start date
                                </label>
                                <input
                                    id="startDate"
                                    type="date"
                                    aria-invalid={Boolean(errors.startDate)}
                                    className={fieldClasses}
                                    {...register('startDate')}
                                />
                                {errors.startDate && (
                                    <p className="text-sm text-danger">{errors.startDate.message}</p>
                                )}
                            </div>

                            {/* End Date */}
                            <div className="space-y-1.5">
                                <label htmlFor="endDate" className="block text-sm font-medium text-foreground">
                                    End date
                                </label>
                                <input
                                    id="endDate"
                                    type="date"
                                    aria-invalid={Boolean(errors.endDate)}
                                    className={fieldClasses}
                                    {...register('endDate')}
                                />
                                {errors.endDate && (
                                    <p className="text-sm text-danger">{errors.endDate.message}</p>
                                )}
                            </div>

                            {/* Reason */}
                            <div className="space-y-1.5">
                                <label htmlFor="reason" className="block text-sm font-medium text-foreground">
                                    Reason <span className="text-muted-foreground">(optional)</span>
                                </label>
                                <textarea
                                    id="reason"
                                    rows={3}
                                    placeholder="e.g. Family holiday..."
                                    aria-invalid={Boolean(errors.reason)}
                                    className={cn(
                                        fieldClasses,
                                        'min-h-20 resize-none py-2',
                                    )}
                                    {...register('reason')}
                                />
                                {errors.reason && (
                                    <p className="text-sm text-danger">{errors.reason.message}</p>
                                )}
                            </div>
                        </div>

                        {/* Footer actions */}
                        <div className="flex items-center justify-end gap-3 border-t border-border p-6">
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
                                        <LoadingSpinner className="text-primary-foreground" label="Submitting" />
                                        Submitting...
                                    </>
                                ) : (
                                    'Submit request'
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
