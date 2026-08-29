import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { LEAVE_TYPE_STATUS_LABELS, type LeaveTypeStatus } from '@/types/leave-type';

/** Semantic tone for each leave-type lifecycle state. */
const STATUS_TONES: Record<LeaveTypeStatus, BadgeTone> = {
    active: 'success',
    inactive: 'neutral',
};

/**
 * Semantic lifecycle badge for an employee-visible leave type.
 *
 * Built on the shared `Badge` primitive so it matches every other status pill.
 */
export function LeaveTypeStatusBadge({ status }: { status: LeaveTypeStatus }): JSX.Element {
    return <Badge variant={STATUS_TONES[status]}>{LEAVE_TYPE_STATUS_LABELS[status]}</Badge>;
}
