import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { format, parseISO } from 'date-fns';
import {
    CalendarClock,
    CircleAlert,
    History,
    Loader2,
    RefreshCw,
    Send,
    UserRoundCheck,
    Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
    ROSTER_CHANGE_ACTION_LABELS,
    type RosterChange,
    type RosterChangeMutation,
} from '@/types/roster-management';

import type { RosterChangeSummary } from '../hooks/useRosterChanges';

/** Shared styling for the dialog's icon buttons. */
const secondaryButtonClasses = cn(
    'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors',
    'hover:bg-secondary hover:text-secondary-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-60',
);

const primaryButtonClasses = cn(
    'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
    'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-60',
);

/** Tones each change action so the summary is scannable at a glance. */
const ACTION_TONES: Record<RosterChange['action'], string> = {
    roster_published: 'bg-success/10 text-success',
    roster_updated: 'bg-info/10 text-info',
    shift_added: 'bg-success/10 text-success',
    shift_updated: 'bg-info/10 text-info',
    shift_cancelled: 'bg-danger/10 text-danger',
    shift_assigned: 'bg-success/10 text-success',
    shift_reassigned: 'bg-warning/10 text-warning',
    shift_location_changed: 'bg-warning/10 text-warning',
};

/** Formats a shift time `HH:mm:ss` down to `HH:mm`. */
function shortTime(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }
    const [hours, minutes] = value.split(':');
    if (!hours || !minutes) {
        return value;
    }
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

/** Human-readable location of a change, e.g. `Mon 12 Aug · 09:00–17:00`. */
function changeContext(change: RosterChange): string {
    const data = change.newData ?? change.oldData ?? {};
    const date = typeof data.date === 'string' ? parseISO(data.date) : null;
    const day = date && !Number.isNaN(date.getTime()) ? format(date, 'EEE d MMM') : null;
    const start = shortTime(data.start_time);
    const end = shortTime(data.end_time);
    const time = start && end ? `${start}–${end}` : '';

    return [day, time].filter(Boolean).join(' · ');
}

interface SaveChangesDialogProps {
    /** The roster whose changes are being reviewed. */
    weekLabel: string;
    /** Mutations staged by the manager. */
    mutations: readonly RosterChangeMutation[];
    /** Controls dialog visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
    /** Called to discard every staged mutation (Cancel). */
    onCancel: () => void;
    /** True while the preview request is in flight. */
    isPreviewing: boolean;
    /** The latest preview summary, or `null` before it resolves. */
    preview: RosterChangeSummary | null;
    /** Error message from a failed preview/apply, when present. */
    previewError: string | null;
    /** True when the roster version is stale (a 409 was returned). */
    isStale: boolean;
    /** Called to refresh the roster (after a version conflict). */
    onRefresh: () => void;
    /** True while the apply mutation is in flight. */
    isSaving: boolean;
    /** Confirms and applies the staged changes. */
    onSave: () => void;
}

/**
 * "Save Changes & Notify" confirmation for a published roster.
 *
 * Shows the backend-computed affected-employee summary (who will be notified,
 * and what changed) and asks the manager to confirm before the batch is applied
 * atomically and every affected employee is notified. Cancelling discards the
 * staged edits. A stale roster version surfaces a refresh affordance instead of
 * allowing a conflicting save.
 */
export function SaveChangesDialog({
    weekLabel,
    mutations,
    open,
    onOpenChange,
    onCancel,
    isPreviewing,
    preview,
    previewError,
    isStale,
    onRefresh,
    isSaving,
    onSave,
}: SaveChangesDialogProps): JSX.Element {
    const hasChanges = preview !== null && preview.change_count > 0;
    const affected = preview?.affected_employee_count ?? 0;
    const busy = isPreviewing || isSaving;

    return (
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                    <AlertDialog.Title className="text-lg font-semibold text-foreground">
                        Review roster changes
                    </AlertDialog.Title>
                    <AlertDialog.Description className="mt-1 text-sm text-muted-foreground">
                        {weekLabel} is published. Saving will notify every affected
                        employee, so review the summary before continuing.
                    </AlertDialog.Description>

                    <div className="mt-4 space-y-4">
                        {/* Affected-employee summary */}
                        {isPreviewing ? (
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                Calculating affected employees…
                            </div>
                        ) : previewError ? (
                            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <div className="space-y-2">
                                    <p className="font-medium">{previewError}</p>
                                    <button
                                        type="button"
                                        onClick={onRefresh}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                                    >
                                        <RefreshCw className="h-3 w-3" aria-hidden="true" />
                                        Reload roster
                                    </button>
                                </div>
                            </div>
                        ) : isStale ? (
                            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-warning">
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <div className="space-y-2">
                                    <p className="font-medium">
                                        This roster has changed on the server. Reload to see the
                                        latest version before saving.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={onRefresh}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                                    >
                                        <RefreshCw className="h-3 w-3" aria-hidden="true" />
                                        Reload roster
                                    </button>
                                </div>
                            </div>
                        ) : hasChanges ? (
                            <>
                                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                        <span className="text-sm font-semibold text-foreground">
                                            {affected}{' '}
                                            {affected === 1 ? 'employee' : 'employees'} affected
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                        <span className="text-sm text-muted-foreground">
                                            {preview.change_count}{' '}
                                            {preview.change_count === 1 ? 'change' : 'changes'}
                                        </span>
                                    </div>
                                </div>

                                {/* Per-employee change summary */}
                                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                                    {preview.employees.map((group) => (
                                        <div
                                            key={group.employee_id}
                                            className="rounded-lg border border-border p-3"
                                        >
                                            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                                <UserRoundCheck
                                                    className="h-4 w-4 text-muted-foreground"
                                                    aria-hidden="true"
                                                />
                                                {group.employee_name ?? `Employee #${group.employee_id}`}
                                            </p>
                                            <ul className="mt-2 space-y-1.5">
                                                {group.changes.map((change, changeIndex) => (
                                                    <li
                                                        key={
                                                            change.id ??
                                                            `${group.employee_id}-${change.action}-${changeIndex}`
                                                        }
                                                        className="flex items-center gap-2 text-sm"
                                                    >
                                                        <span
                                                            className={cn(
                                                                'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                                                ACTION_TONES[change.action],
                                                            )}
                                                        >
                                                            {ROSTER_CHANGE_ACTION_LABELS[change.action]}
                                                        </span>
                                                        <span className="truncate text-muted-foreground">
                                                            {changeContext(change) || 'Shift change'}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                                No changes to save. {mutations.length}{' '}
                                {mutations.length === 1 ? 'edit' : 'edits'} staged so far.
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <AlertDialog.Cancel asChild>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onCancel}
                                className={secondaryButtonClasses}
                            >
                                Cancel
                            </button>
                        </AlertDialog.Cancel>
                        <button
                            type="button"
                            disabled={busy || !hasChanges || isStale}
                            onClick={onSave}
                            className={primaryButtonClasses}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <Send className="h-4 w-4" aria-hidden="true" />
                                    Save Changes & Notify
                                </>
                            )}
                        </button>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}
