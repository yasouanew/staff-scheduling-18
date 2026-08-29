import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ROSTER_STATUS_LABELS, ROSTER_STATUSES, type Roster } from '@/types/roster-management';

import { useCreateRoster, useUpdateRoster } from '../hooks/useRosters';
import { currentWeekStart, formatWeekRange, weekEndFor } from '../lib/roster-week';
import {
    rosterDefaults,
    rosterFormSchema,
    type RosterFormInput,
    type RosterFormValues,
} from '../schemas';

/** Branch option rendered in the scope select. */
export interface RosterBranchOption {
    id: string;
    name: string;
}

interface RosterFormModalProps {
    /** Controls drawer visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
    /** When provided the drawer edits this roster; otherwise it creates one. */
    roster?: Roster | null;
    /** Branches available as the roster scope. */
    branches: RosterBranchOption[];
    /** Optional callback fired with the saved roster on success. */
    onSaved?: (roster: Roster) => void;
}

/** Shared field styling (mirrors the app's form controls). */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Builds RHF default values from an existing roster (edit mode). */
function toDefaults(roster: Roster | null | undefined): RosterFormInput {
    if (!roster) {
        return rosterDefaults(currentWeekStart());
    }

    const weekStart = roster.weekStart ?? currentWeekStart();

    return {
        weekStart,
        weekEnd: roster.weekEnd ?? weekEndFor(weekStart),
        branchId: roster.branchId === null ? '' : String(roster.branchId),
        status: roster.status,
    };
}

/**
 * Slide-over drawer housing the create/edit roster form.
 *
 * Owns only form state; persistence flows through the reusable
 * `useCreateRoster` / `useUpdateRoster` mutations. Validation comes from the
 * shared Zod schema so the required week start, the "end after start" rule and
 * the allowed statuses stay aligned with the backend contract. Changing the week
 * start automatically advances the derived week end, which the user can still
 * override for non-standard periods.
 */
export function RosterFormModal({
    open,
    onOpenChange,
    roster,
    branches,
    onSaved,
}: RosterFormModalProps): JSX.Element {
    const isEdit = Boolean(roster);
    const createRoster = useCreateRoster();
    const updateRoster = useUpdateRoster();

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<RosterFormInput, unknown, RosterFormValues>({
        resolver: zodResolver(rosterFormSchema),
        defaultValues: rosterDefaults(currentWeekStart()),
    });

    const weekStart = watch('weekStart');
    const weekEnd = watch('weekEnd');

    // Re-seed the form whenever the drawer opens or the target roster changes.
    useEffect(() => {
        if (open) {
            reset(toDefaults(roster));
        }
    }, [open, roster, reset]);

    const submit = handleSubmit(async (values) => {
        try {
            const saved = isEdit
                ? await updateRoster.mutateAsync({ id: roster!.id, values })
                : await createRoster.mutateAsync(values);

            toast.success(isEdit ? 'Roster updated' : 'Roster created', {
                description: `${formatWeekRange(saved.weekStart, saved.weekEnd)} has been ${isEdit ? 'updated' : 'created'
                    } successfully.`,
            });
            onSaved?.(saved);
            onOpenChange(false);
        } catch (error) {
            toast.error(isEdit ? 'Unable to update roster' : 'Unable to create roster', {
                description: getApiErrorMessage(error, 'Please review the form and try again.'),
            });
        }
    });

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content
                    className={cn(
                        'fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-xl focus:outline-none',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out',
                        'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
                    )}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-border p-6">
                        <div className="space-y-1">
                            <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                                {isEdit ? 'Edit roster week' : 'Create roster week'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                {isEdit
                                    ? 'Adjust the dates, branch scope or status of this roster.'
                                    : 'Start a new weekly roster, then add shifts to it.'}
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
                            {/* Week start (required) */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="weekStart"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Week start <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="weekStart"
                                    type="date"
                                    aria-invalid={Boolean(errors.weekStart)}
                                    className={fieldClasses}
                                    {...register('weekStart', {
                                        // Keep the derived end date in step with the start date.
                                        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                                            const value = event.target.value;
                                            if (value) {
                                                setValue('weekEnd', weekEndFor(value), {
                                                    shouldValidate: true,
                                                });
                                            }
                                        },
                                    })}
                                />
                                {errors.weekStart && (
                                    <p className="text-sm text-danger">{errors.weekStart.message}</p>
                                )}
                            </div>

                            {/* Week end (required, auto-derived) */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="weekEnd"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Week end <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="weekEnd"
                                    type="date"
                                    aria-invalid={Boolean(errors.weekEnd)}
                                    className={fieldClasses}
                                    {...register('weekEnd')}
                                />
                                {errors.weekEnd ? (
                                    <p className="text-sm text-danger">{errors.weekEnd.message}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Covers {formatWeekRange(weekStart || null, weekEnd || null)}.
                                    </p>
                                )}
                            </div>

                            {/* Branch scope */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="branchId"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Branch
                                </label>
                                <select
                                    id="branchId"
                                    aria-invalid={Boolean(errors.branchId)}
                                    className={fieldClasses}
                                    {...register('branchId')}
                                >
                                    <option value="">All branches</option>
                                    {branches.map((branch) => (
                                        <option key={branch.id} value={branch.id}>
                                            {branch.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.branchId && (
                                    <p className="text-sm text-danger">{errors.branchId.message}</p>
                                )}
                            </div>

                            {/* Status */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="status"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Status
                                </label>
                                <select
                                    id="status"
                                    aria-invalid={Boolean(errors.status)}
                                    className={fieldClasses}
                                    {...register('status')}
                                >
                                    {ROSTER_STATUSES.map((option) => (
                                        <option key={option} value={option}>
                                            {ROSTER_STATUS_LABELS[option]}
                                        </option>
                                    ))}
                                </select>
                                {errors.status ? (
                                    <p className="text-sm text-danger">{errors.status.message}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Drafts stay hidden from employees until published.
                                    </p>
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
                                        <LoadingSpinner
                                            className="text-primary-foreground"
                                            label="Saving"
                                        />
                                        Saving…
                                    </>
                                ) : isEdit ? (
                                    'Save changes'
                                ) : (
                                    'Create roster'
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
