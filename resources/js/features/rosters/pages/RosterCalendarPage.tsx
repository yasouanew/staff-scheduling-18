import { parseISO } from 'date-fns';
import { CalendarDays, Loader2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { EmptyState } from '@/Components/common/EmptyState';
import { ErrorAlert } from '@/Components/common/ErrorAlert';
import { PageHeader } from '@/Components/common/PageHeader';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/Components/ui/alert-dialog';
import { useBranchOptions } from '@/features/branches/hooks/useBranches';
import { useCreateShift, useDeleteShift, useShifts, useUpdateShift } from '@/features/shifts/hooks/useShifts';
import { cn } from '@/lib/utils';
import type { Shift, ShiftStatus } from '@/types/shift';

import { AddShiftWizard, type AddShiftSubmission } from '../components/AddShiftWizard';
import {
    BranchDayEditorDialog,
    type BranchDaySubmission,
} from '../components/BranchDayEditorDialog';
import { BranchDayListDialog } from '../components/BranchDayListDialog';

import { CalendarPublicationSummary } from '../components/CalendarPublicationSummary';
import { CalendarToolbar } from '../components/CalendarToolbar';
import { CalendarVisibilityNotice } from '../components/CalendarVisibilityNotice';
import { RosterMonthGrid } from '../components/RosterMonthGrid';
import { useCalendarClipboard } from '../hooks/useCalendarClipboard';
import { useRosterResolver } from '../hooks/useRosterResolver';
import { usePublishRoster } from '../hooks/useRosters';
import {
    buildBranchWeekStatusIndex,
    buildMonthGrid,
    buildWeek,
    derivePublicationStats,
    getVisibleRange,
    stepCursor,

    type BranchDaySummary,
    type CalendarDay,
    type CalendarViewMode,
    type CalendarWeek,
    type CellContentMode,
} from '../lib/month-grid';

/** A branch-day targeted by the editor or the delete confirmation. */
interface BranchDayTarget {
    summary: BranchDaySummary;
    date: string;
}


/** Status filter options; `all` is represented by the empty string. */
const STATUS_FILTERS: readonly { value: '' | ShiftStatus; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'completed', label: 'Completed' },
    { value: 'swap_requested', label: 'Swap requested' },
    { value: 'cancelled', label: 'Cancelled' },
] as const;

/**
 * Roster calendar: a month/week/day canvas over every branch's shifts.
 *
 * The page owns all state and data access; the grid, cells and chips beneath it
 * stay purely presentational. Two structural decisions drive the design:
 *
 * - **Shifts, not rosters, are the unit of display.** Rosters are stored per
 *   branch per ISO week, so a *day* cell can only ever be a projection over
 *   shifts. Writes go through {@link useRosterResolver}, which maps
 *   `(branch, date)` back onto the owning roster week.
 * - **The visible range drives the query.** Month view fetches the padded grid so
 *   adjacent-month cells are populated rather than deceptively empty.
 */
export default function RosterCalendarPage(): JSX.Element {
    const navigate = useNavigate();

    const [cursor, setCursor] = useState(() => new Date());
    const [view, setView] = useState<CalendarViewMode>('month');
    const [branchFilter, setBranchFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | ShiftStatus>('');

    const [wizardDate, setWizardDate] = useState<string | null>(null);
    const [shiftPendingDelete, setShiftPendingDelete] = useState<Shift | null>(null);
    const [draggedShift, setDraggedShift] = useState<Shift | null>(null);
    const [isBulkSaving, setIsBulkSaving] = useState(false);

    const [branchDayEditing, setBranchDayEditing] = useState<BranchDayTarget | null>(null);
    const [branchDayPendingDelete, setBranchDayPendingDelete] = useState<BranchDayTarget | null>(
        null,
    );

    /**
     * ISO date whose full branch list is open (from a cell's `+N more`).
     *
     * Only the date is stored, never the summaries themselves: the list is
     * re-derived from the current grid on every render, so an edit or deletion
     * made from inside the dialog is reflected the moment the query settles
     * instead of leaving a stale snapshot on screen.
     */
    const [branchListDate, setBranchListDate] = useState<string | null>(null);



    const clipboard = useCalendarClipboard();
    const resolveRoster = useRosterResolver();

    const branchesQuery = useBranchOptions();
    const createShift = useCreateShift();
    const updateShift = useUpdateShift();
    const deleteShift = useDeleteShift();
    const publishRoster = usePublishRoster();


    const range = useMemo(() => getVisibleRange(cursor, view), [cursor, view]);

    const shiftsQuery = useShifts({
        dateFrom: range.start,
        dateTo: range.end,
        ...(branchFilter ? { branchId: branchFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        perPage: 500,
    });

    const shifts = shiftsQuery.data ?? [];

    /** Branch ids in scope; drives each cell's "all branches covered" state. */
    const branchIds = useMemo(() => {
        if (branchFilter) return [branchFilter];
        return (branchesQuery.data ?? []).map((branch) => branch.id);
    }, [branchFilter, branchesQuery.data]);

    const weeks: CalendarWeek[] = useMemo(() => {
        if (view === 'month') {
            return buildMonthGrid({ cursor, shifts, branchIds });
        }

        const week = buildWeek({ cursor, shifts, branchIds });

        if (view === 'week') return [week];

        // Day view reuses the week row, narrowed to the cursor's date.
        const iso = range.start;
        return [
            {
                ...week,
                days: week.days.filter((day) => day.date === iso),
                shiftCount: week.days
                    .filter((day) => day.date === iso)
                    .reduce((total, day) => total + day.shifts.length, 0),
            },
        ];
    }, [view, cursor, shifts, branchIds, range.start]);

    /**
     * A month cell is too small to read individual shifts, so the month view
     * aggregates each day to one row per branch and answers "is this branch
     * covered?". Week and day views have the room for per-shift detail, which is
     * also where editing, dragging and deleting stay available.
     */
    const contentMode: CellContentMode = view === 'month' ? 'branches' : 'shifts';

    /* ---------------------------------------------------------------------- */
    /* Mutations                                                              */
    /* ---------------------------------------------------------------------- */

    /**
     * Creates the wizard's shifts and, when asked, publishes the roster week.
     *
     * Publication runs **after** every shift is created and only when none
     * failed: notifying staff about a half-built day is worse than leaving the
     * week as a draft they cannot see yet. A publish failure is reported
     * separately from a create failure because the shifts really were saved —
     * only the announcement is missing, and it can be retried from any chip.
     */
    const handleAddShifts = useCallback(
        async ({ branchId, date, assignments, publish }: AddShiftSubmission): Promise<void> => {
            setIsBulkSaving(true);

            try {
                const rosterId = await resolveRoster(branchId, date);

                const results = await Promise.allSettled(
                    assignments.map((assignment) =>
                        createShift.mutateAsync({
                            rosterId,
                            date,
                            startTime: assignment.startTime,
                            endTime: assignment.endTime,
                            employeeId: assignment.employeeId,
                            breakMinutes: assignment.breakMinutes,
                            isPaidBreak: assignment.isPaidBreak,
                            positionId: null,
                            requiredStaff: 1,
                            notes: null,
                            status: 'scheduled',
                        }),
                    ),
                );

                const failed = results.filter((result) => result.status === 'rejected').length;

                if (failed > 0) {
                    // Partial success is reported honestly rather than as a blanket
                    // failure, since the succeeded shifts really were created.
                    toast.error(
                        `${failed} of ${assignments.length} shifts could not be created. They may conflict with existing shifts.${publish ? ' Nothing was published — fix the conflicts, then publish.' : ''}`,
                    );
                    return;
                }

                const savedLabel = `${assignments.length} shift${assignments.length === 1 ? '' : 's'}`;

                if (!publish) {
                    toast.success(`${savedLabel} saved as draft — not visible to staff yet`);
                    setWizardDate(null);
                    return;
                }

                try {
                    await publishRoster.mutateAsync(rosterId);
                    toast.success(`${savedLabel} published — rostered staff notified`);
                } catch {
                    toast.error(
                        `${savedLabel} saved, but the roster could not be published. Staff have not been notified yet.`,
                    );
                }

                setWizardDate(null);
            } catch {
                toast.error('Could not add shifts. Please try again.');
            } finally {
                setIsBulkSaving(false);
            }
        },
        [createShift, publishRoster, resolveRoster],
    );


    const handleCopy = useCallback(
        (day: CalendarDay): void => {
            const count = clipboard.copyDay(day);
            toast.success(`Copied ${count} shift${count === 1 ? '' : 's'}`);
        },
        [clipboard],
    );

    const handlePaste = useCallback(
        async (date: string): Promise<void> => {
            const payload = clipboard.payload;
            if (!payload) return;

            const targets = clipboard.resolveTargets(date);
            setIsBulkSaving(true);

            try {
                const tasks = targets.flatMap((target) =>
                    payload.entries
                        // A shift with no branch cannot be mapped to a roster week.
                        .filter((entry) => entry.branchId !== null)
                        .map(async (entry) => {
                            const rosterId = await resolveRoster(entry.branchId as string, target);

                            return createShift.mutateAsync({
                                rosterId,
                                date: target,
                                startTime: entry.startTime,
                                endTime: entry.endTime,
                                employeeId: entry.employeeId,
                                positionId: entry.positionId,
                                requiredStaff: entry.requiredStaff,
                                notes: entry.notes,
                                status: 'scheduled',
                            });
                        }),
                );

                const results = await Promise.allSettled(tasks);
                const created = results.filter((result) => result.status === 'fulfilled').length;
                const failed = results.length - created;

                if (created > 0) {
                    toast.success(
                        `Pasted ${created} shift${created === 1 ? '' : 's'} into ${targets.length} day${targets.length === 1 ? '' : 's'}`,
                    );
                }

                if (failed > 0) {
                    toast.error(`${failed} shift${failed === 1 ? '' : 's'} could not be pasted.`);
                }

                clipboard.clearSelection();
            } catch {
                toast.error('Paste failed. Please try again.');
            } finally {
                setIsBulkSaving(false);
            }
        },
        [clipboard, createShift, resolveRoster],
    );

    const handleDropShift = useCallback(
        async (date: string): Promise<void> => {
            const shift = draggedShift;
            setDraggedShift(null);

            if (!shift || shift.date === date) return;

            try {
                // Moving across an ISO week boundary changes the owning roster, so
                // the target roster is resolved rather than assumed.
                const rosterId = shift.branchId
                    ? await resolveRoster(shift.branchId, date)
                    : shift.rosterId;

                await updateShift.mutateAsync({
                    id: shift.id,
                    input: {
                        rosterId,
                        date,
                        startTime: shift.startTime,
                        endTime: shift.endTime,
                        employeeId: shift.employeeId,
                        positionId: shift.positionId,
                        requiredStaff: shift.requiredStaff,
                        notes: shift.notes,
                        status: shift.status,
                    },
                });

                toast.success('Shift moved');
            } catch {
                toast.error('Could not move the shift. It may conflict with an existing shift.');
            }
        },
        [draggedShift, resolveRoster, updateShift],
    );

    const handleConfirmDelete = useCallback(async (): Promise<void> => {
        const shift = shiftPendingDelete;
        if (!shift) return;

        try {
            await deleteShift.mutateAsync(shift.id);
            toast.success('Shift deleted');
        } catch {
            toast.error('Could not delete the shift.');
        } finally {
            setShiftPendingDelete(null);
        }
    }, [deleteShift, shiftPendingDelete]);

    /**
     * Saves a branch-day: the staffing edits first, then publication.
     *
     * Order matters. Publishing notifies employees, so it must happen *after* the
     * assignments are correct — otherwise staff are told about a roster that is
     * about to change under them. If any shift update fails the publish is
     * abandoned for the same reason.
     */
    const handleBranchDaySave = useCallback(
        async (summary: BranchDaySummary, submission: BranchDaySubmission): Promise<void> => {
            setIsBulkSaving(true);

            try {
                const results = await Promise.allSettled(
                    submission.changed.map((draft) => {
                        const original = summary.shifts.find(
                            (shift) => shift.id === draft.shiftId,
                        );
                        if (!original) return Promise.resolve();

                        return updateShift.mutateAsync({
                            id: draft.shiftId,
                            input: {
                                rosterId: original.rosterId,
                                date: original.date,
                                startTime: draft.startTime,
                                endTime: draft.endTime,
                                employeeId: draft.employeeId,
                                positionId: original.positionId,
                                requiredStaff: original.requiredStaff,
                                notes: original.notes,
                                status: original.status,
                            },
                        });
                    }),
                );

                const failed = results.filter((result) => result.status === 'rejected').length;

                if (failed > 0) {
                    toast.error(
                        `${failed} shift${failed === 1 ? '' : 's'} could not be saved. They may conflict with an existing shift or with approved leave.`,
                    );
                    return;
                }

                if (submission.changed.length > 0) {
                    toast.success(
                        `${submission.changed.length} shift${submission.changed.length === 1 ? '' : 's'} updated`,
                    );
                }

                if (submission.publish) {
                    if (!summary.rosterId) {
                        toast.error('This branch has no roster week to publish yet.');
                        return;
                    }

                    await publishRoster.mutateAsync(summary.rosterId);
                    toast.success(`${summary.branchName} roster published — staff notified`);
                }

                setBranchDayEditing(null);
            } catch {
                toast.error('Could not publish the roster. Please try again.');
            } finally {
                setIsBulkSaving(false);
            }
        },
        [publishRoster, updateShift],
    );

    /** Removes every shift a branch has on one day. */
    const handleConfirmBranchDayDelete = useCallback(async (): Promise<void> => {
        const target = branchDayPendingDelete;
        if (!target) return;

        setIsBulkSaving(true);

        try {
            const results = await Promise.allSettled(
                target.summary.shifts.map((shift) => deleteShift.mutateAsync(shift.id)),
            );

            const removed = results.filter((result) => result.status === 'fulfilled').length;
            const failed = results.length - removed;

            if (removed > 0) {
                toast.success(
                    `${removed} shift${removed === 1 ? '' : 's'} removed from ${target.summary.branchName}`,
                );
            }

            if (failed > 0) {
                toast.error(`${failed} shift${failed === 1 ? '' : 's'} could not be deleted.`);
            }
        } catch {
            toast.error('Could not clear this day. Please try again.');
        } finally {
            setIsBulkSaving(false);
            setBranchDayPendingDelete(null);
        }
    }, [branchDayPendingDelete, deleteShift]);

    /* ---------------------------------------------------------------------- */
    /* Render                                                                 */
    /* ---------------------------------------------------------------------- */

    const hasAnyShift = shifts.length > 0;
    const selectionCount = clipboard.selectedDates.size;

    /** Draft vs published analysis for the visible period. */
    const publicationStats = useMemo(() => derivePublicationStats(shifts), [shifts]);

    /**
     * Publication state per branch-week, so the Add Shift wizard can say whether
     * saving will expose the new shifts immediately or leave them hidden.
     *
     * Derived from the shifts already fetched for this period — the wizard needs
     * the answer for the cell being edited, which is by definition on screen.
     */
    const branchWeekStatuses = useMemo(() => buildBranchWeekStatusIndex(shifts), [shifts]);

    /**
     * Branches rostered on the day whose overflow list is open.
     *
     * Re-derived from `weeks` rather than captured when the dialog opened, so the
     * list stays truthful after an edit or deletion instead of showing a snapshot
     * of a day that no longer exists.
     */
    const branchListSummaries = useMemo((): readonly BranchDaySummary[] => {
        if (branchListDate === null) return [];

        for (const week of weeks) {
            const day = week.days.find((candidate) => candidate.date === branchListDate);
            if (day) return day.branchSummaries;
        }

        return [];
    }, [branchListDate, weeks]);




    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Scheduling"
                title="Roster calendar"
                description="Plan shifts across every branch. Click a day to add shifts, copy a day onto others, or drag a shift to reschedule it."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <label htmlFor="branch-filter" className="sr-only">
                            Filter by branch
                        </label>
                        <select
                            id="branch-filter"
                            value={branchFilter}
                            onChange={(event) => setBranchFilter(event.target.value)}
                            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="">All branches</option>
                            {(branchesQuery.data ?? []).map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                </option>
                            ))}
                        </select>

                        <label htmlFor="status-filter" className="sr-only">
                            Filter by status
                        </label>
                        <select
                            id="status-filter"
                            value={statusFilter}
                            onChange={(event) =>
                                setStatusFilter(event.target.value as '' | ShiftStatus)
                            }
                            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {STATUS_FILTERS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                }
            />

            <CalendarToolbar
                cursor={cursor}
                view={view}
                onPrevious={() => setCursor((current) => stepCursor(current, view, -1))}
                onNext={() => setCursor((current) => stepCursor(current, view, 1))}
                onToday={() => setCursor(new Date())}
                onViewChange={setView}
                isLoading={shiftsQuery.isFetching}
            />

            {/*
             * The draft/published rule is stated before the numbers, because the
             * numbers are meaningless to anyone who does not yet know that an
             * unpublished shift is invisible to the staff it was written for.
             */}
            <CalendarVisibilityNotice />

            {/*
             * Publication analysis sits above the grid: knowing that a week is
             * still a draft changes how a manager reads every cell below it.
             */}
            <CalendarPublicationSummary
                stats={publicationStats}
                isLoading={shiftsQuery.isLoading}
            />



            {/* Selection / clipboard status bar: only present when it has something to say. */}
            {selectionCount > 0 || clipboard.isArmed ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-2.5">
                    <p className="text-sm text-foreground">
                        {clipboard.isArmed ? (
                            <>
                                <span className="font-medium">
                                    {clipboard.payload?.entries.length} shift
                                    {clipboard.payload?.entries.length === 1 ? '' : 's'} copied
                                </span>
                                {selectionCount > 0
                                    ? ` · pasting into ${selectionCount} selected day${selectionCount === 1 ? '' : 's'}`
                                    : ' · click the paste icon on any day'}
                            </>
                        ) : (
                            `${selectionCount} day${selectionCount === 1 ? '' : 's'} selected`
                        )}
                    </p>

                    {isBulkSaving ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            Saving…
                        </span>
                    ) : null}

                    <button
                        type="button"
                        onClick={clipboard.clear}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Clear
                    </button>
                </div>
            ) : null}

            {/* Data states */}
            {shiftsQuery.isError ? (
                <div className="space-y-3">
                    <ErrorAlert
                        title="Calendar unavailable"
                        message="We couldn't load the roster calendar. Your shifts are safe — this is a read error."
                    />
                    <button
                        type="button"
                        onClick={() => void shiftsQuery.refetch()}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : shiftsQuery.isLoading ? (
                <div aria-busy="true" className="grid grid-cols-1 gap-2 md:grid-cols-7">

                    {Array.from({ length: 28 }, (_, index) => (
                        <div key={index} className="h-28 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
            ) : (
                <>
                    <RosterMonthGrid
                        weeks={weeks}
                        contentMode={contentMode}
                        showBranchNames={branchFilter === ''}
                        isPasteArmed={clipboard.isArmed}
                        selectedDates={clipboard.selectedDates}
                        copySourceDate={clipboard.sourceDate}
                        onAddShift={setWizardDate}
                        onCopy={handleCopy}
                        onPaste={(date) => void handlePaste(date)}
                        onEditShift={(shift) => navigate(`/shifts?highlight=${shift.id}`)}
                        onDeleteShift={setShiftPendingDelete}
                        onToggleSelect={clipboard.toggleSelection}
                        onViewDay={(date) => {
                            setCursor(parseISO(date));
                            setView('day');
                        }}
                        // A branch chip drills into that branch's weekly roster
                        // workspace, where its shifts are actually edited.
                        onViewRoster={(rosterId) => navigate(`/rosters/${rosterId}`)}
                        onEditBranchDay={(summary, date) =>
                            setBranchDayEditing({ summary, date })
                        }
                        onDeleteBranchDay={(summary, date) =>
                            setBranchDayPendingDelete({ summary, date })
                        }
                        // A cell can only show three branches; the rest are read
                        // in place rather than by leaving the month behind.
                        onViewAllBranches={(day) => setBranchListDate(day.date)}
                        onViewWeek={(weekStart) => {


                            setCursor(parseISO(weekStart));
                            setView('week');
                        }}
                        // Month cells show aggregated branches, not draggable
                        // shift chips, so drag-to-reschedule is only wired up
                        // where an individual shift is actually rendered.
                        {...(contentMode === 'shifts'
                            ? {
                                onShiftDragStart: setDraggedShift,
                                onShiftDragEnd: () => setDraggedShift(null),
                                onDropShift: (date: string) => void handleDropShift(date),
                            }
                            : {})}
                    />

                    {/* An empty month is a legitimate state, not an error. */}
                    {!hasAnyShift ? (
                        <EmptyState
                            icon={CalendarDays}
                            title="No shifts in this period"
                            description={
                                branchFilter || statusFilter
                                    ? 'No shifts match the current filters. Try widening them, or add a shift from any day.'
                                    : 'Hover any day and use the + button to roster your first shifts.'
                            }
                        />
                    ) : null}
                </>
            )}

            <AddShiftWizard
                open={wizardDate !== null}
                onOpenChange={(open) => {
                    if (!open) setWizardDate(null);
                }}
                date={wizardDate}
                presetBranchId={branchFilter || null}
                branchWeekStatuses={branchWeekStatuses}
                onSubmit={handleAddShifts}
                isSubmitting={isBulkSaving}
            />


            {/* Destructive actions always confirm first. */}
            <AlertDialog
                open={shiftPendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setShiftPendingDelete(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {shiftPendingDelete
                                ? `${shiftPendingDelete.employee?.name ?? 'This open shift'} on ${shiftPendingDelete.date} (${shiftPendingDelete.startTime}–${shiftPendingDelete.endTime}) will be permanently removed. This cannot be undone.`
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className={cn(
                                'inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground',
                                'transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            )}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleConfirmDelete()}
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Delete shift
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Staffing + publication for one branch-day, opened from a chip. */}
            <BranchDayEditorDialog
                open={branchDayEditing !== null}
                onOpenChange={(open) => {
                    if (!open) setBranchDayEditing(null);
                }}
                summary={branchDayEditing?.summary ?? null}
                date={branchDayEditing?.date ?? null}
                isSaving={isBulkSaving}
                onSubmit={handleBranchDaySave}
            />

            {/*
             * Every branch on one day, opened from a cell's `+N more` so the
             * overflow can be read without abandoning the month view.
             */}
            <BranchDayListDialog
                open={branchListDate !== null}
                onOpenChange={(open) => {
                    if (!open) setBranchListDate(null);
                }}
                date={branchListDate}
                summaries={branchListSummaries}
                onOpenRoster={(rosterId) => navigate(`/rosters/${rosterId}`)}
                onOpenDay={(date) => {
                    setCursor(parseISO(date));
                    setView('day');
                }}
                onEdit={(summary, date) => setBranchDayEditing({ summary, date })}
                onDelete={(summary, date) => setBranchDayPendingDelete({ summary, date })}
            />


            {/*
             * Clearing a branch-day removes several shifts at once, so the
             * confirmation states the exact count and warns when staff have
             * already been told about them.
             */}
            <AlertDialog
                open={branchDayPendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setBranchDayPendingDelete(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Clear {branchDayPendingDelete?.summary.branchName} on this day?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {branchDayPendingDelete
                                ? `All ${branchDayPendingDelete.summary.shiftCount} shift${branchDayPendingDelete.summary.shiftCount === 1 ? '' : 's'} for this branch on ${branchDayPendingDelete.date} will be permanently removed. This cannot be undone.${branchDayPendingDelete.summary.rosterStatus === 'published'
                                    ? ' This roster is already published, so rostered staff will lose shifts they have been notified about.'
                                    : ''
                                }`
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className={cn(
                                'inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground',
                                'transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            )}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleConfirmBranchDayDelete()}
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Clear day
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

