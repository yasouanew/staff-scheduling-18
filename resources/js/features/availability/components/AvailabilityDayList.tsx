import { CalendarOff, Clock, Pencil, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
    DAY_LABELS,
    DAY_ORDER,
    type AvailabilityRange,
    type DayOfWeek,
    type WeeklyAvailabilityDraft,
} from '@/types/employee-availability';

import { formatDuration, formatTimeLabel } from '../lib/availability-grid';

/** Props for {@link AvailabilityDayList}. */
interface AvailabilityDayListProps {
    /** The week currently being edited. */
    draft: WeeklyAvailabilityDraft;
    /** Opens the add dialog for a day. */
    onAdd: (day: DayOfWeek) => void;
    /** Opens the edit dialog for a specific block. */
    onEdit: (day: DayOfWeek, range: AvailabilityRange) => void;
    /** Requests removal of a specific block. */
    onRemove: (day: DayOfWeek, range: AvailabilityRange) => void;
    /** Clears every block on a day. */
    onClearDay: (day: DayOfWeek) => void;
    /** Disables all actions while the week is saving. */
    disabled?: boolean;
}

/** Small icon-only action button. */
function IconButton({
    label,
    icon: Icon,
    onClick,
    disabled,
    tone = 'neutral',
}: {
    label: string;
    icon: typeof Pencil;
    onClick: () => void;
    disabled?: boolean;
    tone?: 'neutral' | 'danger';
}): JSX.Element {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                tone === 'danger'
                    ? 'text-danger hover:bg-danger/10'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
        >
            <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
    );
}

/** One block row inside a day card. */
function RangeRow({
    range,
    onEdit,
    onRemove,
    disabled,
}: {
    range: AvailabilityRange;
    onEdit: () => void;
    onRemove: () => void;
    disabled?: boolean;
}): JSX.Element {
    return (
        <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
                <span
                    className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        range.isAvailable ? 'bg-success' : 'bg-muted-foreground',
                    )}
                    aria-hidden="true"
                />
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                        {formatTimeLabel(range.startTime)} – {formatTimeLabel(range.endTime)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {formatDuration(range.startTime, range.endTime)}
                        {range.isAvailable ? '' : ' · Unavailable'}
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                <IconButton
                    label="Edit block"
                    icon={Pencil}
                    onClick={onEdit}
                    disabled={disabled}
                />
                <IconButton
                    label="Remove block"
                    icon={Trash2}
                    onClick={onRemove}
                    disabled={disabled}
                    tone="danger"
                />
            </div>
        </li>
    );
}

/**
 * Day-by-day list of availability blocks.
 *
 * Complements the grid with an explicit, screen-reader-friendly view where each
 * block can be edited or removed precisely — the grid is fast for broad strokes,
 * this list is exact. Days with no blocks render their own inline empty state.
 */
export function AvailabilityDayList({
    draft,
    onAdd,
    onEdit,
    onRemove,
    onClearDay,
    disabled = false,
}: AvailabilityDayListProps): JSX.Element {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {DAY_ORDER.map((day) => {
                const ranges = draft[day];

                return (
                    <section
                        key={day}
                        aria-labelledby={`day-heading-${day}`}
                        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
                    >
                        <header className="flex items-center justify-between gap-2">
                            <h3
                                id={`day-heading-${day}`}
                                className="text-sm font-semibold text-foreground"
                            >
                                {DAY_LABELS[day]}
                            </h3>
                            <div className="flex items-center gap-1.5">
                                {ranges.length > 0 ? (
                                    <IconButton
                                        label={`Clear all ${DAY_LABELS[day]} blocks`}
                                        icon={CalendarOff}
                                        onClick={() => onClearDay(day)}
                                        disabled={disabled}
                                        tone="danger"
                                    />
                                ) : null}
                                <IconButton
                                    label={`Add block to ${DAY_LABELS[day]}`}
                                    icon={Plus}
                                    onClick={() => onAdd(day)}
                                    disabled={disabled}
                                />
                            </div>
                        </header>

                        {ranges.length === 0 ? (
                            <button
                                type="button"
                                onClick={() => onAdd(day)}
                                disabled={disabled}
                                className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-center transition-colors hover:border-primary hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Clock
                                    className="h-5 w-5 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <span className="text-xs text-muted-foreground">
                                    No availability set — add a block
                                </span>
                            </button>
                        ) : (
                            <ul className="space-y-2">
                                {ranges.map((range) => (
                                    <RangeRow
                                        key={range.key}
                                        range={range}
                                        onEdit={() => onEdit(day, range)}
                                        onRemove={() => onRemove(day, range)}
                                        disabled={disabled}
                                    />
                                ))}
                            </ul>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
