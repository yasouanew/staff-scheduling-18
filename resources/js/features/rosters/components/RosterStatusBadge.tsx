import { Archive, CircleCheck, PencilRuler } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { ROSTER_STATUS_LABELS, type RosterStatus } from '@/types/roster-management';

interface RosterStatusBadgeProps {
    /** Lifecycle state to render. */
    status: RosterStatus;
    /** Optional extra classes from the parent layout. */
    className?: string;
}

/** Semantic tone + icon pairing for each roster status. */
const STATUS_STYLES: Record<RosterStatus, { tone: BadgeTone; icon: LucideIcon }> = {
    draft: { tone: 'warning', icon: PencilRuler },
    published: { tone: 'success', icon: CircleCheck },
    archived: { tone: 'neutral', icon: Archive },
};

/**
 * Pill badge describing a roster's lifecycle state.
 *
 * Delegates all colour and shape decisions to the shared `Badge` primitive so
 * roster statuses stay visually identical to every other status pill in the app.
 */
export function RosterStatusBadge({ status, className }: RosterStatusBadgeProps): JSX.Element {
    const { tone, icon: Icon } = STATUS_STYLES[status];

    return (
        <Badge variant={tone} className={className}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {ROSTER_STATUS_LABELS[status]}
        </Badge>
    );
}
