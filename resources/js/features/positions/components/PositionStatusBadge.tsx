import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { cn } from '@/lib/utils';
import { POSITION_STATUS_LABELS, type PositionStatus } from '@/types/position';

interface PositionStatusBadgeProps {
    /** Position lifecycle status to visualise. */
    status: PositionStatus;
    /** Additional container classes. */
    className?: string;
}

/** Per-status semantic tone + dot token pairing. */
const STATUS_MAP: Record<PositionStatus, { tone: BadgeTone; dot: string }> = {
    active: { tone: 'success', dot: 'bg-success' },
    inactive: { tone: 'neutral', dot: 'bg-muted-foreground' },
};

/**
 * Compact, accessible position-status pill.
 *
 * Built on the shared `Badge` primitive so it matches every other status pill
 * and adapts cleanly to light and dark modes.
 */
export function PositionStatusBadge({
    status,
    className,
}: PositionStatusBadgeProps): JSX.Element {
    const { tone, dot } = STATUS_MAP[status];

    return (
        <Badge variant={tone} className={className}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
            {POSITION_STATUS_LABELS[status]}
        </Badge>
    );
}
