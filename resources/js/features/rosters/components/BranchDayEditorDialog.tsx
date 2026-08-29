import { format, parseISO } from 'date-fns';
import { AlertTriangle, Loader2, Lock, Search, Send, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/Components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { cn } from '@/lib/utils';

import type { BranchDaySummary } from '../lib/month-grid';

/** One shift row after the manager's edits. */
export interface BranchDayShiftDraft {
    shiftId: string;
    /** `null` leaves the shift open (unfilled). */
    employeeId: string | null;
    startTime: string;
    endTime: string;
}

/** What the dialog hands back to the page on save. */
export interface BranchDaySubmission {
    /** Only the rows whose employee or times actually changed. */
    changed: BranchDayShiftDraft[];
    /**
     * True when the manager moved the branch-day from draft to published, which
     * publishes the owning roster and notifies every assigned employee.
     */
    publish: boolean;
}

interface BranchDayEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The branch-day being edited, or `null` while the dialog is closed. */
    summary: BranchDaySummary | null;
    /** ISO date of the branch-day. */
    date: string | null;
    /** True while the save mutations are in flight. */
    isSaving: boolean;
    /** Persists the edits. Resolves once every mutation settles. */
    onSubmit: (summary: BranchDaySummary, submission: BranchDaySubmission) => Promise<void>;
}

const timeFieldClasses = cn(
    'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground tabular-nums',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/** Seeds the editable rows from the branch-day's current shifts. */
function toDrafts(summary: BranchDaySummary | null): BranchDayShiftDraft[] {
    if (!summary) return [];

    return summary.shifts.map((shift) => ({
        shiftId: shift.id,
        employeeId: shift.employeeId,
        startTime: shift.startTime,
        endTime: shift.endTime,
    }));
}

/**
 * Edits one branch's whole day from the month view: who is working, when, and
 * whether staff can see it yet.
 *
 * The month grid aggregates a day to *"is this branch covered?"*, so the natural
 * unit of correction is the same branch-day — not a single shift. Opening a
 * separate page to fill one gap loses the manager's place in the month, so the
 * two decisions that actually matter at this zoom level are brought here:
 *
 * 1. **Staffing** — assign a person to each shift, or leave it open on purpose.
 * 2. **Publication** — a draft is invisible to staff, so a perfectly staffed
 *    draft day is still not a rostered day. Publishing is therefore presented as
 *    an explicit, deliberate choice rather than a side effect of saving.
 *
 * Publishing cannot be undone from here: once employees have been notified,
 * silently reverting to draft would leave them holding a roster the business no
 * longer considers real. That option is disabled and says why.
 */
export function BranchDayEditorDialog({
    open,
    onOpenChange,
    summary,
    date,
    isSaving,
    onSubmit,
}: BranchDayEditorDialogProps): JSX.Element {
    const [drafts, setDrafts] = useState<BranchDayShiftDraft[]>([]);
    const [shouldPublish, setShouldPublish] = useState(false);
    const [employeeSearch, setEmployeeSearch] = useState('');

    const isDraftRoster = summary?.rosterStatus === 'draft';
    const isArchived = summary?.rosterStatus === 'archived';

    // Only this branch's people are offered, so a manager cannot accidentally
    // roster someone who does not work at the site.
    const employeesQuery = useEmployees(
        summary && summary.branchId !== 'unassigned' ? { branchId: summary.branchId } : {},
    );

    // Re-seed whenever a different branch-day is opened, so the form always
    // reflects saved state rather than the previous cell's edits.
    useEffect(() => {
        if (!open) return;

        setDrafts(toDrafts(summary));
        setShouldPublish(false);
        setEmployeeSearch('');
    }, [open, summary]);

    const employees = useMemo(() => {
        const active = (employeesQuery.data ?? []).filter(
            (employee) => employee.status === 'active',
        );
        const term = employeeSearch.trim().toLowerCase();

        if (!term) return active;

        return active.filter(
            (employee) =>
                employee.name.toLowerCase().includes(term) ||
                employee.position.toLowerCase().includes(term),
        );
    }, [employeesQuery.data, employeeSearch]);

    /** Rows whose employee or times differ from what is stored. */
    const changed = useMemo(() => {
        if (!summary) return [];

        return drafts.filter((draft) => {
            const original = summary.shifts.find((shift) => shift.id === draft.shiftId);
            if (!original) return false;

            return (
                original.employeeId !== draft.employeeId ||
                original.startTime !== draft.startTime ||
                original.endTime !== draft.endTime
            );
        });
    }, [drafts, summary]);

    const openRows = drafts.filter((draft) => draft.employeeId === null).length;
    const hasChanges = changed.length > 0 || shouldPublish;

    const updateDraft = (shiftId: string, patch: Partial<BranchDayShiftDraft>): void => {
        setDrafts((current) =>
            current.map((draft) => (draft.shiftId === shiftId ? { ...draft, ...patch } : draft)),
        );
    };

    const handleSubmit = async (): Promise<void> => {
        if (!summary || !hasChanges) return;
        await onSubmit(summary, { changed, publish: shouldPublish });
    };

    const readableDate = date ? format(parseISO(date), 'EEEE d MMMM yyyy') : '';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{summary?.branchName ?? 'Branch'}</DialogTitle>
                    <DialogDescription>
                        {readableDate} · {drafts.length} shift{drafts.length === 1 ? '' : 's'}
                        {openRows > 0 ? ` · ${openRows} unfilled` : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* ---------------------------------------------------------- */}
                    {/* Publication                                                */}
                    {/* ---------------------------------------------------------- */}
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">
                            Visibility to staff
                        </h3>

                        {isArchived ? (
                            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                This week is archived and kept for history. Reopen the roster to
                                change it.
                            </p>
                        ) : (
                            <div
                                role="radiogroup"
                                aria-label="Visibility to staff"
                                className="grid gap-2 sm:grid-cols-2"
                            >
                                <label
                                    className={cn(
                                        'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                                        !shouldPublish
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:bg-secondary/50',
                                        // A published roster can never go back to draft.
                                        !isDraftRoster && 'cursor-not-allowed opacity-60',
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="branch-day-visibility"
                                        checked={!shouldPublish}
                                        disabled={!isDraftRoster}
                                        onChange={() => setShouldPublish(false)}
                                        className="mt-0.5 h-4 w-4 shrink-0 border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-foreground">
                                            Keep as draft
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            {isDraftRoster
                                                ? 'Staff cannot see these shifts yet.'
                                                : 'Already published — staff have been notified.'}
                                        </span>
                                    </span>
                                </label>

                                <label
                                    className={cn(
                                        'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                                        shouldPublish || !isDraftRoster
                                            ? 'border-success bg-success/5'
                                            : 'border-border hover:bg-secondary/50',
                                        !isDraftRoster && 'cursor-not-allowed opacity-60',
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="branch-day-visibility"
                                        checked={shouldPublish || !isDraftRoster}
                                        disabled={!isDraftRoster}
                                        onChange={() => setShouldPublish(true)}
                                        className="mt-0.5 h-4 w-4 shrink-0 border-input text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                                            <Send className="h-3 w-3" aria-hidden="true" />
                                            Publish to staff
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            Notifies everyone rostered this week.
                                        </span>
                                    </span>
                                </label>
                            </div>
                        )}

                        {/*
                         * Publishing sends notifications for the whole roster week,
                         * not just this day — saying so prevents a nasty surprise.
                         */}
                        {shouldPublish ? (
                            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-foreground">
                                <AlertTriangle
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                                    aria-hidden="true"
                                />
                                Publishing applies to this branch's whole roster week and cannot be
                                undone.
                                {openRows > 0
                                    ? ` ${openRows} shift${openRows === 1 ? '' : 's'} will be published unfilled.`
                                    : ''}
                            </p>
                        ) : null}
                    </section>

                    {/* ---------------------------------------------------------- */}
                    {/* Staffing                                                   */}
                    {/* ---------------------------------------------------------- */}
                    <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-foreground">Who is working</h3>

                            <div className="relative w-full sm:w-56">
                                <label htmlFor="branch-day-employee-search" className="sr-only">
                                    Search employees
                                </label>
                                <Search
                                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <input
                                    id="branch-day-employee-search"
                                    type="search"
                                    value={employeeSearch}
                                    onChange={(event) => setEmployeeSearch(event.target.value)}
                                    placeholder="Search employees..."
                                    className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            </div>
                        </div>

                        {employeesQuery.isLoading ? (
                            <div aria-busy="true" className="space-y-2">
                                {Array.from({ length: 3 }, (_, index) => (
                                    <div
                                        key={index}
                                        className="h-14 animate-pulse rounded-lg bg-muted"
                                    />
                                ))}
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {drafts.map((draft) => {
                                    const isOpenShift = draft.employeeId === null;

                                    return (
                                        <li
                                            key={draft.shiftId}
                                            className={cn(
                                                'flex flex-wrap items-center gap-2 rounded-lg border p-2.5',
                                                isOpenShift
                                                    ? 'border-warning/40 bg-warning/5'
                                                    : 'border-border',
                                            )}
                                        >
                                            <UserRound
                                                className={cn(
                                                    'h-4 w-4 shrink-0',
                                                    isOpenShift
                                                        ? 'text-warning'
                                                        : 'text-muted-foreground',
                                                )}
                                                aria-hidden="true"
                                            />

                                            <label
                                                htmlFor={`employee-${draft.shiftId}`}
                                                className="sr-only"
                                            >
                                                Employee for this shift
                                            </label>
                                            <select
                                                id={`employee-${draft.shiftId}`}
                                                value={draft.employeeId ?? ''}
                                                onChange={(event) =>
                                                    updateDraft(draft.shiftId, {
                                                        employeeId: event.target.value || null,
                                                    })
                                                }
                                                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <option value="">Leave open (unfilled)</option>
                                                {employees.map((employee) => (
                                                    <option key={employee.id} value={employee.id}>
                                                        {employee.name} — {employee.position}
                                                    </option>
                                                ))}
                                            </select>

                                            <label
                                                htmlFor={`start-${draft.shiftId}`}
                                                className="sr-only"
                                            >
                                                Start time
                                            </label>
                                            <input
                                                id={`start-${draft.shiftId}`}
                                                type="time"
                                                value={draft.startTime}
                                                onChange={(event) =>
                                                    updateDraft(draft.shiftId, {
                                                        startTime: event.target.value,
                                                    })
                                                }
                                                className={timeFieldClasses}
                                            />

                                            <span
                                                aria-hidden="true"
                                                className="text-xs text-muted-foreground"
                                            >
                                                –
                                            </span>

                                            <label
                                                htmlFor={`end-${draft.shiftId}`}
                                                className="sr-only"
                                            >
                                                End time
                                            </label>
                                            <input
                                                id={`end-${draft.shiftId}`}
                                                type="time"
                                                value={draft.endTime}
                                                onChange={(event) =>
                                                    updateDraft(draft.shiftId, {
                                                        endTime: event.target.value,
                                                    })
                                                }
                                                className={timeFieldClasses}
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {/*
                         * An employee list that is empty because of a search term is
                         * a different problem from a branch with nobody in it, so the
                         * two are reported differently.
                         */}
                        {!employeesQuery.isLoading && employees.length === 0 ? (
                            <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                                {employeeSearch
                                    ? 'No employees match your search.'
                                    : 'No active employees are assigned to this branch yet.'}
                            </p>
                        ) : null}
                    </section>
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSaving}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={!hasChanges || isSaving}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                Saving…
                            </>
                        ) : shouldPublish ? (
                            'Save and publish'
                        ) : (
                            'Save changes'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
