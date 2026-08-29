import { format, parseISO } from 'date-fns';

import { cn } from '@/lib/utils';
import type { Shift, ShiftColorTheme } from '@/types/roster';

import { ROSTER_DEPARTMENTS, ROSTER_EMPLOYEES } from '../hooks/useRoster';

interface ShiftEventCardProps {
    /** The shift data to render. */
    shift: Shift;
}

/** Maps a colour theme to its soft-background + border + text token triplet. */
const THEME_CLASSES: Record<ShiftColorTheme, string> = {
    primary: 'border-l-primary bg-primary/10 text-primary',
    success: 'border-l-success bg-success/10 text-success',
    warning: 'border-l-warning bg-warning/10 text-warning',
    danger: 'border-l-danger bg-danger/10 text-danger',
    info: 'border-l-info bg-info/10 text-info',
};

/** Derives up-to-two uppercase initials from a full name. */
function getInitials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
}

/**
 * Custom FullCalendar event content. Displays employee avatar (with initials
 * fallback), role, department tag, and shift times. Styled exclusively with
 * semantic design tokens mapped to the shift's department colour theme.
 */
export function ShiftEventCard({ shift }: ShiftEventCardProps): JSX.Element {
    const employee = ROSTER_EMPLOYEES.find((item) => item.id === shift.employeeId);
    const department = ROSTER_DEPARTMENTS.find((item) => item.id === shift.departmentId);

    const startTime = format(parseISO(shift.startTime), 'h:mm a');
    const endTime = format(parseISO(shift.endTime), 'h:mm a');

    return (
        <div
            className={cn(
                'flex h-full flex-col gap-1 overflow-hidden rounded-lg border-l-4 p-2 shadow-sm',
                THEME_CLASSES[shift.colorTheme],
            )}
        >
            {/* Employee row with avatar */}
            <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card text-[10px] font-semibold text-foreground shadow-sm">
                    {employee?.avatarUrl ? (
                        <img
                            src={employee.avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        getInitials(employee?.name ?? 'Unknown')
                    )}
                </span>
                <span className="min-w-0 truncate text-xs font-semibold">
                    {employee?.name ?? 'Unknown Employee'}
                </span>
            </div>

            {/* Role label */}
            <p className="truncate text-xs font-medium">{shift.role}</p>

            {/* Department + time range */}
            <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="truncate font-medium">{department?.name ?? 'Unknown Dept'}</span>
                <span className="opacity-75">•</span>
                <span className="whitespace-nowrap opacity-75">
                    {startTime} – {endTime}
                </span>
            </div>
        </div>
    );
}
