/**
 * Master Roster & Shift Calendar types for the Staff Scheduling SaaS.
 *
 * Defines the shift model rendered on the FullCalendar canvas along with the
 * supporting employee/department lookups and derived roster metrics.
 */

/** Semantic department colour theme mapped to design-system tokens. */
export type ShiftColorTheme = 'primary' | 'success' | 'warning' | 'danger' | 'info';

/**
 * A single scheduled shift block. Times are stored as ISO 8601 datetime
 * strings so they can be passed directly to FullCalendar events.
 */
export interface Shift {
    /** Unique identifier. */
    id: string;
    /** Assigned employee id. */
    employeeId: string;
    /** Owning department id. */
    departmentId: string;
    /** Shift start, ISO 8601 datetime (e.g. '2026-08-10T09:00:00'). */
    startTime: string;
    /** Shift end, ISO 8601 datetime. */
    endTime: string;
    /** Unpaid break duration in minutes, deducted from paid hours. */
    breakMinutes: number;
    /** Role/position label displayed on the event card. */
    role: string;
    /** Semantic colour theme derived from the department. */
    colorTheme: ShiftColorTheme;
}

/** Input shape for creating or editing a shift via the quick modal. */
export interface ShiftInput {
    employeeId: string;
    departmentId: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    role: string;
}

/** Lightweight employee lookup for scheduling + cost calculations. */
export interface RosterEmployee {
    id: string;
    name: string;
    /** Avatar image URL; falls back to initials when absent. */
    avatarUrl?: string;
    /** Simulated hourly wage rate in AUD, used for labour cost estimates. */
    hourlyRate: number;
}

/** Department lookup providing the colour theme + display label. */
export interface RosterDepartment {
    id: string;
    name: string;
    colorTheme: ShiftColorTheme;
}

/**
 * An approved leave or unavailability window used to detect scheduling
 * conflicts when a shift is created, moved, or resized.
 */
export interface AvailabilityWindow {
    /** Employee the window applies to. */
    employeeId: string;
    /** Window start, ISO 8601 datetime. */
    start: string;
    /** Window end, ISO 8601 datetime. */
    end: string;
    /** Human-readable reason, e.g. 'Annual Leave'. */
    reason: string;
}

/** Derived roster summary metrics for the sticky header bar. */
export interface RosterMetrics {
    /** Total paid hours across all shifts (breaks deducted). */
    totalHours: number;
    /** Estimated labour cost in AUD. */
    estimatedCost: number;
    /** Count of active shift blocks. */
    shiftCount: number;
}

/** Result of evaluating a shift against availability windows. */
export interface ConflictResult {
    /** Whether the shift conflicts with an availability window. */
    hasConflict: boolean;
    /** The conflicting window when `hasConflict` is true. */
    window?: AvailabilityWindow;
}
