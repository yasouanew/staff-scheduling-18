/**
 * Employee weekly availability domain types.
 *
 * Mirrors the backend `employee_availabilities` table (`day_of_week`,
 * `start_time`, `end_time`, `is_available`) but expressed in the app's stable
 * camelCase domain language. Transport/DTO concerns stay inside the feature
 * hooks; every component in the editor consumes these types only.
 */

/** Day index as stored by the backend (0 = Sunday … 6 = Saturday). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Display order for the weekly grid.
 *
 * Australian rosters start on Monday, so Sunday (0) is rendered last even
 * though the backend indexes it first.
 */
export const DAY_ORDER: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];

/** Monday–Friday, used by the "copy to weekdays" bulk action. */
export const WEEKDAY_ORDER: readonly DayOfWeek[] = [1, 2, 3, 4, 5];

/** Full day names keyed by backend day index. */
export const DAY_LABELS: Record<DayOfWeek, string> = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
};

/** Three-letter day abbreviations for compact grid headers. */
export const DAY_SHORT_LABELS: Record<DayOfWeek, string> = {
    0: 'Sun',
    1: 'Mon',
    2: 'Tue',
    3: 'Wed',
    4: 'Thu',
    5: 'Fri',
    6: 'Sat',
};

/** Minutes covered by a single grid column. */
export const GRID_SLOT_MINUTES = 30;

/** Total minutes in a day — the grid spans a full 00:00 → 24:00 window. */
export const MINUTES_IN_DAY = 1440;

/** Number of selectable columns per day (48 half-hour slots). */
export const GRID_SLOT_COUNT = MINUTES_IN_DAY / GRID_SLOT_MINUTES;

/**
 * A persisted availability record as returned by
 * `GET /v1/employees/{employee}/availabilities`.
 */
export interface AvailabilitySlot {
    /** Server primary key. */
    id: string;
    /** Owning employee id. */
    employeeId: string;
    /** Day index (0 = Sunday). */
    dayOfWeek: DayOfWeek;
    /** Start time in `HH:mm`. */
    startTime: string;
    /** End time in `HH:mm`. */
    endTime: string;
    /** Active flag — `false` marks an explicit unavailable block. */
    isAvailable: boolean;
}

/**
 * A single editable time range inside the weekly draft.
 *
 * `key` is a client-only identity used for React lists and edit targeting.
 * `serverId` is present only for ranges that already exist on the server,
 * which enables the single-slot `PUT`/`DELETE` fast paths.
 */
export interface AvailabilityRange {
    key: string;
    serverId: string | null;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
}

/** The full week being edited: every day maps to its ordered ranges. */
export type WeeklyAvailabilityDraft = Record<DayOfWeek, AvailabilityRange[]>;

/** Per-day boolean columns used to render / edit the grid selection. */
export type WeeklySelection = Record<DayOfWeek, boolean[]>;

/** Payload item accepted by the bulk sync endpoint. */
export interface AvailabilitySyncSlot {
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
}

/** Input for creating a single availability slot. */
export interface CreateAvailabilitySlotInput {
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
}

/** Input for updating a single persisted availability slot. */
export interface UpdateAvailabilitySlotInput extends CreateAvailabilitySlotInput {
    id: string;
}
