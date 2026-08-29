import * as Dialog from '@radix-ui/react-dialog';
import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import {
    AlertTriangle,
    Building2,
    Check,
    EyeOff,
    Loader2,
    Lock,
    PencilRuler,
    Search,
    Send,
    Users,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useBranchOptions, useBranches } from '@/features/branches/hooks/useBranches';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { cn } from '@/lib/utils';
import type { Weekday } from '@/types/branch';
import type { Employee } from '@/types/employee';
import type { RosterStatus } from '@/types/roster-management';

import { branchWeekKey } from '../lib/month-grid';

/** Fallback window used when an employee has no stored availability. */
const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

/** The wizard's steps, in order. */
const STEPS = [
    { index: 1 as const, label: 'Branch' },
    { index: 2 as const, label: 'Employees' },
    { index: 3 as const, label: 'Visibility' },
] as const;

/** A wizard step number. */
type WizardStep = (typeof STEPS)[number]['index'];

/**
 * What the manager wants staff to see once the shifts are saved.
 *
 * Deliberately *not* the shift's own lifecycle status (`scheduled`, `completed`,
 * …): visibility is a property of the roster week the shifts land in, and it is
 * the only one an employee experiences.
 */
export type ShiftVisibility = 'draft' | 'published';

/** One employee's draft assignment inside step 2. */
interface DraftAssignment {
    employeeId: string;
    startTime: string;
    endTime: string;
    /**
     * Break length in minutes. `null` until the branch's default is resolved or
     * the manager edits it, so an untouched field always submits the live default.
     */
    breakMinutes: number | null;
    /** Whether the break is paid. `null` until resolved or edited, like above. */
    isPaidBreak: boolean | null;
}

/** A finalized assignment with break defaults resolved, emitted on submit. */
interface FinalizedAssignment {
    employeeId: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    isPaidBreak: boolean;
}

/** Resolved break policy shown as the pre-fill value for every un-edited row. */
interface BreakDefaults {
    breakMinutes: number;
    isPaidBreak: boolean;
}

/** Payload emitted once the manager confirms the wizard. */
export interface AddShiftSubmission {
    branchId: string;
    date: string;
    assignments: FinalizedAssignment[];
    /** The visibility the manager chose in step 3. */
    visibility: ShiftVisibility;
    /**
     * True when the owning roster week must be published after the shifts are
     * created.
     *
     * Distinct from `visibility === 'published'`: a week that is *already*
     * published needs no second publish (the API rejects it), yet the new shifts
     * are still immediately visible. The page therefore uses this flag for the
     * mutation and `visibility` for what it tells the user.
     */
    publish: boolean;
}

interface AddShiftWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** ISO date (`yyyy-MM-dd`) the shifts will be created on. */
    date: string | null;
    /**
     * Branch pre-selected from the page filter. When set, step 1 is skipped
     * because the choice is already unambiguous.
     */
    presetBranchId: string | null;
    /**
     * Publication state of each branch-week currently on the calendar, keyed by
     * `branchWeekKey(branchId, date)`.
     *
     * Lets step 3 state what saving will actually do without another request: an
     * absent key means no roster exists yet, so a fresh draft week will be opened.
     */
    branchWeekStatuses: ReadonlyMap<string, RosterStatus>;
    onSubmit: (submission: AddShiftSubmission) => Promise<void>;
    isSubmitting: boolean;
}

/** One selectable employee row shared by both step-2 columns. */
interface EmployeeListItemProps {
    employee: Employee;
    assignment: DraftAssignment | undefined;
    /**
     * Resolve the break policy that applies to a given employee's *own* branch
     * for the shift's date. Passed in so each row pre-fills from its own branch
     * rather than inheriting the selected branch's policy.
     */
    resolveBreakDefaults: (employeeBranchId: string | null) => BreakDefaults;
    onToggle: (employeeId: string) => void;
    onUpdateTime: (employeeId: string, field: 'startTime' | 'endTime', value: string) => void;
    onUpdateBreakMinutes: (employeeId: string, value: string) => void;
    onUpdateBreakStatus: (employeeId: string, isPaidBreak: boolean) => void;
}

function EmployeeListItem({
    employee,
    assignment,
    resolveBreakDefaults,
    onToggle,
    onUpdateTime,
    onUpdateBreakMinutes,
    onUpdateBreakStatus,
}: EmployeeListItemProps): JSX.Element {
    const isSelected = Boolean(assignment);
    // Untouched rows show (and submit) the employee's own branch's default for
    // the date — never the selected branch's policy.
    const defaults = resolveBreakDefaults(employee.branchId);
    const breakMinutes = assignment?.breakMinutes ?? defaults.breakMinutes;
    const isPaidBreak = assignment?.isPaidBreak ?? defaults.isPaidBreak;

    return (
        <li
            className={cn(
                'rounded-lg border p-2.5 transition-colors',
                isSelected ? 'border-primary bg-primary/5' : 'border-border',
            )}
        >
            <div className="flex items-center gap-3">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(employee.id)}
                    aria-label={`Roster ${employee.name}`}
                    className="h-4 w-4 shrink-0 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />

                <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                        <span className="truncate">{employee.name}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <Building2 className="h-3 w-3" aria-hidden="true" />
                            {employee.branchName ?? 'Unassigned Branch'}
                        </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{employee.position}</p>
                </div>
            </div>

            {/*
             * Times + break inputs. Always rendered so every row lines up, but
             * they only activate once the person is selected. The row splits
             * into three equal visual zones (time range / break minutes / break
             * status) so both columns share identical alignment.
             */}
            <div className="mt-2 grid grid-cols-3 items-center gap-2 pl-7">
                <div className="flex min-w-0 items-center gap-1">
                    <input
                        type="time"
                        value={assignment?.startTime ?? DEFAULT_START}
                        disabled={!isSelected}
                        onChange={(event) => onUpdateTime(employee.id, 'startTime', event.target.value)}
                        aria-label={`Start time for ${employee.name}`}
                        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    />
                    <span className="shrink-0 text-xs text-muted-foreground" aria-hidden="true">
                        –
                    </span>
                    <input
                        type="time"
                        value={assignment?.endTime ?? DEFAULT_END}
                        disabled={!isSelected}
                        onChange={(event) => onUpdateTime(employee.id, 'endTime', event.target.value)}
                        aria-label={`End time for ${employee.name}`}
                        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    />
                </div>

                <label className="flex items-center justify-center gap-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Break</span>
                    <input
                        type="number"
                        min={0}
                        step={5}
                        value={breakMinutes}
                        disabled={!isSelected}
                        onChange={(event) => onUpdateBreakMinutes(employee.id, event.target.value)}
                        aria-label={`Break minutes for ${employee.name}`}
                        className="h-8 w-16 rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    />
                    <span className="text-[11px] text-muted-foreground">min</span>
                </label>

                <select
                    value={isPaidBreak ? 'paid' : 'unpaid'}
                    disabled={!isSelected}
                    onChange={(event) => onUpdateBreakStatus(employee.id, event.target.value === 'paid')}
                    aria-label={`Break status for ${employee.name}`}
                    className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                >
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                </select>
            </div>
        </li>
    );
}

/** A self-contained, independently scrolling employee column for step 2. */
interface EmployeeColumnProps {
    title: string;
    searchInputId: string;
    searchPlaceholder: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    employees: Employee[];
    assignments: ReadonlyMap<string, DraftAssignment>;
    /**
     * Resolve the break policy that applies to a given employee's *own* branch
     * for the shift's date, so no row inherits another branch's defaults.
     */
    resolveBreakDefaults: (employeeBranchId: string | null) => BreakDefaults;
    isLoading: boolean;
    emptyMessage: string;
    noResultsMessage: string;
    onToggle: (employeeId: string) => void;
    onUpdateTime: (employeeId: string, field: 'startTime' | 'endTime', value: string) => void;
    onUpdateBreakMinutes: (employeeId: string, value: string) => void;
    onUpdateBreakStatus: (employeeId: string, isPaidBreak: boolean) => void;
}

function EmployeeColumn({
    title,
    searchInputId,
    searchPlaceholder,
    searchValue,
    onSearchChange,
    employees,
    assignments,
    resolveBreakDefaults,
    isLoading,
    emptyMessage,
    noResultsMessage,
    onToggle,
    onUpdateTime,
    onUpdateBreakMinutes,
    onUpdateBreakStatus,
}: EmployeeColumnProps): JSX.Element {
    const isSearching = searchValue.trim().length > 0;

    return (
        <section className="flex min-h-0 flex-col gap-2.5 lg:flex-1">
            <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-2.5 py-1.5">
                <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="truncate">{title}</span>
                </h3>
                {!isLoading ? (
                    <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {employees.length}
                    </span>
                ) : null}
            </div>

            <label htmlFor={searchInputId} className="sr-only">
                {searchPlaceholder}
            </label>
            <div className="relative">
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <input
                    id={searchInputId}
                    type="search"
                    value={searchValue}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={searchPlaceholder}
                    className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
            </div>

            {/*
             * Aligned column labels for the input row each employee renders, so
             * the time range, break minutes and break status stay readable and
             * line up identically in both columns.
             */}
            <div className="grid grid-cols-3 items-center gap-2 pl-7 pr-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Time
                </span>
                <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Break
                </span>
                <span className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {isLoading ? (
                    <div className="space-y-2" aria-busy="true">
                        {[0, 1, 2, 3].map((key) => (
                            <div key={key} className="h-14 animate-pulse rounded-lg bg-muted" />
                        ))}
                    </div>
                ) : employees.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        {isSearching ? noResultsMessage : emptyMessage}
                    </p>
                ) : (
                    <ul className="space-y-1.5">
                        {employees.map((employee) => (
                            <EmployeeListItem
                                key={employee.id}
                                employee={employee}
                                assignment={assignments.get(employee.id)}
                                resolveBreakDefaults={resolveBreakDefaults}
                                onToggle={onToggle}
                                onUpdateTime={onUpdateTime}
                                onUpdateBreakMinutes={onUpdateBreakMinutes}
                                onUpdateBreakStatus={onUpdateBreakStatus}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

/**
 * Three-step "add shifts" flow launched from a calendar cell.
 *
 * **Step 1 — branch.** A month cell spans every branch, so the target branch is
 * genuinely ambiguous and must be chosen before anything else; it also determines
 * which weekly roster the new shifts join. Skipped when the page is already
 * filtered to one branch.
 *
 * **Step 2 — employees + times.** Search, tick people, and adjust their hours.
 * Time inputs stay disabled until a row is ticked so the form cannot collect
 * times for someone who is not being rostered.
 *
 * **Step 3 — visibility.** Saving a shift and *telling staff about it* are two
 * different decisions, and conflating them causes the two worst outcomes in
 * rostering: a finished roster nobody was told about, or a notification sent for
 * a plan that was still being drafted. The step therefore makes the choice
 * explicit and states its consequence — draft stays invisible, publishing
 * notifies everyone rostered that week and cannot be undone.
 */
export function AddShiftWizard({
    open,
    onOpenChange,
    date,
    presetBranchId,
    branchWeekStatuses,
    onSubmit,
    isSubmitting,
}: AddShiftWizardProps): JSX.Element | null {
    const [step, setStep] = useState<WizardStep>(1);
    const [branchId, setBranchId] = useState<string | null>(null);
    const [branchSearch, setBranchSearch] = useState('');
    const [branchEmployeeSearch, setBranchEmployeeSearch] = useState('');
    const [otherEmployeeSearch, setOtherEmployeeSearch] = useState('');
    const [assignments, setAssignments] = useState<Map<string, DraftAssignment>>(new Map());
    const [visibility, setVisibility] = useState<ShiftVisibility>('draft');

    const branchesQuery = useBranchOptions();
    // Both step-2 columns derive from the full directory so the manager can see
    // everyone in the company, not just those already assigned to this branch.
    const employeesQuery = useEmployees();

    /**
     * Full break policy for *every* branch (defaults + per-day overrides), so
     * step 2 can pre-fill each employee from their own branch rather than
     * inheriting the selected branch's policy.
     *
     * `useBranches` paginates, so the page is sized to the whole company
     * (100/page, the same ceiling `useBranchOptions` uses elsewhere). The list
     * endpoint returns the full `Branch` shape — including break settings — so
     * no per-branch detail request is needed.
     */
    const branchesData = useBranches({ status: 'active', perPage: 100 });

    /**
     * Resolve one branch's break policy for the shift's date.
     *
     * A branch stores a general default (`defaultBreakMinutes` /
     * `defaultBreakPaid`) plus optional per-weekday overrides (`daySchedules`).
     * The weekday of the wizard's date is resolved first so a day-specific
     * setting wins, falling back to the branch default when the day is not
     * customised — the same rule the backend's `scheduleForWeekday` applies.
     */
    const breakDefaultsByBranch = useMemo(() => {
        const weekday = date
            ? (format(parseISO(date), 'EEEE').toLowerCase() as Weekday)
            : null;

        const map = new Map<string, BreakDefaults>();
        for (const branch of branchesData.data?.data ?? []) {
            const day = weekday ? branch.daySchedules?.[weekday] : undefined;
            map.set(branch.id, {
                breakMinutes: day?.breakMinutes ?? branch.defaultBreakMinutes ?? 0,
                isPaidBreak: day?.breakPaid ?? branch.defaultBreakPaid ?? false,
            });
        }
        return map;
    }, [branchesData.data, date]);

    /**
     * Resolve the break policy that applies to the *selected* branch for the
     * shift's date. Used only as the fallback for employees with no branch.
     */
    const selectedBranchBreakDefaults = useMemo<BreakDefaults>(() => {
        if (branchId) {
            const known = breakDefaultsByBranch.get(branchId);
            if (known) return known;
        }
        return { breakMinutes: 0, isPaidBreak: false };
    }, [branchId, breakDefaultsByBranch]);

    /**
     * Per-employee break defaults: each employee uses their own branch's
     * resolved policy; an employee without a branch is being rostered at the
     * selected branch, so that policy is the fallback.
     */
    const resolveBreakDefaults = useCallback(
        (employeeBranchId: string | null): BreakDefaults => {
            if (employeeBranchId) {
                const known = breakDefaultsByBranch.get(employeeBranchId);
                if (known) return known;
            }
            return selectedBranchBreakDefaults;
        },
        [breakDefaultsByBranch, selectedBranchBreakDefaults],
    );

    // Reset to a clean slate whenever the wizard is reopened on a new cell.
    // Draft is the default on purpose: it is the reversible choice, and a
    // notification sent by accident cannot be recalled.
    useEffect(() => {
        if (!open) return;
        setBranchId(presetBranchId);
        setStep(presetBranchId ? 2 : 1);
        setBranchSearch('');
        setBranchEmployeeSearch('');
        setOtherEmployeeSearch('');
        setAssignments(new Map());
        setVisibility('draft');
    }, [open, presetBranchId]);

    const branches = useMemo(() => {
        const all = branchesQuery.data ?? [];
        const term = branchSearch.trim().toLowerCase();
        return term ? all.filter((branch) => branch.name.toLowerCase().includes(term)) : all;
    }, [branchesQuery.data, branchSearch]);

    const activeEmployees = useMemo(
        () => (employeesQuery.data ?? []).filter((employee) => employee.status === 'active'),
        [employeesQuery.data],
    );

    /** Employees already rostered at the selected branch (left column). */
    const branchEmployees = useMemo(() => {
        const term = branchEmployeeSearch.trim().toLowerCase();
        const scoped = activeEmployees.filter((employee) => employee.branchId === branchId);
        return term
            ? scoped.filter(
                (employee) =>
                    employee.name.toLowerCase().includes(term) ||
                    employee.position.toLowerCase().includes(term),
            )
            : scoped;
    }, [activeEmployees, branchEmployeeSearch, branchId]);

    /** Every other active employee — other branches or no branch at all (right column). */
    const otherEmployees = useMemo(() => {
        const term = otherEmployeeSearch.trim().toLowerCase();
        const scoped = activeEmployees.filter((employee) => employee.branchId !== branchId);
        return term
            ? scoped.filter(
                (employee) =>
                    employee.name.toLowerCase().includes(term) ||
                    employee.position.toLowerCase().includes(term),
            )
            : scoped;
    }, [activeEmployees, otherEmployeeSearch, branchId]);

    /**
     * Publication state of the roster week these shifts will join, or `null` when
     * that week does not exist yet (it will be created as a draft).
     */
    const existingWeekStatus = useMemo<RosterStatus | null>(() => {
        if (!branchId || !date) return null;
        return branchWeekStatuses.get(branchWeekKey(branchId, date)) ?? null;
    }, [branchId, branchWeekStatuses, date]);

    /** Monday–Sunday label of the roster week publishing would cover. */
    const weekRangeLabel = useMemo(() => {
        if (!date) return '';

        const parsed = parseISO(date);
        const start = startOfWeek(parsed, { weekStartsOn: 1 });
        const end = endOfWeek(parsed, { weekStartsOn: 1 });

        return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
    }, [date]);

    const isAlreadyPublished = existingWeekStatus === 'published';
    const isArchivedWeek = existingWeekStatus === 'archived';

    // An already-published week cannot host hidden shifts, and an archived week
    // cannot be published at all — in both cases the choice is not the manager's
    // to make, so it is locked and explained rather than silently ignored.
    const isVisibilityLocked = isAlreadyPublished || isArchivedWeek;

    /** What staff will end up seeing, accounting for the locked cases. */
    const effectiveVisibility: ShiftVisibility = isAlreadyPublished
        ? 'published'
        : isArchivedWeek
            ? 'draft'
            : visibility;

    const toggleEmployee = (employeeId: string): void => {
        setAssignments((current) => {
            const next = new Map(current);
            if (next.has(employeeId)) {
                next.delete(employeeId);
            } else {
                next.set(employeeId, {
                    employeeId,
                    startTime: DEFAULT_START,
                    endTime: DEFAULT_END,
                    // Break fields start unresolved (`null`) so the live branch
                    // default is applied unless the manager edits them.
                    breakMinutes: null,
                    isPaidBreak: null,
                });
            }
            return next;
        });
    };

    const updateTime = (employeeId: string, field: 'startTime' | 'endTime', value: string): void => {
        setAssignments((current) => {
            const existing = current.get(employeeId);
            if (!existing) return current;
            const next = new Map(current);
            next.set(employeeId, { ...existing, [field]: value });
            return next;
        });
    };

    const updateBreakMinutes = (employeeId: string, value: string): void => {
        // Breaks are non-negative minutes; anything invalid resets to zero.
        const parsed = Number(value);
        const breakMinutes = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;

        setAssignments((current) => {
            const existing = current.get(employeeId);
            if (!existing) return current;
            const next = new Map(current);
            next.set(employeeId, { ...existing, breakMinutes });
            return next;
        });
    };

    const updateBreakStatus = (employeeId: string, isPaidBreak: boolean): void => {
        setAssignments((current) => {
            const existing = current.get(employeeId);
            if (!existing) return current;
            const next = new Map(current);
            next.set(employeeId, { ...existing, isPaidBreak });
            return next;
        });
    };

    const handleSubmit = async (): Promise<void> => {
        if (!branchId || !date || assignments.size === 0) return;

        // Each employee's own branch decides their break defaults, so an
        // untouched field resolves against that employee's policy — not the
        // selected branch's. Employees without a branch fall back to the
        // selected branch, since that is the branch their shift is created for.
        const employeeBranchIds = new Map<string, string | null>(
            activeEmployees.map((employee) => [employee.id, employee.branchId]),
        );

        const finalize = (assignment: DraftAssignment): FinalizedAssignment => {
            const defaults = resolveBreakDefaults(
                employeeBranchIds.get(assignment.employeeId) ?? null,
            );
            return {
                employeeId: assignment.employeeId,
                startTime: assignment.startTime,
                endTime: assignment.endTime,
                // Untouched break fields fall back to the employee's own branch
                // default so the stored shift always carries a concrete policy.
                breakMinutes: assignment.breakMinutes ?? defaults.breakMinutes,
                isPaidBreak: assignment.isPaidBreak ?? defaults.isPaidBreak,
            };
        };

        await onSubmit({
            branchId,
            date,
            assignments: [...assignments.values()].map(finalize),
            visibility: effectiveVisibility,
            // Publishing an already-published week is rejected by the API, and an
            // archived week must not be reopened from here.
            publish: effectiveVisibility === 'published' && !isVisibilityLocked,
        });
    };

    if (!date) return null;

    const readableDate = format(parseISO(date), 'EEEE d MMMM yyyy');
    const selectedBranchName = branches.find((branch) => branch.id === branchId)?.name;
    const assignmentCount = assignments.size;

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-xl focus:outline-none">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                        <div className="min-w-0">
                            <Dialog.Title className="text-lg font-semibold text-foreground">
                                Add shifts
                            </Dialog.Title>
                            <Dialog.Description className="truncate text-sm text-muted-foreground">
                                {readableDate}
                                {selectedBranchName ? ` · ${selectedBranchName}` : ''}
                            </Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                aria-label="Close"
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </Dialog.Close>
                    </div>

                    {/* Step indicator */}
                    <ol className="flex items-center gap-2 border-b border-border px-5 py-3">
                        {STEPS.map((item) => (
                            <li key={item.index} className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                                        step >= item.index
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-secondary text-muted-foreground',
                                    )}
                                >
                                    {step > item.index ? (
                                        <Check className="h-3 w-3" aria-hidden="true" />
                                    ) : (
                                        item.index
                                    )}
                                </span>
                                <span
                                    className={cn(
                                        'text-sm',
                                        step >= item.index
                                            ? 'font-medium text-foreground'
                                            : 'text-muted-foreground',
                                    )}
                                >
                                    {item.label}
                                </span>
                                {item.index < STEPS.length ? (
                                    <span
                                        className="mx-1 hidden h-px w-6 bg-border sm:block"
                                        aria-hidden="true"
                                    />
                                ) : null}
                            </li>
                        ))}
                    </ol>

                    {/*
                     * Body: steps 1 & 3 scroll the whole area; step 2 constrains
                     * itself to the available height (flex + overflow-hidden) so
                     * each of its two columns scrolls independently instead of
                     * the whole dialog scrolling as one.
                     */}
                    <div
                        className={cn(
                            'flex-1 p-5',
                            step === 2
                                ? 'flex min-h-0 flex-col overflow-hidden'
                                : 'overflow-y-auto',
                        )}
                    >
                        {step === 1 ? (
                            <div className="space-y-3">
                                <label htmlFor="branch-search" className="sr-only">
                                    Search branches
                                </label>
                                <div className="relative">
                                    <Search
                                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                    <input
                                        id="branch-search"
                                        type="search"
                                        value={branchSearch}
                                        onChange={(event) => setBranchSearch(event.target.value)}
                                        placeholder="Search branches..."
                                        className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                </div>

                                {branchesQuery.isLoading ? (
                                    <div className="space-y-2" aria-busy="true">
                                        {[0, 1, 2].map((key) => (
                                            <div
                                                key={key}
                                                className="h-12 animate-pulse rounded-lg bg-muted"
                                            />
                                        ))}
                                    </div>
                                ) : branches.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">
                                        No branches match your search.
                                    </p>
                                ) : (
                                    <ul className="space-y-1.5">
                                        {branches.map((branch) => (
                                            <li key={branch.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setBranchId(branch.id);
                                                        setStep(2);
                                                    }}
                                                    className={cn(
                                                        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                        branchId === branch.id
                                                            ? 'border-primary bg-primary/5'
                                                            : 'border-border hover:bg-secondary',
                                                    )}
                                                >
                                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                        <Building2
                                                            className="h-4 w-4"
                                                            aria-hidden="true"
                                                        />
                                                    </span>
                                                    <span className="truncate text-sm font-medium text-foreground">
                                                        {branch.name}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ) : step === 2 ? (
                            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:grid lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:gap-0 lg:overflow-hidden">
                                <div className="flex min-h-0 flex-col lg:pr-5">
                                    <EmployeeColumn
                                        title={`${selectedBranchName ?? 'This branch'} employees`}
                                        searchInputId="branch-employee-search"
                                        searchPlaceholder="Search this branch..."
                                        searchValue={branchEmployeeSearch}
                                        onSearchChange={setBranchEmployeeSearch}
                                        employees={branchEmployees}
                                        assignments={assignments}
                                        isLoading={employeesQuery.isLoading}
                                        emptyMessage="No active employees are assigned to this branch."
                                        noResultsMessage="No employees in this branch match your search."
                                        onToggle={toggleEmployee}
                                        onUpdateTime={updateTime}
                                        onUpdateBreakMinutes={updateBreakMinutes}
                                        onUpdateBreakStatus={updateBreakStatus}
                                        resolveBreakDefaults={resolveBreakDefaults}
                                    />
                                </div>
                                <div className="flex min-h-0 flex-col lg:border-l lg:border-border lg:pl-5">
                                    <EmployeeColumn
                                        title="Other employees"
                                        searchInputId="other-employee-search"
                                        searchPlaceholder="Search other employees..."
                                        searchValue={otherEmployeeSearch}
                                        onSearchChange={setOtherEmployeeSearch}
                                        employees={otherEmployees}
                                        assignments={assignments}
                                        isLoading={employeesQuery.isLoading}
                                        emptyMessage="No other active employees are available."
                                        noResultsMessage="No other employees match your search."
                                        onToggle={toggleEmployee}
                                        onUpdateTime={updateTime}
                                        onUpdateBreakMinutes={updateBreakMinutes}
                                        onUpdateBreakStatus={updateBreakStatus}
                                        resolveBreakDefaults={resolveBreakDefaults}
                                    />
                                </div>
                            </div>
                        ) : (
                            /* ---------------------------------------------- */
                            /* Step 3 — visibility                            */
                            /* ---------------------------------------------- */
                            <div className="space-y-4">
                                {/* A short recap keeps the final decision in context. */}
                                <div className="rounded-lg border border-border bg-muted/40 p-3">
                                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        <Users
                                            className="h-4 w-4 shrink-0 text-muted-foreground"
                                            aria-hidden="true"
                                        />
                                        {assignmentCount} shift{assignmentCount === 1 ? '' : 's'} ready
                                        to save
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {readableDate}
                                        {selectedBranchName ? ` · ${selectedBranchName}` : ''}
                                    </p>
                                </div>

                                <fieldset
                                    disabled={isVisibilityLocked}
                                    className="space-y-2 disabled:opacity-100"
                                >
                                    <legend className="mb-2 text-sm font-semibold text-foreground">
                                        Who can see these shifts?
                                    </legend>

                                    <label
                                        className={cn(
                                            'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                                            effectiveVisibility === 'draft'
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:bg-secondary/50',
                                            isVisibilityLocked && 'cursor-not-allowed opacity-60',
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="add-shift-visibility"
                                            value="draft"
                                            checked={effectiveVisibility === 'draft'}
                                            disabled={isVisibilityLocked}
                                            onChange={() => setVisibility('draft')}
                                            className="mt-0.5 h-4 w-4 shrink-0 border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        />
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                                <PencilRuler
                                                    className="h-3.5 w-3.5 text-muted-foreground"
                                                    aria-hidden="true"
                                                />
                                                Save as draft
                                            </span>
                                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                                Only your management team can see them. Staff are
                                                not notified — publish once the week is final.
                                            </span>
                                        </span>
                                    </label>

                                    <label
                                        className={cn(
                                            'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                                            effectiveVisibility === 'published'
                                                ? 'border-success bg-success/5'
                                                : 'border-border hover:bg-secondary/50',
                                            isVisibilityLocked && 'cursor-not-allowed opacity-60',
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="add-shift-visibility"
                                            value="published"
                                            checked={effectiveVisibility === 'published'}
                                            disabled={isVisibilityLocked}
                                            onChange={() => setVisibility('published')}
                                            className="mt-0.5 h-4 w-4 shrink-0 border-input text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        />
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                                <Send
                                                    className="h-3.5 w-3.5 text-success"
                                                    aria-hidden="true"
                                                />
                                                Publish to staff
                                            </span>
                                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                                Everyone rostered is notified and the shifts appear
                                                in their app straight away.
                                            </span>
                                        </span>
                                    </label>
                                </fieldset>

                                {/*
                                 * Publishing is irreversible and covers the branch's whole
                                 * ISO week, not just this day — saying so prevents a nasty
                                 * surprise after the fact.
                                 */}
                                {!isVisibilityLocked && visibility === 'published' ? (
                                    <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-foreground">
                                        <AlertTriangle
                                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                                            aria-hidden="true"
                                        />
                                        Publishing applies to this branch's whole roster week
                                        ({weekRangeLabel}) and cannot be undone.
                                    </p>
                                ) : null}

                                {isAlreadyPublished ? (
                                    <p className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-xs text-foreground">
                                        <Send
                                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                                            aria-hidden="true"
                                        />
                                        This branch's week ({weekRangeLabel}) is already published,
                                        so these shifts become visible to staff as soon as you save.
                                    </p>
                                ) : null}

                                {isArchivedWeek ? (
                                    <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                                        <Lock
                                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                            aria-hidden="true"
                                        />
                                        This branch's week ({weekRangeLabel}) is archived and kept
                                        for history, so new shifts stay hidden from staff. Reopen the
                                        roster to publish them.
                                    </p>
                                ) : null}

                                {existingWeekStatus === null && visibility === 'draft' ? (
                                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                                        <EyeOff
                                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                            aria-hidden="true"
                                        />
                                        A draft roster week ({weekRangeLabel}) will be opened for
                                        this branch. You can publish it later from any day on the
                                        calendar.
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-3 border-t border-border p-5">
                        <p className="text-sm text-muted-foreground">
                            {step >= 2 && assignmentCount > 0 ? `${assignmentCount} selected` : ''}
                        </p>

                        <div className="flex items-center gap-3">
                            {(step === 2 && !presetBranchId) || step === 3 ? (
                                <button
                                    type="button"
                                    onClick={() => setStep(step === 3 ? 2 : 1)}
                                    disabled={isSubmitting}
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                                >
                                    Back
                                </button>
                            ) : (
                                <Dialog.Close asChild>
                                    <button
                                        type="button"
                                        className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        Cancel
                                    </button>
                                </Dialog.Close>
                            )}

                            {/*
                             * Saving is only ever offered from step 3, so the visibility
                             * decision can never be skipped by accident.
                             */}
                            {step === 3 ? (
                                <button
                                    type="button"
                                    onClick={() => void handleSubmit()}
                                    disabled={assignmentCount === 0 || isSubmitting}
                                    className={cn(
                                        'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60',
                                        effectiveVisibility === 'published'
                                            ? 'bg-success text-success-foreground hover:bg-success/90'
                                            : 'bg-primary text-primary-foreground hover:bg-primary-hover',
                                    )}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2
                                                className="h-4 w-4 animate-spin"
                                                aria-hidden="true"
                                            />
                                            Saving…
                                        </>
                                    ) : effectiveVisibility === 'published' ? (
                                        <>
                                            <Send className="h-4 w-4" aria-hidden="true" />
                                            {isAlreadyPublished
                                                ? 'Save shifts'
                                                : 'Save and publish'}
                                        </>
                                    ) : (
                                        'Save as draft'
                                    )}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setStep(3)}
                                    disabled={step !== 2 || assignmentCount === 0}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                                >
                                    Continue
                                </button>
                            )}
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
