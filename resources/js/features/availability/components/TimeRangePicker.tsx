import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { GRID_SLOT_COUNT, GRID_SLOT_MINUTES } from '@/types/employee-availability';

import { formatTimeLabel, minutesToTime } from '../lib/availability-grid';

/** Props for {@link TimeRangePicker}. */
interface TimeRangePickerProps {
    /** Current start time in `HH:mm`. */
    startTime: string;
    /** Current end time in `HH:mm` (`24:00` allowed as end-of-day). */
    endTime: string;
    /** Called with the new start time. */
    onStartChange: (value: string) => void;
    /** Called with the new end time. */
    onEndChange: (value: string) => void;
    /** Inline error for the start field. */
    startError?: string;
    /** Inline error for the end field. */
    endError?: string;
    /** Disables both selects while a mutation is in flight. */
    disabled?: boolean;
}

/** Half-hour options covering the whole day. */
function useTimeOptions(includeEndOfDay: boolean): readonly { value: string; label: string }[] {
    return useMemo(() => {
        const options: { value: string; label: string }[] = [];

        for (let index = 0; index < GRID_SLOT_COUNT; index += 1) {
            const value = minutesToTime(index * GRID_SLOT_MINUTES);
            options.push({ value, label: formatTimeLabel(value) });
        }

        if (includeEndOfDay) {
            options.push({ value: '24:00', label: 'Midnight (end of day)' });
        }

        return options;
    }, [includeEndOfDay]);
}

/** Shared select styling so both fields stay visually identical. */
const selectClass =
    'h-11 w-full rounded-lg border bg-card px-3 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Paired start/end time selects for a single availability block.
 *
 * Purely presentational: it renders half-hour options, surfaces inline errors
 * and reports changes upward. All validation (ordering, overlaps) is owned by
 * the calling form so this component stays reusable for shifts and templates.
 */
export function TimeRangePicker({
    startTime,
    endTime,
    onStartChange,
    onEndChange,
    startError,
    endError,
    disabled = false,
}: TimeRangePickerProps): JSX.Element {
    const startOptions = useTimeOptions(false);
    const endOptions = useTimeOptions(true);

    return (
        <div className="space-y-2">
            <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                    <label
                        htmlFor="availability-start-time"
                        className="block text-sm font-medium text-foreground"
                    >
                        Start time
                    </label>
                    <select
                        id="availability-start-time"
                        value={startTime}
                        disabled={disabled}
                        aria-invalid={startError ? true : undefined}
                        aria-describedby={startError ? 'availability-start-error' : undefined}
                        onChange={(event) => onStartChange(event.target.value)}
                        className={cn(selectClass, startError ? 'border-danger' : 'border-input')}
                    >
                        {startOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <ArrowRight
                    className="mb-3 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                />

                <div className="flex-1 space-y-1.5">
                    <label
                        htmlFor="availability-end-time"
                        className="block text-sm font-medium text-foreground"
                    >
                        End time
                    </label>
                    <select
                        id="availability-end-time"
                        value={endTime}
                        disabled={disabled}
                        aria-invalid={endError ? true : undefined}
                        aria-describedby={endError ? 'availability-end-error' : undefined}
                        onChange={(event) => onEndChange(event.target.value)}
                        className={cn(selectClass, endError ? 'border-danger' : 'border-input')}
                    >
                        {endOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {startError ? (
                <p id="availability-start-error" role="alert" className="text-sm text-danger">
                    {startError}
                </p>
            ) : null}
            {endError ? (
                <p id="availability-end-error" role="alert" className="text-sm text-danger">
                    {endError}
                </p>
            ) : null}
        </div>
    );
}
