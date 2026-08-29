import { format, parseISO } from 'date-fns';
import { Building2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { EmptyState } from '@/Components/common/EmptyState';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';

import type { BranchDaySummary } from '../lib/month-grid';

import { BranchDayChip } from './BranchDayChip';

interface BranchDayListDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** ISO date of the day being listed, or `null` while closed. */
    date: string | null;
    /** Every branch rostered that day — not just the ones the cell could fit. */
    summaries: readonly BranchDaySummary[];
    onOpenRoster: (rosterId: string) => void;
    onOpenDay: (date: string) => void;
    onEdit: (summary: BranchDaySummary, date: string) => void;
    onDelete: (summary: BranchDaySummary, date: string) => void;
}

/**
 * The full branch list for one day, opened from a cell's `+N more` control.
 *
 * A month cell can only show three branches before it would distort the grid's
 * row height, so a busy day hides real work behind a count. Previously that
 * count navigated to the day view, which discarded the month context the manager
 * was reading. This dialog instead brings the remainder *to* them.
 *
 * It deliberately reuses {@link BranchDayChip} rather than inventing a second
 * presentation: the chip already encodes coverage, publication state and the
 * edit/delete actions, so a manager reads and operates the list exactly as they
 * do the grid. Only the hover-reveal is dropped — in a dialog the icons should
 * simply be there.
 *
 * Search filters by branch name and is shown once the list is long enough for
 * scanning to beat reading, which keeps the common (small) case uncluttered.
 */
export function BranchDayListDialog({
    open,
    onOpenChange,
    date,
    summaries,
    onOpenRoster,
    onOpenDay,
    onEdit,
    onDelete,
}: BranchDayListDialogProps): JSX.Element {
    const [search, setSearch] = useState('');

    // Each day is a fresh scan, so a stale query is never carried over.
    useEffect(() => {
        if (open) setSearch('');
    }, [open, date]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return summaries;

        return summaries.filter((summary) =>
            summary.branchName.toLowerCase().includes(query),
        );
    }, [search, summaries]);

    /** Totals describe the whole day, not the filtered view. */
    const totals = useMemo(() => {
        return summaries.reduce(
            (accumulator, summary) => ({
                shifts: accumulator.shifts + summary.shiftCount,
                open: accumulator.open + summary.openCount,
                drafts: accumulator.drafts + (summary.rosterStatus === 'draft' ? 1 : 0),
            }),
            { shifts: 0, open: 0, drafts: 0 },
        );
    }, [summaries]);

    const dateLabel = date ? format(parseISO(date), 'EEEE d MMMM yyyy') : '';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
                <DialogHeader className="border-b border-border p-5 pb-4 text-left">
                    <DialogTitle className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                        Branches rostered on {dateLabel}
                    </DialogTitle>
                    <DialogDescription>
                        {summaries.length} branch{summaries.length === 1 ? '' : 'es'} ·{' '}
                        {totals.shifts} shift{totals.shifts === 1 ? '' : 's'}
                        {totals.open > 0 ? ` · ${totals.open} unfilled` : ''}
                        {totals.drafts > 0
                            ? ` · ${totals.drafts} still draft (not visible to staff)`
                            : ''}
                    </DialogDescription>
                </DialogHeader>

                {/*
                 * Search only earns its space once the list outgrows a glance.
                 * Below that threshold every branch is already visible, so a
                 * filter box would be pure decoration.
                 */}
                {summaries.length > 5 ? (
                    <div className="border-b border-border p-4">
                        <label htmlFor="branch-day-list-search" className="sr-only">
                            Search branches
                        </label>
                        <div className="relative">
                            <Search
                                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <input
                                id="branch-day-list-search"
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search branches..."
                                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>
                    </div>
                ) : null}

                <div className="flex-1 overflow-y-auto p-4">
                    {filtered.length === 0 ? (
                        <EmptyState
                            icon={Search}
                            title="No branches match"
                            description={`No branch on this day matches "${search.trim()}". Try a different name.`}
                        />
                    ) : (
                        <ul className="space-y-2">
                            {filtered.map((summary) => (
                                <li key={summary.branchId}>
                                    <BranchDayChip
                                        summary={summary}
                                        date={date ?? ''}
                                        onOpenRoster={(rosterId) => {
                                            // Navigating away must not leave a
                                            // modal stranded over the new page.
                                            onOpenChange(false);
                                            onOpenRoster(rosterId);
                                        }}
                                        onOpenDay={(isoDate) => {
                                            onOpenChange(false);
                                            onOpenDay(isoDate);
                                        }}
                                        onEdit={(branchSummary, isoDate) => {
                                            // The editor is itself a dialog, so
                                            // this one closes to avoid stacking.
                                            onOpenChange(false);
                                            onEdit(branchSummary, isoDate);
                                        }}
                                        onDelete={(branchSummary, isoDate) => {
                                            onOpenChange(false);
                                            onDelete(branchSummary, isoDate);
                                        }}
                                        actionsAlwaysVisible
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
