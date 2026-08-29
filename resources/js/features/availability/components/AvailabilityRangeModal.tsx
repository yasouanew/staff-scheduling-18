import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Copy, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import {
    DAY_LABELS,
    DAY_ORDER,
    DAY_SHORT_LABELS,
    WEEKDAY_ORDER,
    type AvailabilityRange,
    type DayOfWeek,
} from '@/types/employee-availability';

import { findOverlap, formatDuration, timeToMinutes } from '../lib/availability-grid';

import { TimeRangePicker } from './TimeRangePicker';

/** Payload emitted when the modal is submitted. */
export interface AvailabilityRangeSubmit {
    day: DayOfWeek;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    /** Additional days the block should be duplicated onto. */
    copyToDays: DayOfWeek[];
    /** Present when editing an existing draft range. */
    editingKey: string | null;
}

/** Props for {@link AvailabilityRangeModal}. */
interface AvailabilityRangeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Day the block belongs to. */
    day: DayOfWeek;
    /** The range being edited, or `null` when adding. */
    range: AvailabilityRange | null;
    /** All ranges already on {@link day}, used for overlap detection. */
    dayRanges: readonly AvailabilityRange[];
    /** Commits the block to the parent's draft. */
    onSubmit: (payload: AvailabilityRangeSubmit) => void;
}

/** Shared button classes. */
const primaryButton =
    'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70';

const secondaryButton =
    'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Default block for a new range: a standard 9–5 day. */
const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

/**
 * Add / edit dialog for a single availability block.
 *
 * Validates ordering and overlaps inline before allowing submission, and offers
 * a "copy to other days" control so a 9–5 block can be applied across the week
 * in one action. State is local to the dialog; the parent owns the draft and
 * decides how to persist it.
 */
export function AvailabilityRangeModal({
    open,
    onOpenChange,
    day,
    range,
    dayRanges,
    onSubmit,
}: AvailabilityRangeModalProps): JSX.Element {
    const isEditing = range !== null;

    const [startTime, setStartTime] = useState(DEFAULT_START);
    const [endTime, setEndTime] = useState(DEFAULT_END);
    const [isAvailable, setIsAvailable] = useState(true);
    const [copyToDays, setCopyToDays] = useState<DayOfWeek[]>([]);
    const [submitting, setSubmitting] = useState(false);

    // Re-seed the fields whenever the dialog opens for a different target so a
    // previous edit never leaks into the next one.
    useEffect(() => {
        if (!open) return;

        setStartTime(range?.startTime ?? DEFAULT_START);
        setEndTime(range?.endTime ?? DEFAULT_END);
        setIsAvailable(range?.isAvailable ?? true);
        setCopyToDays([]);
        setSubmitting(false);
    }, [open, range]);

    const orderError =
        timeToMinutes(endTime) <= timeToMinutes(startTime)
            ? 'End time must be after the start time.'
            : undefined;

    const overlap = orderError
        ? { hasOverlap: false, conflict: null }
        : findOverlap(dayRanges, { startTime, endTime }, range?.key);

    const canSubmit = !orderError && !overlap.hasOverlap;

    const toggleCopyDay = (target: DayOfWeek): void => {
        setCopyToDays((current) =>
            current.includes(target)
                ? current.filter((value) => value !== target)
                : [...current, target],
        );
    };

    const handleSubmit = (): void => {
        if (!canSubmit) return;

        setSubmitting(true);
        onSubmit({
            day,
            startTime,
            endTime,
            isAvailable,
            copyToDays,
            editingKey: range?.key ?? null,
        });
        onOpenChange(false);
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                <Dialog.Content
                    className={cn(
                        'fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
                        'rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none',
                    )}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <Dialog.Title className="text-lg font-semibold text-foreground">
                                {isEditing ? 'Edit availability' : 'Add availability'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                {DAY_LABELS[day]} · {formatDuration(startTime, endTime)}
                            </Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                aria-label="Close dialog"
                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </Dialog.Close>
                    </div>

                    <div className="mt-6 space-y-6">
                        <TimeRangePicker
                            startTime={startTime}
                            endTime={endTime}
                            onStartChange={setStartTime}
                            onEndChange={setEndTime}
                            endError={orderError}
                            disabled={submitting}
                        />

                        {/* Availability vs explicit unavailable block */}
                        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4">
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium text-foreground">
                                    Available for shifts
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Turn off to record an explicit unavailable block.
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isAvailable}
                                aria-label="Available for shifts"
                                onClick={() => setIsAvailable((value) => !value)}
                                className={cn(
                                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                    isAvailable ? 'bg-success' : 'bg-muted',
                                )}
                            >
                                <span
                                    className={cn(
                                        'inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform',
                                        isAvailable ? 'translate-x-6' : 'translate-x-1',
                                    )}
                                />
                            </button>
                        </div>

                        {/* Overlap warning */}
                        {overlap.hasOverlap && overlap.conflict ? (
                            <div
                                role="alert"
                                className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4"
                            >
                                <AlertTriangle
                                    className="mt-0.5 h-4 w-4 shrink-0 text-danger"
                                    aria-hidden="true"
                                />
                                <p className="text-sm text-danger">
                                    This overlaps an existing block ({overlap.conflict.startTime}–
                                    {overlap.conflict.endTime}). Adjust the times or edit that block
                                    instead.
                                </p>
                            </div>
                        ) : null}

                        {/* Copy to other days */}
                        {!isEditing ? (
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    <Copy className="h-4 w-4" aria-hidden="true" />
                                    Also apply to
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                    {DAY_ORDER.filter((value) => value !== day).map((value) => {
                                        const checked = copyToDays.includes(value);

                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                aria-pressed={checked}
                                                onClick={() => toggleCopyDay(value)}
                                                className={cn(
                                                    'h-9 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                    checked
                                                        ? 'border-primary bg-primary text-primary-foreground'
                                                        : 'border-input bg-card text-foreground hover:bg-secondary',
                                                )}
                                            >
                                                {DAY_SHORT_LABELS[value]}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCopyToDays(
                                            WEEKDAY_ORDER.filter((value) => value !== day).slice(),
                                        )
                                    }
                                    className="text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Select all weekdays
                                </button>
                            </fieldset>
                        ) : null}
                    </div>

                    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <Dialog.Close asChild>
                            <button type="button" className={secondaryButton}>
                                Cancel
                            </button>
                        </Dialog.Close>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!canSubmit || submitting}
                            className={primaryButton}
                        >
                            {submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : null}
                            {isEditing ? 'Update block' : 'Add block'}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
