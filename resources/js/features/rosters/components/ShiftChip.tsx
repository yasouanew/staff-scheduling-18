import { Pencil, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Shift, ShiftStatus } from '@/types/shift';

/** Soft semantic tint per shift status, tuned to read as a dense chip. */
const STATUS_TINT: Record<ShiftStatus, string> = {
    scheduled: 'border-l-info bg-info/5',
    completed: 'border-l-success bg-success/5',
    cancelled: 'border-l-muted-foreground bg-muted/50',
    swap_requested: 'border-l-warning bg-warning/5',
};

interface ShiftChipProps {
    shift: Shift;
    /**
     * When true the chip leads with the branch name (the "All branches" view,
     * where branch is the disambiguating fact). When false the branch is already
     * implied by the filter, so the chip leads with the time instead.
     */
    showBranch: boolean;
    /** Opens the edit flow for this shift. */
    onEdit: (shift: Shift) => void;
    /** Requests deletion (the caller confirms before destroying anything). */
    onDelete: (shift: Shift) => void;
    /** Enables HTML5 drag so the chip can be moved to another day. */
    draggable?: boolean;
    onDragStart?: (shift: Shift) => void;
    onDragEnd?: () => void;
}

/**
 * A single shift inside a calendar day cell.
 *
 * Quick actions stay hidden until hover/focus so a dense month grid is not a wall
 * of icons, but they remain keyboard reachable (`focus-within`) rather than being
 * mouse-only.
 */
export function ShiftChip({
    shift,
    showBranch,
    onEdit,
    onDelete,
    draggable = false,
    onDragStart,
    onDragEnd,
}: ShiftChipProps): JSX.Element {
    const timeRange = `${shift.startTime}–${shift.endTime}`;
    const branchName = shift.branch?.name ?? 'Unassigned branch';
    const employeeName = shift.employee?.name ?? 'Open shift';

    return (
        <div
            draggable={draggable}
            onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', shift.id);
                onDragStart?.(shift);
            }}
            onDragEnd={onDragEnd}
            className={cn(
                'group/chip relative rounded-md border-l-2 py-1 pl-2 pr-1 text-left transition-colors',
                STATUS_TINT[shift.status],
                draggable && 'cursor-grab active:cursor-grabbing',
            )}
        >
            <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium leading-tight text-foreground">
                        {showBranch ? branchName : timeRange}
                    </p>
                    <p className="truncate text-[10px] leading-tight text-muted-foreground">
                        {showBranch ? timeRange : employeeName}
                    </p>
                </div>

                {/* Quick actions: revealed on hover, always available to keyboards. */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/chip:opacity-100 focus-within:opacity-100">
                    <button
                        type="button"
                        onClick={() => onEdit(shift)}
                        aria-label={`Edit ${branchName} shift at ${timeRange}`}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(shift)}
                        aria-label={`Delete ${branchName} shift at ${timeRange}`}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    );
}
