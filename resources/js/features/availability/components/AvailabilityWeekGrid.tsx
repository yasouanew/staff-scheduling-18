import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import {
    DAY_ORDER,
    DAY_LABELS,
    DAY_SHORT_LABELS,
    GRID_SLOT_COUNT,
    type DayOfWeek,
    type WeeklySelection,
} from '@/types/employee-availability';

import { formatTimeLabel, hourTicks, slotEndTime, slotStartTime } from '../lib/availability-grid';

/** Props for {@link AvailabilityWeekGrid}. */
interface AvailabilityWeekGridProps {
    /** Current selection: 7 days × 48 half-hour columns. */
    selection: WeeklySelection;
    /**
     * Commits a completed drag. `selected` is the value painted across the
     * range, derived from the cell the drag started on (paint vs erase).
     */
    onCommitRange: (day: DayOfWeek, fromIndex: number, toIndex: number, selected: boolean) => void;
    /** Disables interaction while the week is saving. */
    disabled?: boolean;
}

/** In-progress drag state. */
interface DragState {
    day: DayOfWeek;
    anchorIndex: number;
    currentIndex: number;
    /** Value being painted — the inverse of the anchor cell's value. */
    selected: boolean;
}

/**
 * Interactive weekly availability grid with drag-to-select.
 *
 * Each row is a day; each of the 48 columns is a half-hour slot. Dragging paints
 * (or erases, when starting on an already-selected cell) a contiguous block and
 * commits once on pointer-up, so the parent performs a single state update per
 * gesture rather than one per cell.
 *
 * Keyboard users can toggle individual slots with Space/Enter; every cell is a
 * real button carrying an accessible label such as
 * "Monday 9:00 am to 9:30 am, available".
 */
export function AvailabilityWeekGrid({
    selection,
    onCommitRange,
    disabled = false,
}: AvailabilityWeekGridProps): JSX.Element {
    const [drag, setDrag] = useState<DragState | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const ticks = useMemo(() => hourTicks(), []);

    // Keep a ref in sync so the window-level pointerup handler always sees the
    // latest drag without re-subscribing on every cell we move over.
    useEffect(() => {
        dragRef.current = drag;
    }, [drag]);

    // A drag that ends outside the grid (or outside the window) must still
    // commit, otherwise the selection would silently be lost.
    useEffect(() => {
        if (!drag) return undefined;

        const finish = (): void => {
            const active = dragRef.current;
            if (!active) return;

            const from = Math.min(active.anchorIndex, active.currentIndex);
            const to = Math.max(active.anchorIndex, active.currentIndex);

            onCommitRange(active.day, from, to, active.selected);
            setDrag(null);
        };

        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);

        return () => {
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
        };
    }, [drag, onCommitRange]);

    const beginDrag = useCallback(
        (day: DayOfWeek, index: number): void => {
            if (disabled) return;

            setDrag({
                day,
                anchorIndex: index,
                currentIndex: index,
                selected: !selection[day][index],
            });
        },
        [disabled, selection],
    );

    const extendDrag = useCallback((day: DayOfWeek, index: number): void => {
        setDrag((current) =>
            current && current.day === day ? { ...current, currentIndex: index } : current,
        );
    }, []);

    const toggleSingle = useCallback(
        (day: DayOfWeek, index: number): void => {
            if (disabled) return;
            onCommitRange(day, index, index, !selection[day][index]);
        },
        [disabled, onCommitRange, selection],
    );

    /** True when a cell falls inside the active drag's painted band. */
    const isInDrag = (day: DayOfWeek, index: number): boolean => {
        if (!drag || drag.day !== day) return false;

        const from = Math.min(drag.anchorIndex, drag.currentIndex);
        const to = Math.max(drag.anchorIndex, drag.currentIndex);

        return index >= from && index <= to;
    };

    return (
        <div className="space-y-3">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-success" aria-hidden="true" />
                    Available
                </span>
                <span className="flex items-center gap-1.5">
                    <span
                        className="h-3 w-3 rounded-sm border border-border bg-muted"
                        aria-hidden="true"
                    />
                    Unavailable
                </span>
                <span className="hidden sm:inline">Click and drag to paint or erase a block.</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
                <div className="min-w-[46rem]">
                    {/* Time axis */}
                    <div className="flex items-end gap-2 pb-1.5">
                        <span className="w-12 shrink-0 sm:w-14" aria-hidden="true" />
                        <div className="relative h-4 flex-1">
                            {ticks.map((tick) => (
                                <span
                                    key={tick.index}
                                    className="absolute -translate-x-1/2 text-[10px] font-medium text-muted-foreground"
                                    style={{
                                        left: `${(tick.index / GRID_SLOT_COUNT) * 100}%`,
                                    }}
                                >
                                    {tick.label.replace(':00', '')}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Day rows */}
                    <div
                        className="space-y-1.5 touch-none select-none"
                        role="grid"
                        aria-label="Weekly availability grid"
                    >
                        {DAY_ORDER.map((day) => (
                            <div key={day} role="row" className="flex items-center gap-2">
                                <span
                                    role="rowheader"
                                    className="w-12 shrink-0 text-xs font-medium text-foreground sm:w-14"
                                >
                                    {DAY_SHORT_LABELS[day]}
                                </span>
                                <div className="flex flex-1 gap-px overflow-hidden rounded-md">
                                    {Array.from({ length: GRID_SLOT_COUNT }, (_, index) => {
                                        const inDrag = isInDrag(day, index);
                                        const active = inDrag
                                            ? (drag?.selected ?? false)
                                            : selection[day][index];

                                        return (
                                            <button
                                                key={index}
                                                type="button"
                                                role="gridcell"
                                                aria-pressed={active}
                                                aria-label={`${DAY_LABELS[day]} ${formatTimeLabel(
                                                    slotStartTime(index),
                                                )} to ${formatTimeLabel(slotEndTime(index))}, ${active ? 'available' : 'unavailable'
                                                    }`}
                                                disabled={disabled}
                                                onPointerDown={(event) => {
                                                    event.preventDefault();
                                                    beginDrag(day, index);
                                                }}
                                                onPointerEnter={() => {
                                                    if (drag) extendDrag(day, index);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === ' ' || event.key === 'Enter') {
                                                        event.preventDefault();
                                                        toggleSingle(day, index);
                                                    }
                                                }}
                                                className={cn(
                                                    'h-8 flex-1 transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                    active
                                                        ? 'bg-success hover:bg-success/90'
                                                        : 'bg-muted hover:bg-accent',
                                                    inDrag && 'ring-1 ring-inset ring-ring',
                                                    disabled && 'cursor-not-allowed opacity-60',
                                                    // Emphasise hour boundaries for readability.
                                                    index % 2 === 1 && 'mr-px',
                                                )}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
