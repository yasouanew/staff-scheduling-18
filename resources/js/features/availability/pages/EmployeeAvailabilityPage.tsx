import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
    AlertTriangle,
    ArrowLeft,
    CalendarClock,
    CalendarDays,
    ChevronRight,
    Clock,
    LayoutGrid,
    List,
    Loader2,
    RotateCcw,
    Save,
    ShieldAlert,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { EmptyState } from '@/Components/common/EmptyState';
import { ErrorAlert } from '@/Components/common/ErrorAlert';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { StatCard } from '@/Components/common/StatCard';
import { StatusBadge } from '@/Components/common/StatusBadge';
import { normalizeWebRole, useWebSession } from '@/features/auth/hooks/useWebSession';
import { useEmployee } from '@/features/employees/hooks/useEmployees';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    WEEKDAY_ORDER,
    type AvailabilityRange,
    type DayOfWeek,
    type WeeklyAvailabilityDraft,
} from '@/types/employee-availability';

import {
    AvailabilityDayList,
} from '../components/AvailabilityDayList';
import {
    AvailabilityRangeModal,
    type AvailabilityRangeSubmit,
} from '../components/AvailabilityRangeModal';
import { AvailabilityWeekGrid } from '../components/AvailabilityWeekGrid';
import {
    useEmployeeAvailability,
    useSyncWeeklyAvailability,
} from '../hooks/useEmployeeAvailability';
import {
    applySelectionRowToDay,
    cloneDraft,
    countRanges,
    createEmptyDraft,
    daysWithRanges,
    draftToSelection,
    draftToSyncPayload,
    draftsAreEqual,
    mergeRangeIntoDay,
    slotsToDraft,
    totalDraftMinutes,
} from '../lib/availability-grid';

/* -------------------------------------------------------------------------- */
/* Local helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Which editing surface is currently visible. */
type EditorView = 'grid' | 'list';

/** The default Monday–Friday block applied by the "Standard week" preset. */
const STANDARD_WEEK_BLOCK = { startTime: '09:00', endTime: '17:00', isAvailable: true } as const;

/** Renders total availability minutes as a compact `7h 30m` style label. */
function formatWeeklyHours(minutes: number): string {
    if (minutes <= 0) {
        return '0h';
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours === 0) {
        return `${remainder}m`;
    }

    return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

/**
 * Structural check for a 403 response so the page can render a permission state
 * instead of a generic failure panel — without leaking `any` into the codebase.
 */
function isForbiddenError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const { response } = error as { response?: { status?: number } };

    return response?.status === 403;
}

/** Shared button surfaces so every action keeps identical focus/disabled rules. */
const BUTTON_BASE =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60';

const PRIMARY_BUTTON = cn(BUTTON_BASE, 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90');

const OUTLINE_BUTTON = cn(BUTTON_BASE, 'border border-border bg-card text-foreground shadow-sm hover:bg-muted');

const DANGER_BUTTON = cn(BUTTON_BASE, 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20');

/* -------------------------------------------------------------------------- */
/* Breadcrumb                                                                 */
/* -------------------------------------------------------------------------- */

/** Breadcrumb trail: Employees › {name} › Availability. */
function Breadcrumb({ name }: { name: string }): JSX.Element {
    return (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
            <Link
                to="/employees"
                className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                Employees
            </Link>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" />
            <span className="max-w-[12rem] truncate text-muted-foreground sm:max-w-none">{name}</span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" />
            <span aria-current="page" className="font-medium text-foreground">
                Availability
            </span>
        </nav>
    );
}

/* -------------------------------------------------------------------------- */
/* View switcher                                                              */
/* -------------------------------------------------------------------------- */

/** Segmented control toggling between the drag grid and the per-day list. */
function ViewSwitcher({
    view,
    onChange,
}: {
    view: EditorView;
    onChange: (view: EditorView) => void;
}): JSX.Element {
    const options: readonly { value: EditorView; label: string; icon: typeof LayoutGrid }[] = [
        { value: 'grid', label: 'Grid', icon: LayoutGrid },
        { value: 'list', label: 'List', icon: List },
    ];

    return (
        <div
            role="group"
            aria-label="Availability editor view"
            className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm"
        >
            {options.map((option) => {
                const Icon = option.icon;
                const isActive = view === option.value;

                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isActive
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon aria-hidden="true" className="size-4" />
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Clear-week confirmation                                                    */
/* -------------------------------------------------------------------------- */

/** Destructive confirmation shown before wiping every block in the week. */
function ClearWeekDialog({
    open,
    onOpenChange,
    onConfirm,
    blockCount,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    blockCount: number;
}): JSX.Element {
    return (
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-lg focus:outline-none">
                    <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                            <AlertTriangle aria-hidden="true" className="size-5" />
                        </span>
                        <div className="space-y-1.5">
                            <AlertDialog.Title className="text-base font-semibold text-foreground">
                                Clear the whole week?
                            </AlertDialog.Title>
                            <AlertDialog.Description className="text-sm text-muted-foreground">
                                {blockCount === 1
                                    ? 'This removes the 1 time block currently in the editor.'
                                    : `This removes all ${blockCount} time blocks currently in the editor.`}{' '}
                                Nothing is deleted on the server until you save the week.
                            </AlertDialog.Description>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <AlertDialog.Cancel asChild>
                            <button type="button" className={OUTLINE_BUTTON}>
                                Cancel
                            </button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <button
                                type="button"
                                onClick={onConfirm}
                                className={cn(BUTTON_BASE, 'bg-danger text-danger-foreground shadow-sm hover:bg-danger/90')}
                            >
                                <Trash2 aria-hidden="true" className="size-4" />
                                Clear week
                            </button>
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Weekly availability editor for a single employee.
 *
 * The page owns the entire draft week: the grid and the day list are pure
 * presentational surfaces that report intent upwards. Nothing is persisted until
 * "Save week" flushes the draft through the atomic sync endpoint, so partially
 * painted weeks can never reach the roster engine.
 */
function EmployeeAvailabilityPage(): JSX.Element {
    const { id } = useParams<{ id: string }>();
    const employeeId = id ?? '';

    const isDesktop = useMediaQuery('(min-width: 1024px)');

    // Schedulers have employee.view (read) but lack employee.edit (write).
    // The sync / store / update / destroy endpoints all gate on the "update"
    // policy which requires employee.edit, so a scheduler hitting "Save week"
    // would receive a 403. Detect the role up front and render a read-only
    // surface instead of letting the user attempt an edit that cannot succeed.
    const session = useWebSession();
    const isCompanyAdmin = normalizeWebRole(session.data) === 'company_admin';
    const readOnly = !isCompanyAdmin;

    const employeeQuery = useEmployee(employeeId);
    const availabilityQuery = useEmployeeAvailability(employeeId);
    const syncMutation = useSyncWeeklyAvailability(employeeId);

    const [draft, setDraft] = useState<WeeklyAvailabilityDraft>(() => createEmptyDraft());
    const [baseline, setBaseline] = useState<WeeklyAvailabilityDraft>(() => createEmptyDraft());
    const [view, setView] = useState<EditorView>(() => (isDesktop ? 'grid' : 'list'));
    const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
    const [isClearOpen, setIsClearOpen] = useState(false);
    const [modal, setModal] = useState<{ open: boolean; day: DayOfWeek; range: AvailabilityRange | null }>({
        open: false,
        day: 1,
        range: null,
    });

    /* ---------------------------------------------------------------------- */
    /* Draft seeding                                                          */
    /* ---------------------------------------------------------------------- */

    // Mirrors of the latest render values so the seeding effect can compare
    // against them without re-subscribing on every keystroke-sized edit.
    const draftRef = useRef<WeeklyAvailabilityDraft>(draft);
    const baselineRef = useRef<WeeklyAvailabilityDraft>(baseline);
    const seededRef = useRef<unknown>(null);

    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    useEffect(() => {
        baselineRef.current = baseline;
    }, [baseline]);

    const slots = availabilityQuery.data;

    useEffect(() => {
        if (!slots || seededRef.current === slots) {
            return;
        }

        const next = slotsToDraft(slots);
        const isPristine = draftsAreEqual(draftRef.current, baselineRef.current);

        seededRef.current = slots;
        setBaseline(next);

        if (isPristine) {
            // Safe to adopt the server week — the user has nothing pending.
            setDraft(cloneDraft(next));
            setHasRemoteUpdate(false);
        } else if (!draftsAreEqual(draftRef.current, next)) {
            // Someone else changed this week while it was being edited.
            setHasRemoteUpdate(true);
        }
    }, [slots]);

    /* ---------------------------------------------------------------------- */
    /* Derived state                                                          */
    /* ---------------------------------------------------------------------- */

    const selection = useMemo(() => draftToSelection(draft), [draft]);
    const blockCount = useMemo(() => countRanges(draft), [draft]);
    const activeDays = useMemo(() => daysWithRanges(draft).length, [draft]);
    const weeklyMinutes = useMemo(() => totalDraftMinutes(draft), [draft]);
    const isDirty = useMemo(() => !draftsAreEqual(draft, baseline), [draft, baseline]);

    const isSaving = syncMutation.isPending;
    const isLoading = employeeQuery.isLoading || availabilityQuery.isLoading;

    // Browser-level guard so a refresh never silently discards a painted week.
    // Read-only users cannot save, so the guard only fires for company admins.
    useEffect(() => {
        if (!isDirty || readOnly) {
            return;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty, readOnly]);

    /* ---------------------------------------------------------------------- */
    /* Draft mutations                                                        */
    /* ---------------------------------------------------------------------- */

    /** Paints (or clears) a dragged column span on one day. */
    const handleCommitRange = useCallback(
        (day: DayOfWeek, fromIndex: number, toIndex: number, selected: boolean): void => {
            setDraft((current) => {
                const row = [...draftToSelection(current)[day]];
                const start = Math.min(fromIndex, toIndex);
                const end = Math.max(fromIndex, toIndex);

                for (let index = start; index <= end; index += 1) {
                    row[index] = selected;
                }

                const next = cloneDraft(current);
                next[day] = applySelectionRowToDay(row, current[day]);

                return next;
            });
        },
        [],
    );

    /** Opens the range dialog in "add" mode for a day. */
    const handleAdd = useCallback((day: DayOfWeek): void => {
        setModal({ open: true, day, range: null });
    }, []);

    /** Opens the range dialog in "edit" mode for an existing block. */
    const handleEdit = useCallback((day: DayOfWeek, range: AvailabilityRange): void => {
        setModal({ open: true, day, range });
    }, []);

    /** Drops a single block from the draft. */
    const handleRemove = useCallback((day: DayOfWeek, range: AvailabilityRange): void => {
        setDraft((current) => {
            const next = cloneDraft(current);
            next[day] = next[day].filter((candidate) => candidate.key !== range.key);

            return next;
        });

        toast.success('Time block removed', {
            description: 'Save the week to apply this change.',
        });
    }, []);

    /** Empties one day without touching the rest of the week. */
    const handleClearDay = useCallback((day: DayOfWeek): void => {
        setDraft((current) => {
            const next = cloneDraft(current);
            next[day] = [];

            return next;
        });
    }, []);

    /** Commits the dialog payload, duplicating onto any requested extra days. */
    const handleRangeSubmit = useCallback((payload: AvailabilityRangeSubmit): void => {
        setDraft((current) => {
            const next = cloneDraft(current);
            const candidate = {
                startTime: payload.startTime,
                endTime: payload.endTime,
                isAvailable: payload.isAvailable,
            };

            // Remove the edited block first so merging cannot duplicate it.
            if (payload.editingKey !== null) {
                next[payload.day] = next[payload.day].filter(
                    (range) => range.key !== payload.editingKey,
                );
            }

            next[payload.day] = mergeRangeIntoDay(next[payload.day], candidate);

            for (const day of payload.copyToDays) {
                if (day === payload.day) {
                    continue;
                }

                next[day] = mergeRangeIntoDay(next[day], candidate);
            }

            return next;
        });

        const copiedCount = payload.copyToDays.filter((day) => day !== payload.day).length;

        toast.success(payload.editingKey !== null ? 'Time block updated' : 'Time block added', {
            description:
                copiedCount > 0
                    ? `Also copied to ${copiedCount} other ${copiedCount === 1 ? 'day' : 'days'}. Save the week to apply.`
                    : 'Save the week to apply this change.',
        });
    }, []);

    /** Applies a Monday–Friday 09:00–17:00 baseline on top of what exists. */
    const handleApplyStandardWeek = useCallback((): void => {
        setDraft((current) => {
            const next = cloneDraft(current);

            for (const day of WEEKDAY_ORDER) {
                next[day] = mergeRangeIntoDay(next[day], STANDARD_WEEK_BLOCK);
            }

            return next;
        });

        toast.success('Standard week applied', {
            description: 'Monday to Friday, 9:00 AM – 5:00 PM. Save the week to apply.',
        });
    }, []);

    /** Wipes the draft (already confirmed by the alert dialog). */
    const handleClearWeek = useCallback((): void => {
        setDraft(createEmptyDraft());
        setIsClearOpen(false);

        toast.success('Week cleared', {
            description: 'Save the week to remove every block on the server.',
        });
    }, []);

    /** Reverts the editor to the last known server state. */
    const handleReset = useCallback((): void => {
        setDraft(cloneDraft(baseline));
        setHasRemoteUpdate(false);

        toast.info('Changes discarded', {
            description: 'The editor now matches the saved availability.',
        });
    }, [baseline]);

    /** Flushes the whole week through the atomic sync endpoint. */
    const handleSave = useCallback((): void => {
        syncMutation.mutate(draftToSyncPayload(draft), {
            onSuccess: () => {
                setHasRemoteUpdate(false);
                toast.success('Availability saved', {
                    description: `${blockCount === 1 ? '1 time block' : `${blockCount} time blocks`} across ${activeDays === 1 ? '1 day' : `${activeDays} days`}.`,
                });
            },
            onError: (error) => {
                toast.error('Could not save availability', {
                    description: getApiErrorMessage(error, 'Please review the week and try again.'),
                });
            },
        });
    }, [syncMutation, draft, blockCount, activeDays]);

    /* ---------------------------------------------------------------------- */
    /* Guard states                                                           */
    /* ---------------------------------------------------------------------- */

    if (employeeId.length === 0) {
        return (
            <div className="space-y-6">
                <Breadcrumb name="Unknown" />
                <EmptyState
                    icon={AlertTriangle}
                    title="No employee selected"
                    description="Open an employee from the directory to manage their weekly availability."
                    action={
                        <Link to="/employees" className={PRIMARY_BUTTON}>
                            <ArrowLeft aria-hidden="true" className="size-4" />
                            Back to employees
                        </Link>
                    }
                />
            </div>
        );
    }

    if (isForbiddenError(employeeQuery.error) || isForbiddenError(availabilityQuery.error)) {
        return (
            <div className="space-y-6">
                <Breadcrumb name="Restricted" />
                <EmptyState
                    icon={ShieldAlert}
                    title="You cannot view this availability"
                    description="Managing employee availability requires roster or people-management permissions. Ask a company administrator for access."
                    action={
                        <Link to="/employees" className={OUTLINE_BUTTON}>
                            <ArrowLeft aria-hidden="true" className="size-4" />
                            Back to employees
                        </Link>
                    }
                />
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="space-y-6" aria-busy="true">
                <LoadingSkeleton className="h-5 w-64" radius="sm" label="Loading employee availability" />
                <LoadingSkeleton className="h-28 w-full" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <LoadingSkeleton className="h-28 w-full" />
                    <LoadingSkeleton className="h-28 w-full" />
                    <LoadingSkeleton className="h-28 w-full" />
                </div>
                <LoadingSkeleton className="h-96 w-full" />
            </div>
        );
    }

    if (employeeQuery.isError || !employeeQuery.data) {
        return (
            <div className="space-y-6">
                <Breadcrumb name="Not found" />
                <ErrorAlert
                    title="Employee unavailable"
                    message={getApiErrorMessage(
                        employeeQuery.error,
                        'We could not load this employee. They may have been removed.',
                    )}
                />
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void employeeQuery.refetch()} className={PRIMARY_BUTTON}>
                        <RotateCcw aria-hidden="true" className="size-4" />
                        Try again
                    </button>
                    <Link to="/employees" className={OUTLINE_BUTTON}>
                        <ArrowLeft aria-hidden="true" className="size-4" />
                        Back to employees
                    </Link>
                </div>
            </div>
        );
    }

    const employee = employeeQuery.data;

    /* ---------------------------------------------------------------------- */
    /* Render                                                                 */
    /* ---------------------------------------------------------------------- */

    return (
        <div className="space-y-6">
            <Breadcrumb name={employee.name} />

            {/* Page header */}
            <header className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                                {employee.name}
                            </h1>
                            <StatusBadge status={employee.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {employee.position} · {employee.department}
                            {employee.branchName !== null ? ` · ${employee.branchName}` : ''}
                        </p>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            Paint the hours this employee can be rostered. Drag across the grid on
                            larger screens, or add precise blocks from the day list.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/employees`} className={OUTLINE_BUTTON}>
                            <ArrowLeft aria-hidden="true" className="size-4" />
                            Directory
                        </Link>
                        {!readOnly ? (
                            <>
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    disabled={!isDirty || isSaving}
                                    className={OUTLINE_BUTTON}
                                >
                                    <RotateCcw aria-hidden="true" className="size-4" />
                                    Reset
                                </button>
                                <button type="button" onClick={handleSave} disabled={!isDirty || isSaving} className={PRIMARY_BUTTON}>
                                    {isSaving ? (
                                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                                    ) : (
                                        <Save aria-hidden="true" className="size-4" />
                                    )}
                                    {isSaving ? 'Saving…' : 'Save week'}
                                </button>
                            </>
                        ) : null}
                    </div>
                </div>
            </header>

            {/* Read-only banner for schedulers who lack employee.edit */}
            {readOnly ? (
                <ErrorAlert
                    variant="info"
                    title="View only"
                    message="Saving availability requires administrator permissions. You can review the current schedule but changes cannot be persisted."
                />
            ) : null}

            {/* Availability read failure (employee loaded fine) */}
            {availabilityQuery.isError ? (
                <ErrorAlert
                    title="Availability could not be loaded"
                    message={getApiErrorMessage(
                        availabilityQuery.error,
                        'The saved availability is unavailable right now. Editing is disabled until it loads.',
                    )}
                />
            ) : null}

            {/* Someone else saved this week mid-edit */}
            {hasRemoteUpdate ? (
                <ErrorAlert
                    variant="warning"
                    title="Newer availability on the server"
                    message="This week changed elsewhere while you were editing. Saving will overwrite it, or reset to load the latest version."
                    onDismiss={() => setHasRemoteUpdate(false)}
                />
            ) : null}

            {/* Unsaved changes hint */}
            {isDirty ? (
                <ErrorAlert
                    variant="info"
                    title="Unsaved changes"
                    message="Your edits are held locally. Save the week to publish them to the roster engine."
                />
            ) : null}

            {/* KPI summary */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                    title="Weekly availability"
                    value={formatWeeklyHours(weeklyMinutes)}
                    icon={Clock}
                    tone="primary"
                    description="Total hours open for rostering"
                />
                <StatCard
                    title="Days covered"
                    value={`${activeDays} / 7`}
                    icon={CalendarDays}
                    tone={activeDays === 0 ? 'warning' : 'success'}
                    description="Days with at least one block"
                />
                <StatCard
                    title="Time blocks"
                    value={blockCount}
                    icon={CalendarClock}
                    tone="info"
                    description={isDirty ? 'Draft — not yet saved' : 'Matches saved availability'}
                />
            </div>

            {/* Editor toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <ViewSwitcher view={view} onChange={setView} />

                {!readOnly ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleApplyStandardWeek}
                            disabled={isSaving}
                            className={OUTLINE_BUTTON}
                        >
                            <Sparkles aria-hidden="true" className="size-4" />
                            Standard week
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsClearOpen(true)}
                            disabled={isSaving || blockCount === 0}
                            className={DANGER_BUTTON}
                        >
                            <Trash2 aria-hidden="true" className="size-4" />
                            Clear week
                        </button>
                    </div>
                ) : null}
            </div>

            {/* Editor surface */}
            {view === 'grid' ? (
                <section
                    aria-label="Weekly availability grid"
                    className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
                >
                    <AvailabilityWeekGrid
                        selection={selection}
                        onCommitRange={handleCommitRange}
                        disabled={readOnly || isSaving || availabilityQuery.isError}
                    />
                    <p className="text-xs text-muted-foreground">
                        Drag across a row to mark availability, drag over selected cells to clear
                        them. Switch to the list view for exact start and end times.
                    </p>
                </section>
            ) : (
                <section aria-label="Availability by day" className="space-y-4">
                    {blockCount === 0 ? (
                        <EmptyState
                            icon={CalendarClock}
                            title="No availability recorded"
                            description="Add the hours this employee can work, or apply the standard Monday–Friday week to get started."
                            action={
                                <button
                                    type="button"
                                    onClick={handleApplyStandardWeek}
                                    disabled={isSaving}
                                    className={PRIMARY_BUTTON}
                                >
                                    <Sparkles aria-hidden="true" className="size-4" />
                                    Apply standard week
                                </button>
                            }
                        />
                    ) : null}

                    <AvailabilityDayList
                        draft={draft}
                        onAdd={handleAdd}
                        onEdit={handleEdit}
                        onRemove={handleRemove}
                        onClearDay={handleClearDay}
                        disabled={readOnly || isSaving || availabilityQuery.isError}
                    />
                </section>
            )}

            <AvailabilityRangeModal
                open={modal.open}
                onOpenChange={(open) => setModal((current) => ({ ...current, open }))}
                day={modal.day}
                range={modal.range}
                dayRanges={draft[modal.day]}
                onSubmit={handleRangeSubmit}
            />

            <ClearWeekDialog
                open={isClearOpen}
                onOpenChange={setIsClearOpen}
                onConfirm={handleClearWeek}
                blockCount={blockCount}
            />
        </div>
    );
}

export default EmployeeAvailabilityPage;
