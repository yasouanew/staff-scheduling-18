import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge, type BadgeTone } from '@/Components/ui/badge';
import type { LeaveStatus } from '@/types/availability';

interface LeaveStatusBadgeProps {
    /** Leave workflow status to visualise. */
    status: LeaveStatus;
}

/** Per-status label, semantic tone, and icon pairing. */
const STATUS_MAP: Record<LeaveStatus, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
    approved: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
    pending: { label: 'Pending', tone: 'warning', icon: Clock },
    rejected: { label: 'Rejected', tone: 'danger', icon: XCircle },
};

/**
 * Compact, accessible leave-status pill.
 *
 * Built on the shared `Badge` primitive so leave statuses match every other
 * status pill and adapt automatically between light and dark mode.
 */
export function LeaveStatusBadge({ status }: LeaveStatusBadgeProps): JSX.Element {
    const { label, tone, icon: Icon } = STATUS_MAP[status];

    return (
        <Badge variant={tone}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
        </Badge>
    );
}
