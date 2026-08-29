import { AlertTriangle, Building2, Pencil, Send, Trash2, Users } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { BranchDaySummary } from '../lib/month-grid';

interface BranchDayChipProps {
    summary: BranchDaySummary;
    /** ISO date of the owning cell, used for the accessible label. */
    date: string;
    /**
     * Opens this branch's roster (the Roster Details workspace) so its shifts can
     * be edited. Receives the summary's `rosterId`.
     */
    onOpenRoster: (rosterId: string) => void;
    /** Fallback drill-down when the branch's shifts have no roster to open. */
    onOpenDay: (date: string) => void;
    /** Opens the inline editor for this branch-day (times, staff, publication). */
    onEdit: (summary: BranchDaySummary, date: string) => void;
    /** Requests deletion of every shift in this branch-day, after confirmation. */
    onDelete: (summary: BranchDaySummary, date: string) => void;
    /**
     * Keeps the edit/delete controls permanently visible.
     *
     * Hover-reveal exists to stop a dense month grid drowning in icons. In a
     * dialog there is no such pressure and no hover on touch devices, so the
     * same chip shows its actions outright.
     */
    actionsAlwaysVisible?: boolean;
}


/**
 * A branch's aggregated coverage for one day, rendered in the month grid.
 *
 * The month view answers *"is this branch covered?"* — not *"what is each shift?"*
 * — so this chip leads with the branch name and reports headcount, the span the
 * branch is staffed for, and any unfilled shifts.
 *
 * Activating the chip opens that branch's **Roster Details** page, which is the
 * existing per-branch weekly editing workspace. Falling back to the day view when
 * a bucket has no roster keeps the chip actionable rather than inert.
 *
 * Unfilled shifts are tinted with the warning colour because an open shift is a
 * coverage gap a manager must act on, not neutral information.
 *
 * The root is a `div` rather than a `button` because the chip carries its own
 * edit/delete controls, and nesting interactive elements inside a button is
 * invalid and unusable with a keyboard. The drill-down is therefore a button that
 * fills the chip, with the actions as siblings.
 */
export function BranchDayChip({
    summary,
    date,
    onOpenRoster,
    onOpenDay,
    onEdit,
    onDelete,
    actionsAlwaysVisible = false,
}: BranchDayChipProps): JSX.Element {

    const hasOpenShifts = summary.openCount > 0;
    const timeSpan = `${summary.earliestStart}–${summary.latestEnd}`;
    const { rosterId, rosterStatus } = summary;
    const isDraft = rosterStatus === 'draft';

    const statusWord = isDraft ? 'Draft — not visible to staff' : rosterStatus === 'published' ? 'Published' : 'Archived';

    const label = [
        `${summary.branchName}:`,
        `${summary.shiftCount} shift${summary.shiftCount === 1 ? '' : 's'} on ${date}`,
        `${timeSpan}`,
        hasOpenShifts ? `${summary.openCount} unfilled` : null,
        statusWord,
        rosterId === null ? '— open day view' : '— open roster details',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className={cn(
                'group/branch relative rounded-md border-l-2 transition-colors',
                // Draft work is tinted differently from published work so a
                // manager can see at a glance what staff have not yet been told.
                hasOpenShifts
                    ? 'border-l-warning bg-warning/5 hover:bg-warning/10'
                    : isDraft
                        ? 'border-l-muted-foreground/40 bg-muted/50 hover:bg-muted'
                        : 'border-l-success bg-success/5 hover:bg-success/10',
            )}
        >
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();

                    if (rosterId === null) {
                        onOpenDay(date);
                        return;
                    }

                    onOpenRoster(rosterId);
                }}
                title={`${summary.branchName} · ${timeSpan}${hasOpenShifts ? ` · ${summary.openCount} unfilled` : ''} · ${statusWord} — ${rosterId === null ? 'open day view' : 'open roster details'}`}
                aria-label={label}
                className={cn(
                    'w-full rounded-md py-1 pl-2 pr-1.5 text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                )}
            >
                <span className="flex items-center gap-1">
                    <Building2
                        className="h-3 w-3 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-foreground">
                        {summary.branchName}
                    </span>
                    {/* Shift count is the densest useful signal, so it always stays visible. */}
                    <span className="shrink-0 rounded bg-secondary px-1 text-[10px] font-semibold leading-tight text-secondary-foreground tabular-nums">
                        {summary.shiftCount}
                    </span>
                </span>

                <span className="mt-0.5 flex items-center gap-1.5 text-[10px] leading-tight text-muted-foreground">
                    {/*
                     * Publication state leads the metadata row: whether staff can
                     * see the day is more consequential than when it runs.
                     */}
                    <span
                        className={cn(
                            'inline-flex shrink-0 items-center gap-0.5 font-medium',
                            isDraft ? 'text-muted-foreground' : 'text-success',
                        )}
                    >
                        {isDraft ? (
                            <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                        ) : (
                            <Send className="h-2.5 w-2.5" aria-hidden="true" />
                        )}
                        {isDraft ? 'Draft' : 'Sent'}
                    </span>

                    <span className="truncate tabular-nums">{timeSpan}</span>

                    {summary.assignedCount > 0 ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums">
                            <Users className="h-2.5 w-2.5" aria-hidden="true" />
                            {summary.assignedCount}
                        </span>
                    ) : null}

                    {hasOpenShifts ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-warning tabular-nums">
                            <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                            {summary.openCount}
                        </span>
                    ) : null}
                </span>
            </button>

            {/*
             * Row actions stay hidden until the chip is hovered or something
             * inside it is focused, so a dense month grid is not covered in
             * icons — but they remain reachable by keyboard because focus-within
             * reveals them. In a dialog (`actionsAlwaysVisible`) there is no
             * density problem and no hover on touch, so they stay put.
             */}
            <div
                className={cn(
                    'absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded bg-card/95 p-0.5 shadow-sm',
                    !actionsAlwaysVisible &&
                    'opacity-0 transition-opacity group-hover/branch:opacity-100 group-focus-within/branch:opacity-100',
                )}
            >

                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onEdit(summary, date);
                    }}
                    title={`Edit ${summary.branchName} on ${date}`}
                    aria-label={`Edit ${summary.branchName} on ${date}`}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                </button>

                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete(summary, date);
                    }}
                    title={`Delete ${summary.shiftCount} shift${summary.shiftCount === 1 ? '' : 's'} for ${summary.branchName} on ${date}`}
                    aria-label={`Delete ${summary.shiftCount} shift${summary.shiftCount === 1 ? '' : 's'} for ${summary.branchName} on ${date}`}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
