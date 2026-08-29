import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { cn } from '@/lib/utils';
import { SHIFT_TEMPLATE_STATUS_LABELS, type ShiftTemplateStatus } from '@/types/shift-template';

interface ShiftTemplateStatusBadgeProps {
    /** Lifecycle status of the template. */
    status: ShiftTemplateStatus;
    /** Optional extra classes for layout tweaks. */
    className?: string;
}

/** Semantic tone + dot token pairing for each template status. */
const STATUS_MAP: Record<ShiftTemplateStatus, { tone: BadgeTone; dot: string }> = {
    active: { tone: 'success', dot: 'bg-success' },
    inactive: { tone: 'neutral', dot: 'bg-muted-foreground' },
};

/**
 * Compact, accessible pill describing whether a template can still be used to
 * build shifts.
 *
 * Built on the shared `Badge` primitive so it matches every other status pill
 * and adapts cleanly to light and dark modes.
 */
export function ShiftTemplateStatusBadge({
    status,
    className,
}: ShiftTemplateStatusBadgeProps): JSX.Element {
    const { tone, dot } = STATUS_MAP[status];

    return (
        <Badge variant={tone} className={className}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
            {SHIFT_TEMPLATE_STATUS_LABELS[status]}
        </Badge>
    );
}
