import { AlertTriangle, Trash2, UserRound } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/Components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/Components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RosterGridRow } from '@/types/roster-management';

import { formatHours, OPEN_SHIFTS_ROW_KEY } from '../lib/roster-week';

interface RosterGridEmployeeCellProps {
    /** The row whose employee identity is being rendered. */
    row: RosterGridRow;
    /** Extra classes for sticky/border treatment supplied by the grid. */
    className?: string;
    /** Fires when the row's bin icon is used to remove the employee for the week. */
    onDeleteEmployee?: (row: RosterGridRow) => void;
    /** Disables the delete icon while a mutation is in flight. */
    actionsDisabled?: boolean;
}

/** Initials for the avatar fallback, e.g. `Ada Lovelace` -> `AL`. */
function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
}

/**
 * The sticky left-hand identity cell of a matrix row.
 *
 * Shows the employee's avatar (ringed in their position colour), name, primary
 * role and their total payable hours for the week, plus a conflict indicator
 * when any shift in the row is flagged. Purely presentational.
 */
export function RosterGridEmployeeCell({
    row,
    className,
    onDeleteEmployee,
    actionsDisabled = false,
}: RosterGridEmployeeCellProps): JSX.Element {
    const isOpenRow = row.key === OPEN_SHIFTS_ROW_KEY;

    return (
        <div
            className={cn(
                'flex items-center gap-3 bg-card px-3 py-2',
                className,
            )}
        >
            <Avatar
                className={cn(
                    'h-9 w-9 shrink-0 ring-2 ring-offset-1 ring-offset-card',
                    // Neutral ring unless the row's position defines a colour.
                    row.positionColor === null ? 'ring-border' : 'ring-transparent',
                )}
                style={row.positionColor ? { boxShadow: `0 0 0 2px ${row.positionColor}` } : undefined}
            >
                {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
                <AvatarFallback className="text-xs">
                    {isOpenRow ? <UserRound className="h-4 w-4" aria-hidden="true" /> : initialsOf(row.name)}
                </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
                    <span className="truncate">{row.name}</span>
                    {row.hasConflict && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    className="shrink-0 text-warning"
                                    aria-label="This row has scheduling conflicts"
                                >
                                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                One or more shifts in this row have a scheduling conflict.
                            </TooltipContent>
                        </Tooltip>
                    )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                    {row.positionName ?? (isOpenRow ? 'Needs assignment' : 'No role set')}
                </p>
            </div>

            <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatHours(row.totalMinutes)}
                </p>
                <p className="text-xs text-muted-foreground">
                    {row.shiftCount} {row.shiftCount === 1 ? 'shift' : 'shifts'}
                </p>
            </div>

            {/* Remove the employee for the week (all of their shifts). Hidden
                for the synthetic open-shifts row, which has no single owner. */}
            {!isOpenRow && row.employeeId !== null && onDeleteEmployee && (
                <button
                    type="button"
                    onClick={() => onDeleteEmployee(row)}
                    disabled={actionsDisabled}
                    title={`Remove ${row.name} from this week`}
                    aria-label={`Remove ${row.name} from this week`}
                    className={cn(
                        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground shadow-sm transition-colors',
                        'hover:border-danger/30 hover:bg-danger/10 hover:text-danger',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'disabled:pointer-events-none disabled:opacity-40',
                        // Always visible on touch; revealed on hover on desktop.
                        'opacity-100 md:opacity-0 md:group-hover:opacity-100',
                    )}
                >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
