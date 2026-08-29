/**
 * Domain types for the Branches (operating location) feature.
 *
 * These are the canonical shapes consumed by the branches feature. They are
 * intentionally decoupled from the transport/DTO layer (see `useBranches`) so
 * UI components depend only on stable, well-named fields.
 *
 * Timezone catalogues are re-exported from the companies feature to avoid
 * duplicating the market-specific option lists.
 */

import { TIMEZONE_LABELS, TIMEZONE_OPTIONS } from '@/types/company';

export { TIMEZONE_LABELS, TIMEZONE_OPTIONS };

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/** Lifecycle state of a branch (matches the backend `in:active,inactive` rule). */
export const BRANCH_STATUSES = ['active', 'inactive'] as const;

/** Branch lifecycle state used to drive status badges and toggles. */
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

/** Human-readable labels for each branch status. */
export const BRANCH_STATUS_LABELS: Record<BranchStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
};

/* -------------------------------------------------------------------------- */
/* Operating hours & breaks                                                   */
/* -------------------------------------------------------------------------- */

/** Weekdays in roster order; the keys used by a branch's day schedule map. */
export const WEEKDAYS = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
] as const;

/** A single day of the week. */
export type Weekday = (typeof WEEKDAYS)[number];

/** Short labels for the per-day rows (full names are too wide on mobile). */
export const WEEKDAY_LABELS: Record<Weekday, string> = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
};

/**
 * A branch's resolved trading hours and break policy for one weekday.
 *
 * The API always returns all seven days with the branch defaults already merged
 * in, so consumers never re-implement the fallback rule. `isCustom` records
 * whether the day was explicitly overridden or simply inherits the default.
 */
export interface DaySchedule {
    /** False when the branch does not trade on this day. */
    isOpen: boolean;
    /** Opening time as `HH:MM`, or null when unset/closed. */
    opensAt: string | null;
    /** Closing time as `HH:MM`, or null when unset/closed. */
    closesAt: string | null;
    /** Unpaid or paid break length in minutes, or null when unset. */
    breakMinutes: number | null;
    /** Whether the break counts as paid time. */
    breakPaid: boolean;
    /** True when this day overrides the branch default. */
    isCustom: boolean;
}

/** The full week of resolved schedules. */
export type WeekSchedule = Record<Weekday, DaySchedule>;

/* -------------------------------------------------------------------------- */
/* Core domain model                                                          */
/* -------------------------------------------------------------------------- */


/** Minimal employee reference used to represent a branch manager. */
export interface BranchManager {
    /** Employee id (stringified for form/select convenience). */
    id: string;
    /** Employee full display name. */
    name: string;
}

/** A single operating location belonging to a company. */
export interface Branch {
    /** Stable unique identifier (stringified for routing convenience). */
    id: string;
    /** Owning company id. */
    companyId: number | null;
    /** Id of the employee who manages this branch. */
    managerId: string | null;
    /** The managing employee (present when the relation is loaded). */
    manager: BranchManager | null;
    /** Branch display name, e.g. `Sydney CBD`. */
    name: string;

    /** Primary contact phone. */
    phone: string | null;
    /** Street / postal address. */
    address: string | null;
    /** Geographic latitude, when captured. */
    latitude: number | null;
    /** Geographic longitude, when captured. */
    longitude: number | null;
    /** IANA timezone identifier, e.g. `Australia/Sydney`. */
    timezone: string | null;

    /** Standard opening time as `HH:MM`, applied to days without an override. */
    defaultOpensAt: string | null;
    /** Standard closing time as `HH:MM`, applied to days without an override. */
    defaultClosesAt: string | null;
    /** Standard break length in minutes, applied to days without an override. */
    defaultBreakMinutes: number | null;
    /** Whether the standard break is paid time. */
    defaultBreakPaid: boolean;
    /** All seven days with the defaults already resolved. */
    daySchedules: WeekSchedule;

    /** Current lifecycle status. */
    status: BranchStatus;

    /** Owning company name (present when the relation is loaded). */
    companyName: string | null;
    /** Number of linked user accounts (present when counted by the API). */
    usersCount: number | null;
    /** Number of shifts scheduled at this branch (present when counted). */
    shiftsCount: number | null;
    /** ISO-8601 creation timestamp. */
    createdAt: string | null;
    /** ISO-8601 last-updated timestamp. */
    updatedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Query params                                                               */
/* -------------------------------------------------------------------------- */

/** Filters accepted by the branches list endpoint. */
export interface BranchListParams {
    search?: string;
    status?: BranchStatus;
    perPage?: number;
}
