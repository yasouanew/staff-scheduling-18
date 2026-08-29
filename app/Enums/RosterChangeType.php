<?php

namespace App\Enums;

/**
 * Centralized roster change / notification types.
 *
 * Single source of truth for every roster publishing and post-publication
 * change event. Used by the change detector, the audit history and the
 * notification payloads so no string is ever scattered through the codebase.
 *
 * The React web app mirrors these in
 * `resources/js/types/roster-management.ts` (ROSTER_CHANGE_TYPES).
 */
enum RosterChangeType: string
{
    case RosterPublished = 'roster_published';
    case RosterUpdated = 'roster_updated';
    case ShiftAdded = 'shift_added';
    case ShiftUpdated = 'shift_updated';
    case ShiftCancelled = 'shift_cancelled';
    case ShiftAssigned = 'shift_assigned';
    case ShiftReassigned = 'shift_reassigned';
    case ShiftLocationChanged = 'shift_location_changed';

    /**
     * Human-readable label for UI rendering.
     */
    public function label(): string
    {
        return match ($this) {
            self::RosterPublished => 'Roster published',
            self::RosterUpdated => 'Roster updated',
            self::ShiftAdded => 'Shift added',
            self::ShiftUpdated => 'Shift updated',
            self::ShiftCancelled => 'Shift cancelled',
            self::ShiftAssigned => 'Shift assigned',
            self::ShiftReassigned => 'Shift reassigned',
            self::ShiftLocationChanged => 'Shift location changed',
        };
    }
}
