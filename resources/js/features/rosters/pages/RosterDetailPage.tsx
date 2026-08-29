import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { format, parseISO } from 'date-fns';
import {
    AlertTriangle,
    ArrowLeft,
    Building2,
    CalendarRange,
    ChevronRight,
    Clock,
    Columns3,
    History,
    LayoutList,
    Pencil,
    Send,
    Table2,
    Trash2,
    UserRoundX,
    Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import {
    useCreateShift,
    useDeleteShift,
    useUpdateShift,
} from '@/features/shifts/hooks/useShifts';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Roster, RosterGridRow, RosterShift } from '@/types/roster-management';

import { AddEmployeeModal } from '../components/AddEmployeeModal';
import {
    QuickShiftDialog,
    type QuickShiftTarget,
} from '../components/QuickShiftDialog';
import { RosterFormModal } from '../components/RosterFormModal';
import { RosterMatrixGrid } from '../components/RosterMatrixGrid';
import { RosterStatusBadge } from '../components/RosterStatusBadge';
import { RosterWeekGrid } from '../components/RosterWeekGrid';
import { SaveChangesDialog } from '../components/SaveChangesDialog';
import { usePublishedRosterMutations } from '../hooks/usePublishedRosterMutations';
import { useRosterChangeSave } from '../hooks/useRosterChangeSave';
import {
    useDeleteRoster,
    usePublishRoster,
    useRoster,
} from '../hooks/useRosters';
import {
    buildRosterGrid,
    describeWeekOffset,
    formatShiftTimeRange,
    formatWeekRange,
    summarizeWeek,
    timeToMinutes,
    type AddedEmployee,
} from '../lib/roster-week';
import type { Employee } from '@/types/employee';
import {
    DEFAULT_SHIFT_TEMPLATE,
    toShiftMutationInput,
    toShiftTemplateValues,
    type ShiftTemplateValues,
} from '../lib/shift-payload';
import type { QuickShiftValues } from '../quick-shift-schema';


/** Secondary (outline) button styling reused by the header actions. */
const secondaryButtonClasses = cn(
    'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors',
    'hover:bg-secondary hover:text-secondary-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
);

/** Cancel button styling shared by the confirmation dialogs. */
const cancelButtonClasses =
    'inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** The two ways the week can be visualised on this page. */
type WeekView = 'matrix' | 'days';

/** Label used for the unassigned row in dialogs and toasts. */
const OPEN_ROW_LABEL = 'Open shifts';

/** Formats an ISO date as a long, human day label, e.g. `Monday 12 August`. */
function formatDayHeading(date: string | null): string {
    if (!date) {
        return 'this week';
    }

    const parsed = parseISO(date);
    return Number.isNaN(parsed.getTime()) ? date : format(parsed, 'EEEE d MMMM');
}


/** Labels + icons for the week view switcher. */
const WEEK_VIEWS: readonly { value: WeekView; label: string; icon: typeof Table2 }[] = [
    { value: 'matrix', label: 'Staff grid', icon: Table2 },
    { value: 'days', label: 'By day', icon: Columns3 },
] as const;

/** Formats an ISO timestamp for the "published" meta row. */
function formatPublishedAt(value: string | null): string | null {
    if (!value) {
        return null;
    }

    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : format(parsed, "d MMM yyyy 'at' h:mm a");
}

/** Breadcrumb trail: Rosters → current week. */
function Breadcrumb({ label }: { label: string }): JSX.Element {
    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
            <Link
                to="/rosters"
                className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                Rosters
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium text-foreground" aria-current="page">
                {label}
            </span>
        </nav>
    );
}

/** Skeleton shown while the roster detail query is in flight. */
function DetailSkeleton(): JSX.Element {
    return (
        <div className="space-y-6" aria-busy="true" aria-live="polite">
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
                ))}
            </div>
            <div className="h-72 animate-pulse rounded-xl bg-muted" />
        </div>
    );
}

/** Error state with a retry affordance and a route back to the list. */
function DetailError({ onRetry }: { onRetry: () => void }): JSX.Element {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Unable to load this roster</p>
                <p className="text-sm text-muted-foreground">
                    The roster may have been deleted, or the request failed.
                </p>
            </div>
            <div className="flex gap-3">
                <Link to="/rosters" className={secondaryButtonClasses}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to rosters
                </Link>
                <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}

/** Small labelled meta row used in the summary card. */
function MetaRow({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Building2;
    label: string;
    value: string;
}): JSX.Element {
    return (
        <div className="flex items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="truncate text-sm font-medium text-foreground">{value}</p>
            </div>
        </div>
    );
}

/**
 * Roster detail page (`/rosters/:id`).
 *
 * Fetches a single roster with its shifts, then presents the week summary,
 * KPI counters and the read-only {@link RosterWeekGrid} agenda. Editing reuses
 * the shared {@link RosterFormModal}; publish and delete run through their
 * dedicated mutations behind confirmation dialogs, always with toast feedback.
 * Loading, error and not-found states are handled explicitly.
 */
export function RosterDetailPage(): JSX.Element {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [isEditOpen, setIsEditOpen] = useState(false);
    const [confirmPublish, setConfirmPublish] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    // New state to control the Add Employees modal
    const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
    // Employees added locally via the "Add employees" dialog; they render as
    // rows with empty shift cells until shifts are scheduled for them.
    const [addedEmployees, setAddedEmployees] = useState<AddedEmployee[]>([]);
    // The staff matrix is the primary planning view; "By day" stays available
    // for managers who think in columns rather than in people.
    const [weekView, setWeekView] = useState<WeekView>('matrix');

    // Quick shift editor (create from a cell, or edit an existing block).
    const [quickTarget, setQuickTarget] = useState<QuickShiftTarget | null>(null);
    const [isQuickOpen, setIsQuickOpen] = useState(false);
    // Shift pending deletion, held while the confirmation dialog is open.
    const [shiftToDelete, setShiftToDelete] = useState<RosterShift | null>(null);
    // Employee (grid row) pending removal, held while the confirmation dialog
    // is open. Deleting an employee removes every one of their shifts for the
    // whole week.
    const [employeeToDelete, setEmployeeToDelete] = useState<RosterGridRow | null>(null);

    const { data: roster, isLoading, isError, refetch } = useRoster(id);
    const publishRoster = usePublishRoster();
    const deleteRoster = useDeleteRoster();
    const createShift = useCreateShift();
    const updateShift = useUpdateShift();
    const deleteShift = useDeleteShift();

    // Staged post-publication edits (published rosters only). When the roster is
    // published, cell gestures are staged and reviewed in the "Save Changes &
    // Notify" dialog instead of being written one shift at a time.
    const published = usePublishedRosterMutations({ roster: roster ?? ({} as Roster) });

    const shifts = useMemo(() => {
        // Draft rosters render the raw server shifts; published rosters render
        // the working set (server shifts + staged edits) so the grid always
        // reflects what would be saved.
        return published.isPublished ? published.workingShifts : (roster?.shifts ?? []);
    }, [roster, published.isPublished, published.workingShifts]);
    const summary = useMemo(() => summarizeWeek(shifts), [shifts]);

    // Save Changes & Notify orchestration for published rosters.
    const changeSave = useRosterChangeSave({
        roster: roster ?? ({} as Roster),
        mutations: published.mutations,
        onCleared: published.discardAll,
        refetch: () => refetch(),
    });

    // Any in-flight shift write disables every cell action so a manager cannot
    // queue conflicting changes against the same cell.
    const isShiftMutating =
        createShift.isPending || updateShift.isPending || deleteShift.isPending ||
        changeSave.isSaving || changeSave.isPreviewing;

    if (isLoading) {
        return <DetailSkeleton />;
    }


    if (isError || !roster) {
        return <DetailError onRetry={() => void refetch()} />;
    }

    const weekLabel = formatWeekRange(roster.weekStart, roster.weekEnd);
    const publishedAt = formatPublishedAt(roster.publishedAt);
    const canPublish = roster.status === 'draft';

    const handlePublish = (current: Roster): void => {
        publishRoster.mutate(current.id, {
            onSuccess: () =>
                toast.success('Roster published', {
                    description: `${weekLabel} is now visible to employees.`,
                }),
            onError: (error) =>
                toast.error('Unable to publish roster', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    const handleDelete = (current: Roster): void => {
        deleteRoster.mutate(current.id, {
            onSuccess: () => {
                toast.success('Roster deleted', {
                    description: `The week of ${weekLabel} has been removed.`,
                });
                navigate('/rosters');
            },
            onError: (error) =>
                toast.error('Unable to delete roster', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    /* ------------------------------------------------------------------ */
    /* Cell + shift actions                                               */
    /* ------------------------------------------------------------------ */

    /** Opens the quick editor seeded with `values` for the given cell. */
    const openQuickEditor = (
        shiftId: string | null,
        date: string,
        employeeId: string | null,
        employeeLabel: string,
        values: ShiftTemplateValues,
    ): void => {
        setQuickTarget({
            shiftId,
            date,
            employeeId,
            employeeLabel,
            dateLabel: formatDayHeading(date),
            values,
        });
        setIsQuickOpen(true);
    };

    /** Places the selected employee on the roster as a new row with empty cells. */
    const handleAddEmployee = (employee: Employee): void => {
        if (employee === null) {
            return;
        }

        // The local list is keyed by employee id, so adding the same person
        // twice is a no-op.
        setAddedEmployees((current) => {
            const alreadyPresent = current.some((entry) => entry.id === employee.id);
            if (alreadyPresent) {
                return current;
            }

            return [...current, toAddedEmployee(employee)];
        });

        setIsAddEmployeeOpen(false);
    };

    /** Converts a directory employee into a grid row seed (empty shift cells). */
    const toAddedEmployee = (employee: Employee): AddedEmployee => ({
        id: employee.id,
        name: employee.name,
        avatarUrl: employee.avatarUrl ?? null,
        positionName: employee.position || null,
        positionColor: null,
        departmentName: employee.department || null,
        branchName: employee.branchName || null,
    });

    /** Resolves the row label for a cell from the roster's shifts. */
    const rowLabel = (employeeId: string | null): string => {
        if (employeeId === null) {
            return OPEN_ROW_LABEL;
        }

        const match = shifts.find((shift) => shift.employeeId === employeeId);
        return match?.employeeName ?? 'Employee';
    };

    /** `+` on a cell: create a new shift in that row/day. */
    const handleAddShift = (date: string, employeeId: string | null): void => {
        openQuickEditor(
            null,
            date,
            employeeId,
            rowLabel(employeeId),
            DEFAULT_SHIFT_TEMPLATE,
        );
    };

    /** Pencil on a shift block: edit that shift's times, break, role or notes. */
    const handleEditShift = (shift: RosterShift): void => {
        openQuickEditor(
            shift.id,
            shift.date ?? roster.weekStart ?? '',
            shift.employeeId,
            shift.employeeName ?? OPEN_ROW_LABEL,
            toShiftTemplateValues(shift),
        );
    };

    /** Persists the quick editor, creating or updating as appropriate. */
    const handleQuickSubmit = async (
        target: QuickShiftTarget,
        values: QuickShiftValues,
    ): Promise<void> => {
        const placement = { date: target.date, employeeId: target.employeeId };
        const template: ShiftTemplateValues = { ...values, status: target.values.status };

        // Prevent duplicate shifts in the same cell: block any add/update whose
        // time range overlaps an existing shift (or staged shift) on the same
        // date + employee, excluding the shift being edited itself.
        if (target.employeeId !== null) {
            const working = published.isPublished ? published.workingShifts : (roster?.shifts ?? []);
            const start = timeToMinutes(template.startTime) ?? 0;
            const end = timeToMinutes(template.endTime) ?? start;

            const overlaps = working.some((existing) => {
                if (existing.date !== target.date || existing.employeeId !== target.employeeId) {
                    return false;
                }
                if (target.shiftId !== null && existing.id === target.shiftId) {
                    return false;
                }

                const existingStart = timeToMinutes(existing.startTime) ?? 0;
                const existingEnd = timeToMinutes(existing.endTime) ?? existingStart;
                return start < existingEnd && end > existingStart;
            });

            if (overlaps) {
                toast.error('Conflicting shift', {
                    description: `${target.employeeLabel} already has a shift that overlaps ${formatShiftTimeRange(template)} on ${target.dateLabel}.`,
                });
                return;
            }
        }

        // A published roster must route every edit through the staged
        // "Save Changes & Notify" flow instead of writing immediately.
        if (published.isPublished) {
            if (target.shiftId) {
                published.stageUpdate(target.shiftId, placement, template);
            } else {
                published.stageAdd(placement, template);
            }
            toast.success(target.shiftId ? 'Shift change staged' : 'Shift added (staged)', {
                description: `${target.employeeLabel} · ${target.dateLabel}. Review before saving.`,
            });
            setIsQuickOpen(false);
            setQuickTarget(null);
            return;
        }

        const input = toShiftMutationInput(
            { rosterId: roster.id, ...placement },
            template,
        );

        try {
            if (target.shiftId) {
                await updateShift.mutateAsync({ id: target.shiftId, input });
                toast.success('Shift updated', {
                    description: `${target.employeeLabel} · ${target.dateLabel}.`,
                });
            } else {
                await createShift.mutateAsync(input);
                toast.success('Shift added', {
                    description: `${target.employeeLabel} · ${target.dateLabel}.`,
                });
            }

            setIsQuickOpen(false);
            setQuickTarget(null);
        } catch (error) {
            toast.error(target.shiftId ? 'Unable to update shift' : 'Unable to add shift', {
                description: getApiErrorMessage(error, 'Please try again.'),
            });
        }
    };

    /** Runs the confirmed shift deletion. */
    const handleConfirmShiftDelete = (shift: RosterShift): void => {
        // On a published roster the shift is cancelled (recorded + notified),
        // and the cancellation is staged for the "Save Changes & Notify" review.
        // Open the review dialog so the manager completes the flow (review →
        // apply → toast) and the shift actually disappears from the roster.
        if (published.isPublished) {
            published.stageCancel(shift.id);
            setShiftToDelete(null);
            changeSave.setDialogOpen(true);
            return;
        }

        deleteShift.mutate(shift.id, {
            onSuccess: () => {
                toast.success('Shift deleted', {
                    description: `${formatShiftTimeRange(shift)} on ${formatDayHeading(shift.date)} removed.`,
                });
                setShiftToDelete(null);
            },
            onError: (error) =>
                toast.error('Unable to delete shift', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    /** Runs the confirmed employee removal (deletes every shift in the row). */
    const handleConfirmEmployeeDelete = (row: RosterGridRow): void => {
        const employeeId = row.employeeId;

        if (employeeId === null) {
            setEmployeeToDelete(null);
            return;
        }

        // The shifts that belong to this employee. For published rosters this is
        // the working set (server shifts + staged edits); for drafts it is the
        // raw server shifts.
        const shifts = published.isPublished ? published.workingShifts : (roster?.shifts ?? []);

        if (published.isPublished) {
            // Stage a cancel per shift; `stageCancel` is temp-id safe (nets out
            // just-added temp shifts instead of pushing a bogus bigint id).
            shifts
                .filter((shift) => shift.employeeId === employeeId)
                .forEach((shift) => {
                    published.stageCancel(shift.id);
                });
            setEmployeeToDelete(null);
            changeSave.setDialogOpen(true);
            return;
        }

        // Draft rosters delete each shift immediately.
        const ids = shifts
            .filter((shift) => shift.employeeId === employeeId)
            .map((shift) => shift.id);
        void Promise.all(ids.map((id) => deleteShift.mutateAsync(id)))
            .then(() => {
                toast.success('Employee removed from roster', {
                    description: `${row.name} and their ${ids.length} ${ids.length === 1 ? 'shift' : 'shifts'} have been removed.`,
                });
                setEmployeeToDelete(null);
            })
            .catch((error: unknown) => {
                toast.error('Unable to remove employee', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                });
            });
    };

    return (

        <div className="space-y-6">
            <Breadcrumb label={weekLabel} />

            {/* Page header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                    <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                        aria-hidden="true"
                    >
                        <CalendarRange className="h-5 w-5" />
                    </span>
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                {weekLabel}
                            </h1>
                            <RosterStatusBadge status={roster.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {describeWeekOffset(roster.weekStart)}
                            {roster.branchName ? ` · ${roster.branchName}` : ' · All branches'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => setIsEditOpen(true)}
                        className={secondaryButtonClasses}
                    >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Edit roster
                    </button>

                    {/* New button: Add Employees */}
                    <button
                        type="button"
                        onClick={() => setIsAddEmployeeOpen(true)}
                        className={secondaryButtonClasses}
                    >
                        <Users className="h-4 w-4" aria-hidden="true" />
                        Add Employees
                    </button>

                    {canPublish ? (
                        <button
                            type="button"
                            onClick={() => setConfirmPublish(true)}
                            className={cn(
                                'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                                'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            )}
                        >
                            <Send className="h-4 w-4" aria-hidden="true" />
                            Publish
                        </button>
                    ) : null}

                    {published.hasPendingChanges ? (
                        <button
                            type="button"
                            onClick={() => changeSave.setDialogOpen(true)}
                            className={cn(
                                'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 text-sm font-medium text-primary shadow-sm transition-colors',
                                'hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            )}
                        >
                            <History className="h-4 w-4" aria-hidden="true" />
                            Review changes
                            {published.pendingCount > 0 ? (
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                                    {published.pendingCount}
                                </span>
                            ) : null}
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-danger/30 bg-card px-4 text-sm font-medium text-danger shadow-sm transition-colors',
                            'hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete
                    </button>
                </div>
            </div>

            {/* Week summary card */}
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-6 shadow-sm sm:grid-cols-3">
                <MetaRow
                    icon={Building2}
                    label="Branch"
                    value={roster.branchName ?? 'All branches'}
                />
                <MetaRow
                    icon={Clock}
                    label="Published"
                    value={publishedAt ?? 'Not published yet'}
                />
                <MetaRow
                    icon={Users}
                    label="Published by"
                    value={roster.publishedByName ?? '—'}
                />
            </div>

            {/* KPI summary row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Shifts"
                    value={summary.shiftCount}
                    icon={LayoutList}
                    tone="primary"
                    description="Scheduled this week"
                />
                <StatCard
                    title="Rostered Hours"
                    value={`${summary.totalHours}h`}
                    icon={Clock}
                    tone="info"
                    description="Payable hours"
                />
                <StatCard
                    title="Employees"
                    value={summary.employeeCount}
                    icon={Users}
                    tone="success"
                    description="Staff rostered"
                />
                <StatCard
                    title="Open Shifts"
                    value={summary.openShifts}
                    icon={UserRoundX}
                    tone="warning"
                    description="Awaiting assignment"
                />
            </div>

            {/* Weekly agenda */}
            <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        Week overview
                    </h2>

                    <div
                        role="tablist"
                        aria-label="Week view"
                        className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm"
                    >
                        {WEEK_VIEWS.map(({ value, label, icon: Icon }) => {
                            const isActive = weekView === value;

                            return (
                                <button
                                    key={value}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setWeekView(value)}
                                    className={cn(
                                        'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        isActive
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
                                    )}
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {weekView === 'matrix' ? (
                    <RosterMatrixGrid
                        weekStart={roster.weekStart}
                        shifts={shifts}
                        addedEmployees={addedEmployees}
                        // Archived rosters are historical records and stay read-only.
                        canEdit={roster.status !== 'archived'}
                        onSelectShift={handleEditShift}
                        onAddShift={handleAddShift}
                        onEditShift={handleEditShift}
                        onDeleteShift={setShiftToDelete}
                        onDeleteEmployee={setEmployeeToDelete}
                        isMutating={isShiftMutating}
                    />
                ) : (
                    <RosterWeekGrid weekStart={roster.weekStart} shifts={shifts} />
                )}
            </section>

            {/* Add employees to roster */}
            <AddEmployeeModal
                open={isAddEmployeeOpen}
                onOpenChange={setIsAddEmployeeOpen}
                onAdd={handleAddEmployee}
            />

            {/* Quick shift editor (cell `+` and shift pencil) */}
            <QuickShiftDialog
                open={isQuickOpen}
                onOpenChange={(next) => {
                    setIsQuickOpen(next);
                    if (!next) {
                        setQuickTarget(null);
                    }
                }}
                target={quickTarget}
                isSaving={createShift.isPending || updateShift.isPending}
                onSubmit={handleQuickSubmit}
            />


            {/* Edit drawer */}
            <RosterFormModal
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                roster={roster}
                branches={
                    roster.branchId !== null && roster.branchName
                        ? [{ id: String(roster.branchId), name: roster.branchName }]
                        : []
                }
            />

            {/* Publish confirmation */}
            <AlertDialog.Root open={confirmPublish} onOpenChange={setConfirmPublish}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Publish {weekLabel}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            Publishing makes this roster visible to employees and notifies everyone
                            with an assigned shift.
                        </AlertDialog.Description>
                        <div className="mt-6 flex justify-end gap-3">
                            <AlertDialog.Cancel asChild>
                                <button type="button" className={cancelButtonClasses}>
                                    Cancel
                                </button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <button
                                    type="button"
                                    onClick={() => handlePublish(roster)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Publish roster
                                </button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>

            {/* Delete confirmation */}
            <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete the week of {weekLabel}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            This permanently removes the roster and every shift inside it. This
                            action cannot be undone.
                        </AlertDialog.Description>
                        <div className="mt-6 flex justify-end gap-3">
                            <AlertDialog.Cancel asChild>
                                <button type="button" className={cancelButtonClasses}>
                                    Cancel
                                </button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(roster)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Delete roster
                                </button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>

            {/* Save Changes & Notify (published rosters) */}
            <SaveChangesDialog
                weekLabel={weekLabel}
                mutations={published.mutations}
                open={changeSave.dialogOpen}
                onOpenChange={changeSave.setDialogOpen}
                onCancel={changeSave.handleCancel}
                isPreviewing={changeSave.isPreviewing}
                preview={changeSave.preview}
                previewError={changeSave.error}
                isStale={changeSave.isStale}
                onRefresh={changeSave.handleRefresh}
                isSaving={changeSave.isSaving}
                onSave={changeSave.handleSave}
            />

            {/* Single-shift delete confirmation (trash icon on a shift block) */}
            <AlertDialog.Root
                open={shiftToDelete !== null}
                onOpenChange={(next) => {
                    if (!next) {
                        setShiftToDelete(null);
                    }
                }}
            >
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete this shift?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            {shiftToDelete
                                ? `${shiftToDelete.employeeName ?? OPEN_ROW_LABEL} · ${formatShiftTimeRange(shiftToDelete)} on ${formatDayHeading(shiftToDelete.date)} will be removed from this roster. This cannot be undone.`
                                : 'This shift will be removed from the roster.'}
                        </AlertDialog.Description>
                        <div className="mt-6 flex justify-end gap-3">
                            <AlertDialog.Cancel asChild>
                                <button type="button" className={cancelButtonClasses}>
                                    Cancel
                                </button>
                            </AlertDialog.Cancel>
                            <button
                                type="button"
                                disabled={deleteShift.isPending}
                                onClick={() => {
                                    if (shiftToDelete) {
                                        handleConfirmShiftDelete(shiftToDelete);
                                    }
                                }}
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                            >
                                {deleteShift.isPending ? 'Deleting…' : 'Delete shift'}
                            </button>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>

            {/* Employee removal confirmation (bin icon on an employee name cell) */}
            <AlertDialog.Root
                open={employeeToDelete !== null}
                onOpenChange={(next) => {
                    if (!next) {
                        setEmployeeToDelete(null);
                    }
                }}
            >
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Remove {employeeToDelete?.name ?? 'employee'} from this week?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            {employeeToDelete
                                ? `All ${employeeToDelete.shiftCount} ${employeeToDelete.shiftCount === 1 ? 'shift' : 'shifts'} assigned to ${employeeToDelete.name} for this week will be removed. This cannot be undone.`
                                : 'All shifts assigned to this employee for the week will be removed.'}
                        </AlertDialog.Description>
                        <div className="mt-6 flex justify-end gap-3">
                            <AlertDialog.Cancel asChild>
                                <button type="button" className={cancelButtonClasses}>
                                    Cancel
                                </button>
                            </AlertDialog.Cancel>
                            <button
                                type="button"
                                disabled={deleteShift.isPending}
                                onClick={() => {
                                    if (employeeToDelete) {
                                        handleConfirmEmployeeDelete(employeeToDelete);
                                    }
                                }}
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                            >
                                {deleteShift.isPending ? 'Removing…' : 'Remove employee'}
                            </button>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </div>
    );
}


export default RosterDetailPage;
