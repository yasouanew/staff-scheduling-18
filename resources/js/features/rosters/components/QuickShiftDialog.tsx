import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, Clock, UserRound } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/Components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { Switch } from '@/Components/ui/switch';
import { cn } from '@/lib/utils';

import { usePositionOptions } from '@/features/positions/hooks/usePositions';
import { SHIFT_STATUS_LABELS } from '@/types/shift';

import {
    formatHours,
    formatShiftTimeRange,
    shiftPayableMinutes,
} from '../lib/roster-week';
import {
    DEFAULT_SHIFT_TEMPLATE,
    type ShiftTemplateValues,
} from '../lib/shift-payload';
import {
    quickShiftSchema,
    type QuickShiftInput,
    type QuickShiftValues,
} from '../quick-shift-schema';

/** What the dialog is operating on: a brand-new shift, or an existing one. */
export interface QuickShiftTarget {
    /** Shift id when editing; `null` when creating. */
    shiftId: string | null;
    /** ISO date (`yyyy-MM-dd`) of the cell. */
    date: string;
    /** Employee of the row, or `null` for the open-shifts row. */
    employeeId: string | null;
    /** Row label used in the dialog copy (employee name or `Open shifts`). */
    employeeLabel: string;
    /** Human-readable day label, e.g. `Monday 12 August`. */
    dateLabel: string;
    /** Seed values for the form. */
    values: ShiftTemplateValues;
}

interface QuickShiftDialogProps {
    /** Controls dialog visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
    /** The cell/shift being edited, or `null` while the dialog is closed. */
    target: QuickShiftTarget | null;
    /** True while the create/update mutation is in flight. */
    isSaving?: boolean;
    /** Persists the validated values. Resolves once the mutation settles. */
    onSubmit: (target: QuickShiftTarget, values: QuickShiftValues) => Promise<void>;
}

/**
 * Shared field styling (mirrors the app's form controls).
 *
 * Mobile compacts the controls (`h-9`, tighter padding) because this dialog is
 * the edit surface for a single cell and is routinely opened on a phone, where a
 * tall form pushes the save button off-screen.
 */
const fieldClasses = cn(
    'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
    'sm:h-11 sm:px-3',
);

/** Maps template values onto the string-based form inputs. */
function toFormValues(values: ShiftTemplateValues): QuickShiftInput {
    return {
        startTime: values.startTime,
        endTime: values.endTime,
        status: values.status,
        breakMinutes: String(values.breakMinutes),
        isPaidBreak: values.isPaidBreak,
        positionId: values.positionId ?? '',
        requiredStaff: String(values.requiredStaff),
        notes: values.notes ?? '',
    };
}

/**
 * Compact create/edit dialog for a single roster cell.
 *
 * This is the "quick edit" surface reached from a cell's `+` button or a shift
 * block's pencil icon: it exposes only the fields a manager changes while
 * building a week (times, break, role, headcount, notes) and keeps the
 * employee and date fixed to the cell that opened it — moving a shift is a
 * different gesture (drag, or copy/paste) and is deliberately not editable here.
 *
 * Purely a form: validation comes from the shared `quickShiftSchema` and
 * persistence is delegated to `onSubmit`, so the dialog holds no API logic.
 */
export function QuickShiftDialog({
    open,
    onOpenChange,
    target,
    isSaving = false,
    onSubmit,
}: QuickShiftDialogProps): JSX.Element {
    const isEdit = Boolean(target?.shiftId);
    // Real, company-scoped roles; never a hardcoded list.
    const positionOptions = usePositionOptions();

    const {
        register,
        control,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<QuickShiftInput, unknown, QuickShiftValues>({
        resolver: zodResolver(quickShiftSchema),
        defaultValues: toFormValues(DEFAULT_SHIFT_TEMPLATE),
    });

    // Re-seed whenever the dialog opens onto a different cell or shift.
    useEffect(() => {
        if (open && target) {
            reset(toFormValues(target.values));
        }
    }, [open, target, reset]);

    // Live payable-hours preview so the manager sees the effect of a break
    // change without saving first.
    const startTime = watch('startTime');
    const endTime = watch('endTime');
    const breakMinutes = watch('breakMinutes');
    const isPaidBreak = watch('isPaidBreak');

    const parsedBreak = /^\d+$/.test(String(breakMinutes ?? '')) ? Number(breakMinutes) : 0;
    const preview = {
        startTime,
        endTime,
        breakMinutes: parsedBreak,
        isPaidBreak: Boolean(isPaidBreak),
    };
    const previewMinutes = shiftPayableMinutes(preview as never);
    const previewRange = formatShiftTimeRange(preview as never);

    const submit = handleSubmit(async (values) => {
        if (!target) return;
        await onSubmit(target, values);
    });

    const busy = isSaving || isSubmitting;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-sm:gap-3 max-sm:p-4">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit
                            ? target?.values.status === 'cancelled'
                                ? 'Revert cancelled shift'
                                : 'Edit shift'
                            : 'Add shift'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? target?.values.status === 'cancelled'
                                ? 'This shift was cancelled. Change the status back to scheduled (or another status) to revert it — affected staff will be notified on save.'
                                : 'Adjust the times, break, role or status for this shift.'
                            : 'Set the times for the new shift in this cell.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Fixed context: who and when. Changing either is a move, not an edit. */}
                {target && (
                    <div className="flex flex-col gap-1.5 rounded-lg bg-secondary/60 p-2.5 text-sm sm:p-3">
                        <p className="flex items-center gap-2 font-medium text-foreground">
                            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            {target.employeeLabel}
                        </p>
                        <p className="flex items-center gap-2 text-muted-foreground">
                            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {target.dateLabel}
                        </p>
                    </div>
                )}

                <form onSubmit={submit} noValidate className="space-y-4 max-sm:space-y-3">
                    {/* Times */}
                    <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
                        <div className="space-y-1.5">
                            <label
                                htmlFor="quick-shift-start"
                                className="block text-sm font-medium text-foreground"
                            >
                                Start <span className="text-danger">*</span>
                            </label>
                            <input
                                id="quick-shift-start"
                                type="time"
                                step={300}
                                aria-invalid={Boolean(errors.startTime)}
                                className={fieldClasses}
                                {...register('startTime')}
                            />
                            {errors.startTime && (
                                <p className="text-sm text-danger">{errors.startTime.message}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label
                                htmlFor="quick-shift-end"
                                className="block text-sm font-medium text-foreground"
                            >
                                End <span className="text-danger">*</span>
                            </label>
                            <input
                                id="quick-shift-end"
                                type="time"
                                step={300}
                                aria-invalid={Boolean(errors.endTime)}
                                className={fieldClasses}
                                {...register('endTime')}
                            />
                            {errors.endTime && (
                                <p className="text-sm text-danger">{errors.endTime.message}</p>
                            )}
                        </div>
                    </div>

                    {/* Break */}
                    <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
                        <div className="space-y-1.5">
                            <label
                                htmlFor="quick-shift-break"
                                className="block text-sm font-medium text-foreground"
                            >
                                Break (minutes)
                            </label>
                            <input
                                id="quick-shift-break"
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={5}
                                aria-invalid={Boolean(errors.breakMinutes)}
                                className={fieldClasses}
                                {...register('breakMinutes')}
                            />
                            {errors.breakMinutes && (
                                <p className="text-sm text-danger">{errors.breakMinutes.message}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <span className="block text-sm font-medium text-foreground">
                                Paid break
                            </span>
                            <Controller
                                control={control}
                                name="isPaidBreak"
                                render={({ field }) => (
                                    <div className="flex h-9 items-center gap-2 sm:h-11">
                                        <Switch
                                            id="quick-shift-paid-break"
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                        <label
                                            htmlFor="quick-shift-paid-break"
                                            className="text-sm text-muted-foreground"
                                        >
                                            {field.value ? 'Paid' : 'Unpaid'}
                                        </label>
                                    </div>
                                )}
                            />
                        </div>
                    </div>

                    {/* Live payable-hours preview */}
                    <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground sm:py-2 sm:text-sm">
                        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                            {previewRange} ·{' '}
                            <span className="font-medium text-foreground">
                                {formatHours(previewMinutes)}
                            </span>{' '}
                            payable
                        </span>
                    </p>

                    {/* Role + headcount */}
                    <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
                        <div className="space-y-1.5">
                            <label
                                htmlFor="quick-shift-position"
                                className="block text-sm font-medium text-foreground"
                            >
                                Role
                            </label>
                            <select
                                id="quick-shift-position"
                                disabled={positionOptions.isLoading}
                                aria-invalid={Boolean(errors.positionId)}
                                className={fieldClasses}
                                {...register('positionId')}
                            >
                                <option value="">
                                    {positionOptions.isLoading ? 'Loading roles…' : 'No role'}
                                </option>
                                {(positionOptions.data ?? []).map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.name}
                                    </option>
                                ))}
                            </select>
                            {positionOptions.isError && (
                                <p className="text-sm text-danger">
                                    Unable to load roles. You can still save without one.
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label
                                htmlFor="quick-shift-required-staff"
                                className="block text-sm font-medium text-foreground"
                            >
                                Required staff
                            </label>
                            <input
                                id="quick-shift-required-staff"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={99}
                                aria-invalid={Boolean(errors.requiredStaff)}
                                className={fieldClasses}
                                {...register('requiredStaff')}
                            />
                            {errors.requiredStaff && (
                                <p className="text-sm text-danger">{errors.requiredStaff.message}</p>
                            )}
                        </div>
                    </div>

                    {/* Status — enables reverting a cancelled shift without leaving the roster grid */}
                    <div className="space-y-1.5">
                        <label
                            htmlFor="quick-shift-status"
                            className="block text-sm font-medium text-foreground"
                        >
                            Status
                        </label>
                        <select
                            id="quick-shift-status"
                            aria-invalid={Boolean(errors.status)}
                            className={fieldClasses}
                            {...register('status')}
                        >
                            {(
                                Object.entries(SHIFT_STATUS_LABELS) as Array<
                                    [QuickShiftValues['status'], string]
                                >
                            ).map(([status, label]) => (
                                <option key={status} value={status}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        {errors.status && (
                            <p className="text-sm text-danger">{errors.status.message}</p>
                        )}
                        {target?.values.status === 'cancelled' && (
                            <p className="text-xs text-muted-foreground">
                                Switching back to Scheduled reverts the cancellation.
                            </p>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <label
                            htmlFor="quick-shift-notes"
                            className="block text-sm font-medium text-foreground"
                        >
                            Notes
                        </label>
                        <textarea
                            id="quick-shift-notes"
                            rows={2}
                            placeholder="Handover details, tasks, reminders…"
                            aria-invalid={Boolean(errors.notes)}
                            className={cn(
                                'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground',
                                'placeholder:text-muted-foreground transition-colors duration-200',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
                            )}
                            {...register('notes')}
                        />
                        {errors.notes && <p className="text-sm text-danger">{errors.notes.message}</p>}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={busy}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={busy} loadingLabel="Saving…">
                            {isEdit ? 'Save changes' : 'Add shift'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
