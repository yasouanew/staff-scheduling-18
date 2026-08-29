import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { cn } from '@/lib/utils';
import type { EmployeeStatus } from '@/types/employee';

interface StatusBadgeProps {
    /** Employment status to visualise. */
    status: EmployeeStatus;
}

/** Per-status label, semantic tone, and dot colour pairing. */
const STATUS_MAP: Record<EmployeeStatus, { label: string; tone: BadgeTone; dot: string }> = {
    active: { label: 'Active', tone: 'success', dot: 'bg-success' },
    pending: { label: 'Pending', tone: 'warning', dot: 'bg-warning' },
    inactive: { label: 'Inactive', tone: 'neutral', dot: 'bg-muted-foreground' },
};

/**
 * Compact, accessible employment-status pill.
 *
 * Built on the shared `Badge` primitive so it inherits the standard soft fill
 * and adapts automatically between light and dark mode.
 */
export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
    const { label, tone, dot } = STATUS_MAP[status];

    return (
        <Badge variant={tone}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
            {label}
        </Badge>
    );
}
