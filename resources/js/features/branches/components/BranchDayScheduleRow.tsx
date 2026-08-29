import type { FieldErrors, UseFormRegister } from 'react-hook-form';

import { cn } from '@/lib/utils';
import { WEEKDAY_LABELS, type Weekday } from '@/types/branch';

import type { BranchFormInput } from '../schemas';

/** Compact control styling for the dense per-day grid. */
const dayFieldClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground',
    'transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-50',
);

interface BranchDayScheduleRowProps {
    weekday: Weekday;
    register: UseFormRegister<BranchFormInput>;
    errors: FieldErrors<BranchFormInput>;
    /** True while this day follows the branch's standard hours. */
    useDefault: boolean;
    /** False when the branch is closed on this day. */
    isOpen: boolean;
}

/**
 * One weekday's exception row.
 *
 * The row has three visual states, driven by two checkboxes:
 *
 * 1. *Follows standard hours* — inputs disabled and dimmed, no times shown.
 * 2. *Custom and open* — times, break length and break type are editable.
 * 3. *Custom and closed* — times hidden entirely, since a closed day has none.
 *
 * Inputs are disabled rather than unmounted in state 1 so that a manager who
 * unticks "standard hours" gets their previously typed figures back instead of
 * an empty row.
 */
export function BranchDayScheduleRow({
    weekday,
    register,
    errors,
    useDefault,
    isOpen,
}: BranchDayScheduleRowProps): JSX.Element {
    const dayErrors = errors.daySchedules?.[weekday];
    const disabled = useDefault;
    const showTimes = !useDefault && isOpen;

    return (
        <div
            className={cn(
                'rounded-lg border border-border p-3 transition-colors',
                useDefault ? 'bg-muted/40' : 'bg-card',
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                    {WEEKDAY_LABELS[weekday]}
                </span>

                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            {...register(`daySchedules.${weekday}.useDefault`)}
                        />
                        Standard hours
                    </label>

                    <label
                        className={cn(
                            'flex items-center gap-2 text-sm',
                            disabled ? 'text-muted-foreground/50' : 'text-muted-foreground',
                        )}
                    >
                        <input
                            type="checkbox"
                            disabled={disabled}
                            className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                            {...register(`daySchedules.${weekday}.isOpen`)}
                        />
                        Open
                    </label>
                </div>
            </div>

            {showTimes && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                        <label
                            htmlFor={`${weekday}-opensAt`}
                            className="block text-xs font-medium text-muted-foreground"
                        >
                            Opens
                        </label>
                        <input
                            id={`${weekday}-opensAt`}
                            type="time"
                            aria-invalid={Boolean(dayErrors?.opensAt)}
                            className={dayFieldClasses}
                            {...register(`daySchedules.${weekday}.opensAt`)}
                        />
                        {dayErrors?.opensAt && (
                            <p className="text-xs text-danger">{dayErrors.opensAt.message}</p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label
                            htmlFor={`${weekday}-closesAt`}
                            className="block text-xs font-medium text-muted-foreground"
                        >
                            Closes
                        </label>
                        <input
                            id={`${weekday}-closesAt`}
                            type="time"
                            aria-invalid={Boolean(dayErrors?.closesAt)}
                            className={dayFieldClasses}
                            {...register(`daySchedules.${weekday}.closesAt`)}
                        />
                        {dayErrors?.closesAt && (
                            <p className="text-xs text-danger">{dayErrors.closesAt.message}</p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label
                            htmlFor={`${weekday}-breakMinutes`}
                            className="block text-xs font-medium text-muted-foreground"
                        >
                            Break (min)
                        </label>
                        <input
                            id={`${weekday}-breakMinutes`}
                            type="number"
                            min={0}
                            max={480}
                            step={5}
                            inputMode="numeric"
                            placeholder="30"
                            aria-invalid={Boolean(dayErrors?.breakMinutes)}
                            className={dayFieldClasses}
                            {...register(`daySchedules.${weekday}.breakMinutes`)}
                        />
                        {dayErrors?.breakMinutes && (
                            <p className="text-xs text-danger">{dayErrors.breakMinutes.message}</p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label
                            htmlFor={`${weekday}-breakPayType`}
                            className="block text-xs font-medium text-muted-foreground"
                        >
                            Break type
                        </label>
                        <select
                            id={`${weekday}-breakPayType`}
                            className={dayFieldClasses}
                            {...register(`daySchedules.${weekday}.breakPayType`)}
                        >
                            <option value="unpaid">Unpaid</option>
                            <option value="paid">Paid</option>
                        </select>
                    </div>
                </div>
            )}

            {!useDefault && !isOpen && (
                <p className="mt-2 text-sm text-muted-foreground">
                    Closed — no shifts can be rostered on this day.
                </p>
            )}
        </div>
    );
}
