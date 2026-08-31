import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { CopyPlus, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { schedulingErrorMessage } from '@/lib/scheduling-errors';
import { cn } from '@/lib/utils';
import type { Roster } from '@/types/roster-management';

import { useCopyPreviousWeek } from '../hooks/useRosters';
import { formatWeekRange, nextWeekStart, weekEndFor } from '../lib/roster-week';
import { copyWeekSchema, type CopyWeekInput, type CopyWeekValues } from '../schemas';
import type { RosterBranchOption } from './RosterFormModal';

interface CopyPreviousWeekModalProps {
    /** Controls dialog visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
    /** Branches available as the new roster's scope. */
    branches: RosterBranchOption[];
    /** Existing rosters offered as the copy source. */
    sourceRosters: Roster[];
    /** Optional callback fired with the created roster on success. */
    onCopied?: (roster: Roster) => void;
}

/** Shared field styling (mirrors the app's form controls). */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Defaults target next week and lets the API pick the most recent source. */
const EMPTY_DEFAULTS: CopyWeekInput = {
    weekStart: nextWeekStart(),
    branchId: '',
    sourceRosterId: '',
};

/**
 * Dialog for cloning a previous week's shifts into a brand-new roster.
 *
 * Presentation + form state only: the actual copy is delegated to the reusable
 * `useCopyPreviousWeek` mutation, and success/failure is always surfaced through
 * a toast so the user is never left without feedback.
 */
export function CopyPreviousWeekModal({
    open,
    onOpenChange,
    branches,
    sourceRosters,
    onCopied,
}: CopyPreviousWeekModalProps): JSX.Element {
    const copyWeek = useCopyPreviousWeek();

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<CopyWeekInput, unknown, CopyWeekValues>({
        resolver: zodResolver(copyWeekSchema),
        defaultValues: EMPTY_DEFAULTS,
    });

    const weekStart = watch('weekStart');

    // Reset to a fresh "next week" target each time the dialog opens.
    useEffect(() => {
        if (open) {
            reset({ ...EMPTY_DEFAULTS, weekStart: nextWeekStart() });
        }
    }, [open, reset]);

    const submit = handleSubmit(async (values) => {
        try {
            const created = await copyWeek.mutateAsync(values);

            toast.success('Week copied', {
                description: `${created.shiftsCount ?? 0} shift(s) copied into ${formatWeekRange(
                    created.weekStart,
                    created.weekEnd,
                )}.`,
            });
            onCopied?.(created);
            onOpenChange(false);
        } catch (error) {
            toast.error('Unable to copy week', {
                description: schedulingErrorMessage(
                    error,
                    'Check that a previous roster exists for this branch and try again.',
                ),
            });
        }
    });

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content
                    className={cn(
                        'fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-xl focus:outline-none',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out',
                        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                    )}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-border p-6">
                        <div className="flex items-start gap-3">
                            <span
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info"
                                aria-hidden="true"
                            >
                                <CopyPlus className="h-5 w-5" />
                            </span>
                            <div className="space-y-1">
                                <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                                    Copy a previous week
                                </Dialog.Title>
                                <Dialog.Description className="text-sm text-muted-foreground">
                                    Duplicates every shift from an existing roster into a new draft
                                    week.
                                </Dialog.Description>
                            </div>
                        </div>
                        <Dialog.Close
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    {/* Body */}
                    <form onSubmit={submit} noValidate className="flex flex-col">
                        <div className="space-y-5 p-6">
                            {/* Target week */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="copyWeekStart"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    New week start <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="copyWeekStart"
                                    type="date"
                                    aria-invalid={Boolean(errors.weekStart)}
                                    className={fieldClasses}
                                    {...register('weekStart')}
                                />
                                {errors.weekStart ? (
                                    <p className="text-sm text-danger">{errors.weekStart.message}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Creates{' '}
                                        {formatWeekRange(
                                            weekStart || null,
                                            weekStart ? weekEndFor(weekStart) : null,
                                        )}
                                        .
                                    </p>
                                )}
                            </div>

                            {/* Branch scope */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="copyBranchId"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Branch
                                </label>
                                <select
                                    id="copyBranchId"
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

                            {/* Source roster */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="sourceRosterId"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Copy from
                                </label>
                                <select
                                    id="sourceRosterId"
                                    aria-invalid={Boolean(errors.sourceRosterId)}
                                    className={fieldClasses}
                                    {...register('sourceRosterId')}
                                >
                                    <option value="">Most recent week</option>
                                    {sourceRosters.map((source) => (
                                        <option key={source.id} value={source.id}>
                                            {formatWeekRange(source.weekStart, source.weekEnd)}
                                            {source.branchName ? ` · ${source.branchName}` : ''}
                                        </option>
                                    ))}
                                </select>
                                {errors.sourceRosterId ? (
                                    <p className="text-sm text-danger">
                                        {errors.sourceRosterId.message}
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Copied shifts arrive unpublished so you can adjust them
                                        first.
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
                                            label="Copying"
                                        />
                                        Copying…
                                    </>
                                ) : (
                                    'Copy week'
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
