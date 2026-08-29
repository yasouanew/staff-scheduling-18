import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { cn } from '@/lib/utils';
import { COMPANY_STATUS_LABELS, type CompanyStatus } from '@/types/company';

interface CompanyStatusBadgeProps {
    /** Company lifecycle status to visualise. */
    status: CompanyStatus;
    /** Additional container classes. */
    className?: string;
}

/** Per-status semantic tone + dot token pairing. */
const STATUS_MAP: Record<CompanyStatus, { tone: BadgeTone; dot: string }> = {
    active: { tone: 'success', dot: 'bg-success' },
    inactive: { tone: 'neutral', dot: 'bg-muted-foreground' },
    suspended: { tone: 'danger', dot: 'bg-danger' },
};

/**
 * Compact, accessible company-status pill.
 *
 * Built on the shared `Badge` primitive so it matches every other status pill
 * and adapts cleanly to light and dark modes.
 */
export function CompanyStatusBadge({ status, className }: CompanyStatusBadgeProps): JSX.Element {
    const { tone, dot } = STATUS_MAP[status];

    return (
        <Badge variant={tone} className={className}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
            {COMPANY_STATUS_LABELS[status]}
        </Badge>
    );
}
