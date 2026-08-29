import { isToday, isWeekend } from 'date-fns';
import { CalendarRange, Plus, Users } from 'lucide-react';
import { useMemo } from 'react';

import { EmptyState } from '@/Components/common/EmptyState';
import { Button } from '@/Components/ui/button';
import { TooltipProvider } from '@/Components/ui/tooltip';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import type { RosterGridRow, RosterShift } from '@/types/roster-management';

import {
    buildRosterGrid,
    countGridRows,
    formatDayLabel,
    formatDayLabelLong,
    toIsoDate,
    weekDays,
    type AddedEmployee,
} from '../lib/roster-week';
import { RosterGridEmployeeCell } from './RosterGridEmployeeCell';
import { RosterShiftBlock } from './RosterShiftBlock';

interface RosterMatrixGridProps {
    /** First day of the roster week (ISO `yyyy-MM-dd`). */
    weekStart: string | null;
    /** Every shift belonging to the roster. */
    shifts: readonly RosterShift[];
    /**
     * Employees placed on the roster but not yet scheduled. They render as rows
     * with empty cells so shifts can be added later.
     */
    addedEmployees?: readonly AddedEmployee[];
    /** Renders skeleton rows while the parent query is loading. */
    isLoading?: boolean;
    /** When false, every editing affordance is hidden (read-only roster). */
    canEdit?: boolean;
    /** Fires when a shift block is activated. */
    onSelectShift?: (shift: RosterShift) => void;
    /** Fires when a cell's add (`+`) action is used. */
    onAddShift?: (date: string, employeeId: string | null) => void;
    /** Fires when a shift's pencil icon is used (quick edit). */
    onEditShift?: (shift: RosterShift) => void;
    /** Fires when a shift's bin icon is used (delete, pending confirmation). */
    onDeleteShift?: (shift: RosterShift) => void;
    /** Fires when a row's bin icon is used to remove the employee for the week. */
    onDeleteEmployee?: (row: RosterGridRow) => void;
    /** Disables every cell/shift action while a mutation is in flight. */
    isMutating?: boolean;
}


/**
 * Fixed width of the sticky employee column. Kept as an explicit grid template
 * (rather than a fraction) so the seven day columns always share the remainder
 * equally and the header stays perfectly aligned with the body.
 */
const GRID_TEMPLATE = 'minmax(14rem, 16rem) repeat(7, minmax(7.5rem, 1fr))';

/** Skeleton placeholder shown while the roster is loading. */
function GridSkeleton(): JSX.Element {
    return (
        <div className="space-y-px" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, rowIndex) => (
                <div
                    key={rowIndex}
                    className="grid gap-px bg-border"
                    style={{ gridTemplateColumns: GRID_TEMPLATE }}
                >
                    <div className="flex items-center gap-3 bg-card px-3 py-3">
                        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                        <div className="flex-1 space-y-1.5">
                            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                            <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
                        </div>
                    </div>
                    {Array.from({ length: 7 }).map((__, dayIndex) => (
                        <div key={dayIndex} className="bg-card p-1.5">
                            {(rowIndex + dayIndex) % 3 === 0 && (
                                <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

/**
 * Weekly roster matrix: employees down the rows, Monday → Sunday across the
 * columns, with each cell holding that person's shift blocks for the day.
 *
 * Layout notes:
 *  - Desktop / tablet render a CSS grid with a sticky employee column and a
 *    sticky day header, so both axes stay visible while scrolling large rosters.
 *  - Mobile switches to a stacked agenda (grouped by employee, then day) because
 *    a seven-column matrix cannot be read on a narrow viewport.
 *
 * The component is presentational — it derives its view model from `shifts` via
 * `buildRosterGrid` and delegates all interaction upward.
 */
export function RosterMatrixGrid({
    weekStart,
    shifts,
    addedEmployees = [],
    isLoading = false,
    canEdit = false,
    onSelectShift,
    onAddShift,
    onEditShift,
    onDeleteShift,
    onDeleteEmployee,
    isMutating = false,
}: RosterMatrixGridProps): JSX.Element {
    const isMobile = useMediaQuery('(max-width: 767px)');


    const days = useMemo(() => weekDays(weekStart), [weekStart]);
    const groups = useMemo(
        () => buildRosterGrid(weekStart, shifts, addedEmployees),
        [weekStart, shifts, addedEmployees],
    );
    const rowCount = countGridRows(groups);

    if (isLoading) {
        return (
            <div className="overflow-hidden rounded-xl border border-border bg-border shadow-sm">
                <GridSkeleton />
            </div>
        );
    }

    if (rowCount === 0) {
        return (
            <EmptyState
                icon={CalendarRange}
                title="No shifts scheduled for this week"
                description={
                    canEdit
                        ? 'Add your first shift, or copy last week to build this roster in one step.'
                        : 'This roster has no shifts yet. Check back once the schedule is drafted.'
                }
                action={
                    canEdit && onAddShift ? (
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => onAddShift(toIsoDate(days[0] ?? new Date()), null)}
                        >
                            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Add shift
                        </Button>
                    ) : undefined
                }
            />
        );
    }

    /* ---------------------------------------------------------------------- */
    /* Mobile: stacked agenda per employee                                    */
    /* ---------------------------------------------------------------------- */

    if (isMobile) {
        return (
            <TooltipProvider delayDuration={200}>
                <div className="space-y-4">
                    {groups.map((group) => (
                        <section key={group.key} className="space-y-2">
                            <h3 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                                {group.label}
                            </h3>

                            {group.rows.map((row) => (
                                <article
                                    key={row.key}
                                    className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                                >
                                    <RosterGridEmployeeCell
                                        row={row}
                                        className="border-b border-border"
                                        onDeleteEmployee={canEdit ? onDeleteEmployee : undefined}
                                        actionsDisabled={isMutating}
                                    />

                                    <div className="divide-y divide-border">
                                        {row.cells
                                            .filter((cell) => cell.shifts.length > 0)
                                            .map((cell) => {
                                                const date = days.find(
                                                    (day) => toIsoDate(day) === cell.date,
                                                );

                                                return (
                                                    <div
                                                        key={cell.date}
                                                        className="flex items-start gap-3 px-3 py-2"
                                                    >
                                                        <p className="w-16 shrink-0 pt-1 text-xs font-semibold text-muted-foreground">
                                                            {date ? formatDayLabel(date) : cell.date}
                                                        </p>
                                                        <div className="flex-1 space-y-1.5">
                                                            {cell.shifts.map((shift) => (
                                                                <RosterShiftBlock
                                                                    key={shift.id}
                                                                    shift={shift}
                                                                    dense
                                                                    onSelect={onSelectShift}
                                                                    onEdit={
                                                                        canEdit ? onEditShift : undefined
                                                                    }
                                                                    onDelete={
                                                                        canEdit ? onDeleteShift : undefined
                                                                    }
                                                                    actionsDisabled={isMutating}
                                                                />
                                                            ))}
                                                            {/* Mobile renders only cells that already have shifts, so the
                                                                `+` (empty-cell add affordance) never appears here — it is
                                                                exclusive to empty cells in the desktop matrix. */}
                                                        </div>

                                                    </div>
                                                );
                                            })}
                                    </div>
                                </article>
                            ))}
                        </section>
                    ))}
                </div>
            </TooltipProvider>
        );
    }

    /* ---------------------------------------------------------------------- */
    /* Tablet + desktop: true matrix grid                                     */
    /* ---------------------------------------------------------------------- */

    return (
        <TooltipProvider delayDuration={200}>
            <div
                className="overflow-x-auto rounded-xl border border-border shadow-sm"
                role="region"
                aria-label="Weekly roster grid"
                tabIndex={0}
            >
                <div className="min-w-[56rem] bg-border">
                    {/* Sticky day header */}
                    <div
                        className="sticky top-0 z-20 grid gap-px bg-border"
                        style={{ gridTemplateColumns: GRID_TEMPLATE }}
                    >
                        <div className="sticky left-0 z-30 flex items-center bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Employee
                        </div>

                        {days.map((day) => (
                            <div
                                key={toIsoDate(day)}
                                className={cn(
                                    'flex flex-col items-center justify-center bg-muted px-2 py-2 text-center',
                                    isWeekend(day) && 'bg-secondary',
                                )}
                            >
                                <span className="sr-only">{formatDayLabelLong(day)}</span>
                                <span
                                    className={cn(
                                        'text-xs font-semibold uppercase tracking-wide',
                                        isToday(day) ? 'text-primary' : 'text-muted-foreground',
                                    )}
                                    aria-hidden="true"
                                >
                                    {formatDayLabel(day)}
                                </span>
                                {isToday(day) && (
                                    <span className="mt-0.5 h-1 w-6 rounded-full bg-primary" aria-hidden="true" />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Grouped employee rows */}
                    {groups.map((group) => (
                        <div key={group.key}>
                            <div
                                className="grid gap-px bg-border"
                                style={{ gridTemplateColumns: GRID_TEMPLATE }}
                            >
                                <div className="sticky left-0 z-10 col-span-full flex items-center gap-2 bg-secondary px-3 py-1.5">
                                    <Users
                                        className="h-3.5 w-3.5 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
                                        {group.label}
                                    </h3>
                                    <span className="text-xs text-muted-foreground">
                                        {group.rows.length}{' '}
                                        {group.rows.length === 1 ? 'person' : 'people'}
                                    </span>
                                </div>
                            </div>

                            {group.rows.map((row) => (
                                <GridRow
                                    key={row.key}
                                    row={row}
                                    days={days}
                                    canEdit={canEdit}
                                    onSelectShift={onSelectShift}
                                    onAddShift={onAddShift}
                                    onEditShift={onEditShift}
                                    onDeleteShift={onDeleteShift}
                                    onDeleteEmployee={onDeleteEmployee}
                                    isMutating={isMutating}
                                />
                            ))}

                        </div>
                    ))}
                </div>
            </div>

            {/* Legend: keeps the colour + conflict semantics discoverable. */}
            <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm border border-l-[3px] border-border border-l-primary bg-card" aria-hidden="true" />
                    <dd>Position colour</dd>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm border border-dashed border-warning/60 bg-warning/10" aria-hidden="true" />
                    <dd>Open shift</dd>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-card ring-1 ring-warning/60" aria-hidden="true" />
                    <dd>Conflict (overtime, leave or double booking)</dd>
                </div>
                {canEdit && (
                    <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-primary/15 ring-1 ring-primary/50" aria-hidden="true" />
                        <dd>Hover a cell to add a shift, or a shift to edit or remove it</dd>
                    </div>
                )}
            </dl>

        </TooltipProvider>
    );
}

interface GridRowProps {
    row: RosterGridRow;
    days: readonly Date[];
    canEdit: boolean;
    onSelectShift?: (shift: RosterShift) => void;
    onAddShift?: (date: string, employeeId: string | null) => void;
    onEditShift?: (shift: RosterShift) => void;
    onDeleteShift?: (shift: RosterShift) => void;
    onDeleteEmployee?: (row: RosterGridRow) => void;
    isMutating?: boolean;
}

/**
 * A single matrix row: the sticky employee cell followed by seven day cells.
 * Extracted so each row stays a small, single-responsibility unit.
 *
 * Each day cell owns a `group/cell` scope so its hover `+` action reveals
 * independently of neighbouring cells and of the row-level `group`.
 */
function GridRow({
    row,
    days,
    canEdit,
    onSelectShift,
    onAddShift,
    onEditShift,
    onDeleteShift,
    onDeleteEmployee,
    isMutating = false,
}: GridRowProps): JSX.Element {
    return (
        <div
            className="group grid gap-px bg-border"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
        >
            <RosterGridEmployeeCell
                row={row}
                className="sticky left-0 z-10 border-r border-border"
                onDeleteEmployee={canEdit ? onDeleteEmployee : undefined}
                actionsDisabled={isMutating}
            />

            {row.cells.map((cell, index) => {
                const day = days[index];
                const weekend = day ? isWeekend(day) : false;
                // The `+` is only meaningful on an empty cell: once a shift is
                // set (or staged) here, the affordance disappears so a manager
                // cannot stack a second shift into the same cell by accident.
                const canAddHere =
                    canEdit && onAddShift !== undefined && cell.shifts.length === 0;

                return (
                    <div
                        key={cell.date}
                        className={cn(
                            'group/cell relative flex min-h-[3.75rem] flex-col gap-1 p-1.5',
                            weekend ? 'bg-secondary/40' : 'bg-card',
                        )}
                    >
                        {canAddHere && (
                            <button
                                type="button"
                                onClick={() => onAddShift(cell.date, row.employeeId)}
                                disabled={isMutating}
                                title={`Add a shift on ${day ? formatDayLabel(day) : cell.date}`}
                                aria-label={`Add a shift on ${day ? formatDayLabel(day) : cell.date}`}
                                className={cn(
                                    'absolute right-1.5 top-1.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded border border-border/70',
                                    'bg-background text-muted-foreground shadow-sm transition-colors duration-150',
                                    'hover:bg-secondary hover:text-foreground',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    'disabled:pointer-events-none disabled:opacity-40',
                                    'opacity-0 group-hover/cell:opacity-100 group-focus-within/cell:opacity-100',
                                    'max-md:opacity-100',
                                )}
                            >
                                <Plus className="h-3 w-3" aria-hidden="true" />
                            </button>
                        )}

                        <div className={cn('flex flex-col gap-1', canAddHere && 'pt-5')}>
                            {cell.shifts.map((shift) => (
                                <RosterShiftBlock
                                    key={shift.id}
                                    shift={shift}
                                    onSelect={onSelectShift}
                                    onEdit={canEdit ? onEditShift : undefined}
                                    onDelete={canEdit ? onDeleteShift : undefined}
                                    actionsDisabled={isMutating}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}


