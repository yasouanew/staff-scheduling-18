import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { cn } from '@/lib/utils';
import { BRANCH_STATUS_LABELS, type BranchStatus } from '@/types/branch';

interface BranchStatusBadgeProps {
    /** Branch lifecycle status to visualise. */
    status: BranchStatus;
    /** Additional container classes. */
    className?: string;
}

/** Per-status semantic tone + dot token pairing. */
const STATUS_MAP: Record<BranchStatus, { tone: BadgeTone; dot: string }> = {
    active: { tone: 'success', dot: 'bg-success' },
    inactive: { tone: 'neutral', dot: 'bg-muted-foreground' },
};

/**
 * Compact, accessible branch-status pill.
 *
 * Built on the shared `Badge` primitive so it matches every other status pill
 * and adapts cleanly to light and dark modes.
 */
export function BranchStatusBadge({ status, className }: BranchStatusBadgeProps): JSX.Element {
    const { tone, dot } = STATUS_MAP[status];

    return (
        <Badge variant={tone} className={className}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
            {BRANCH_STATUS_LABELS[status]}
        </Badge>
    );
}
