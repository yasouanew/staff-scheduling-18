import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { SHIFT_STATUS_LABELS, type ShiftStatus } from '@/types/shift';

/** Semantic tone for each shift lifecycle state. */
const STATUS_TONES: Record<ShiftStatus, BadgeTone> = {
    scheduled: 'primary',
    completed: 'success',
    cancelled: 'danger',
    swap_requested: 'warning',
};

/**
 * Compact semantic lifecycle label for a shift.
 *
 * Uses the shared `Badge` primitive so shift statuses render with the same soft
 * fill, ring and metrics as every other status pill.
 */
export function ShiftStatusBadge({ status }: { status: ShiftStatus }): JSX.Element {
    return <Badge variant={STATUS_TONES[status]}>{SHIFT_STATUS_LABELS[status]}</Badge>;
}
