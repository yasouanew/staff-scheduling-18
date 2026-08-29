import { AlertTriangle, Clock, Pencil, Trash2, UserRound } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/Components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ROSTER_SHIFT_STATUS_LABELS, type RosterShift } from '@/types/roster-management';

import {
    describeConflicts,
    formatHours,
    formatShiftTimeRange,
    hasConflict,
    shiftPayableMinutes,
} from '../lib/roster-week';

interface RosterShiftBlockProps {
    /** The shift to render. */
    shift: RosterShift;
    /** Fires when the block is activated (click, Enter or Space). */
    onSelect?: (shift: RosterShift) => void;
    /** Opens the quick editor for this shift. Omit to hide the pencil icon. */
    onEdit?: (shift: RosterShift) => void;
    /** Requests deletion of this shift. Omit to hide the bin icon. */
    onDelete?: (shift: RosterShift) => void;
    /** Disables the inline actions while a mutation is in flight. */
    actionsDisabled?: boolean;
    /** Compact rendering used by the mobile agenda list. */
    dense?: boolean;
    /** Extra classes for grid placement. */
    className?: string;
}

/**
 * Semantic surface treatment per shift status. Cancelled shifts fade back,
 * open shifts read as a dashed vacancy, everything else is a solid card.
 */
const STATUS_SURFACES: Record<RosterShift['status'], string> = {
    open: 'border-dashed border-warning/60 bg-warning/5 hover:bg-warning/10',
    scheduled: 'border-border bg-card hover:bg-accent',
    confirmed: 'border-success/40 bg-success/5 hover:bg-success/10',
    completed: 'border-border bg-muted hover:bg-muted',
    cancelled: 'border-border bg-muted/60 opacity-60 hover:opacity-80',
};

/** Shared styling for the inline edit/delete icon buttons. */
const shiftActionButton = cn(
    'inline-flex h-5 w-5 items-center justify-center rounded border border-border/70',
    'bg-background text-muted-foreground shadow-sm transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-40',
);

/**
 * A single shift rendered inside a matrix cell.
 *
 * Purely presentational: it derives its own labels from the shift but delegates
 * every action to `onSelect`, `onEdit` and `onDelete`. The position colour
 * drives a 3px left border via an inline `borderLeftColor` — that value is API
 * data (a hex colour chosen by the user per position), not a design token, so it
 * cannot come from Tailwind. When no colour is set the block falls back to the
 * semantic `border-primary` utility class.
 *
 * The edit/delete icons are rendered as *siblings* of the main block rather than
 * children: the block itself is a `<button>`, and nesting interactive elements
 * inside a button is invalid HTML and unreachable for assistive technology. They
 * sit in an absolutely positioned overlay revealed on hover/focus.
 */
export function RosterShiftBlock({
    shift,
    onSelect,
    onEdit,
    onDelete,
    actionsDisabled = false,
    dense = false,
    className,
}: RosterShiftBlockProps): JSX.Element {
    const isOpen = shift.status === 'open';
    const conflicts = describeConflicts(shift);
    const conflicted = hasConflict(shift);
    const label = isOpen ? 'Open shift' : (shift.employeeName ?? 'Unassigned');
    const timeRange = formatShiftTimeRange(shift);
    const payable = formatHours(shiftPayableMinutes(shift));
    const hasActions = Boolean(onEdit || onDelete);

    const accessibleLabel = [
        label,
        shift.positionName,
        timeRange,
        ROSTER_SHIFT_STATUS_LABELS[shift.status],
        ...conflicts,
    ]
        .filter(Boolean)
        .join('. ');

    const block = (
        <button
            type="button"
            onClick={() => onSelect?.(shift)}
            aria-label={accessibleLabel}
            className={cn(
                'relative flex w-full flex-col gap-0.5 overflow-hidden rounded-md border border-l-[3px] px-2 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                dense ? 'py-1.5' : 'py-1',
                STATUS_SURFACES[shift.status],
                // Fallback accent when the position has no colour configured.
                shift.positionColor === null && !isOpen && 'border-l-primary',
                conflicted && 'ring-1 ring-inset ring-warning/50',
                // Reserve room on the right so the time never sits under the icons.
                hasActions && 'pr-12',
            )}
            style={shift.positionColor ? { borderLeftColor: shift.positionColor } : undefined}
        >
            <span className="flex items-center gap-1 truncate text-xs font-semibold leading-tight text-foreground">
                {conflicted && (
                    <AlertTriangle className="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
                )}
                {isOpen && !conflicted && (
                    <UserRound className="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
                )}
                <span className="truncate">{timeRange}</span>
            </span>

            <span className="truncate text-[11px] leading-tight text-muted-foreground">
                {shift.positionName ?? label}
            </span>

            {dense && (
                <span className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {payable}
                    {shift.breakMinutes > 0 && ` · ${shift.breakMinutes}m break`}
                </span>
            )}
        </button>
    );

    const tooltipped = (
        <Tooltip>
            <TooltipTrigger asChild>{block}</TooltipTrigger>
            <TooltipContent side="top" className="space-y-1">
                <p className="font-semibold">{label}</p>
                <p className="text-background/80">
                    {timeRange} · {payable} payable
                </p>
                {shift.positionName && <p className="text-background/80">{shift.positionName}</p>}
                {shift.breakMinutes > 0 && (
                    <p className="text-background/80">
                        {shift.breakMinutes}m {shift.isPaidBreak ? 'paid' : 'unpaid'} break
                    </p>
                )}
                {conflicts.map((reason) => (
                    <p key={reason} className="flex items-start gap-1 font-medium">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        {reason}
                    </p>
                ))}
                {shift.notes && <p className="text-background/80">{shift.notes}</p>}
            </TooltipContent>
        </Tooltip>
    );

    // Without inline actions there is nothing to overlay, so skip the wrapper.
    if (!hasActions) {
        return <div className={cn('relative', className)}>{tooltipped}</div>;
    }

    return (
        <div className={cn('group/shift relative', className)}>
            {tooltipped}

            <div
                className={cn(
                    'absolute right-1 top-1 flex items-center gap-1',
                    'opacity-0 transition-opacity duration-150',
                    'group-hover/shift:opacity-100 group-focus-within/shift:opacity-100',
                    // Hover does not exist on touch devices, so always show there.
                    'max-md:opacity-100',
                )}
            >
                {onEdit && (
                    <button
                        type="button"
                        onClick={() => onEdit(shift)}
                        disabled={actionsDisabled}
                        title={`Edit shift ${timeRange}`}
                        aria-label={`Edit shift ${timeRange} for ${label}`}
                        className={cn(shiftActionButton, 'hover:bg-secondary hover:text-foreground')}
                    >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                    </button>
                )}

                {onDelete && (
                    <button
                        type="button"
                        onClick={() => onDelete(shift)}
                        disabled={actionsDisabled}
                        title={`Delete shift ${timeRange}`}
                        aria-label={`Delete shift ${timeRange} for ${label}`}
                        className={cn(shiftActionButton, 'hover:bg-danger/10 hover:text-danger')}
                    >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                )}
            </div>
        </div>
    );
}
