/**
 * Roster management domain types (backed by the `/v1/rosters` API).
 *
 * These describe the persisted weekly roster records and their nested shifts as
 * exposed by `RosterResource` / `ShiftResource`. They are intentionally separate
 * from `types/roster.ts`, which models the interactive FullCalendar canvas.
 */

/** Lifecycle state of a weekly roster. */
export type RosterStatus = 'draft' | 'published' | 'archived';

/** Every roster status, ordered for filter controls. */
export const ROSTER_STATUSES: readonly RosterStatus[] = [
    'draft',
    'published',
    'archived',
] as const;

/** Human-readable labels for {@link RosterStatus}. */
export const ROSTER_STATUS_LABELS: Record<RosterStatus, string> = {
    draft: 'Draft',
    published: 'Published',
    archived: 'Archived',
};

/** Lifecycle state of an individual shift inside a roster. */
export type RosterShiftStatus =
    | 'scheduled'
    | 'confirmed'
    | 'completed'
    | 'cancelled'
    | 'open';

/* -------------------------------------------------------------------------- */
/* Post-publication change management                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every change a published roster can record.
 *
 * Mirrors `App\Enums\RosterChangeType` on the backend — the single source of
 * truth for roster publishing and post-publication change events. `roster_updated`
 * is the aggregate notification type; the rest are the granular change actions.
 */
export type RosterChangeAction =
    | 'roster_published'
    | 'roster_updated'
    | 'shift_added'
    | 'shift_updated'
    | 'shift_cancelled'
    | 'shift_assigned'
    | 'shift_reassigned'
    | 'shift_location_changed';

/** Human-readable labels for {@link RosterChangeAction}. */
export const ROSTER_CHANGE_ACTION_LABELS: Record<RosterChangeAction, string> = {
    roster_published: 'Roster published',
    roster_updated: 'Roster updated',
    shift_added: 'Shift added',
    shift_updated: 'Shift updated',
    shift_cancelled: 'Shift cancelled',
    shift_assigned: 'Shift assigned',
    shift_reassigned: 'Shift reassigned',
    shift_location_changed: 'Shift location changed',
};

/**
 * A single record from the roster change/audit history or a change preview.
 *
 * `old_data` / `new_data` are canonical shift snapshots (see
 * `RosterChangeDetector::snapshot()`), so the UI can render a before/after
 * diff without needing to fetch the shifts again.
 */
export interface RosterChange {
    id: number;
    rosterId: number;
    shiftId: number | null;
    /** Affected employee id, or `null` for roster-level events (e.g. publish). */
    employeeId: number | null;
    action: RosterChangeAction;
    oldData: Record<string, unknown> | null;
    newData: Record<string, unknown> | null;
    performedBy: number | null;
    performedByName: string | null;
    employeeName: string | null;
    createdAt: string | null;
}

/**
 * A mutation staged by the manager against a published roster.
 *
 * This is the wire contract of `POST /rosters/{roster}/changes/preview` and
 * `/changes/apply`. The backend is the source of truth: it detects the concrete
 * change actions from these intents, so the client never names an action itself.
 */
export interface RosterChangeMutation {
    type: 'add' | 'update' | 'cancel' | 'reassign';
    /** Shift id for `update`/`cancel`/`reassign`; omitted for `add`. */
    id?: string;
    /** Target employee for `reassign`. */
    employee_id?: string | null;
    /** New attribute values for `add`/`update`. */
    shift?: Record<string, unknown>;
}

/** Human-readable labels for {@link RosterShiftStatus}. */
export const ROSTER_SHIFT_STATUS_LABELS: Record<RosterShiftStatus, string> = {
    open: 'Open',
    scheduled: 'Scheduled',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

/**
 * Validation flags returned alongside a shift by the roster detail endpoint.
 *
 * These are transient (derived per request by `RosterConflictService`) and are
 * rendered by the weekly grid as amber conflict overlays. Every flag defaults to
 * `false` when the backend omits it, so the UI degrades safely.
 */
export interface RosterShiftFlags {
    /** Employee exceeds weekly (38h) or daily (10h) ordinary hours. */
    overtimeRisk: boolean;
    /** Shift falls on a day the employee has approved/pending leave. */
    leaveConflict: boolean;
    /** Employee has another overlapping shift on the same day. */
    doubleBooked: boolean;
}

/**
 * A single shift belonging to a roster.
 *
 * `date` is an ISO date (`yyyy-MM-dd`) and the times are wall-clock `HH:mm`
 * strings, matching the backend contract.
 */
export interface RosterShift {
    id: string;
    rosterId: string | null;
    branchId: number | null;
    /** Assigned employee id, or `null` for an unfilled (open) shift. */
    employeeId: string | null;
    /** Display name of the assigned employee, when the relation is loaded. */
    employeeName: string | null;
    /** Avatar URL of the assigned employee, when available. */
    employeeAvatarUrl: string | null;
    /** Position/role id, when assigned. */
    positionId: number | null;
    /** Position/role name, when the relation is loaded. */
    positionName: string | null;
    /**
     * Position hex colour (e.g. `#2563EB`) used for the shift block's 3px left
     * border. `null` falls back to a neutral accent.
     */
    positionColor: string | null;
    /** Owning department id (used to group the week grid). */
    departmentId: number | null;
    /** Owning department name, when the relation is loaded. */
    departmentName: string | null;
    /** Branch name of the shift (or of the employee), when loaded. */
    branchName: string | null;
    /** Shift date, ISO `yyyy-MM-dd`. */
    date: string | null;
    /** Local start time, `HH:mm`. */
    startTime: string | null;
    /** Local end time, `HH:mm`. */
    endTime: string | null;
    /** Break length in minutes. */
    breakMinutes: number;
    /** When true the break is paid and is not deducted from payable hours. */
    isPaidBreak: boolean;
    /** Headcount required for this shift. */
    requiredStaff: number;
    status: RosterShiftStatus;
    notes: string | null;
    /** Derived conflict indicators rendered as overlays on the shift block. */
    flags: RosterShiftFlags;
}

/* -------------------------------------------------------------------------- */
/* Weekly matrix grid view models                                             */
/* -------------------------------------------------------------------------- */

/** A single cell of the matrix: one employee row × one weekday column. */
export interface RosterGridCell {
    /** ISO date (`yyyy-MM-dd`) of the column. */
    date: string;
    /** Shifts for this employee on this day, ordered by start time. */
    shifts: RosterShift[];
}

/**
 * One row of the matrix grid.
 *
 * Rows are keyed by employee, with unassigned (open) shifts collected into a
 * single synthetic row so vacancies stay visible in the same matrix.
 */
export interface RosterGridRow {
    /** Stable row key (employee id, or `open` for the vacancy row). */
    key: string;
    /** Employee id, or `null` for the open-shifts row. */
    employeeId: string | null;
    /** Employee display name, or `Open shifts`. */
    name: string;
    /** Avatar URL, when available. */
    avatarUrl: string | null;
    /** Primary position/role of the employee across the week. */
    positionName: string | null;
    /** Position colour used to tint the row's avatar ring. */
    positionColor: string | null;
    /** Seven cells, Monday-first, aligned to the roster week. */
    cells: RosterGridCell[];
    /** Total payable minutes for the row across the week. */
    totalMinutes: number;
    /** Number of shifts in the row. */
    shiftCount: number;
    /** True when any shift in the row carries a conflict flag. */
    hasConflict: boolean;
}

/**
 * A department/branch grouping of matrix rows, rendered as a sticky sub-header
 * so large rosters stay readable.
 */
export interface RosterGridGroup {
    /** Stable group key. */
    key: string;
    /** Group label, e.g. `Front of House · Sydney CBD`. */
    label: string;
    /** Department colour hex, when available. */
    color: string | null;
    /** Employee rows belonging to this group. */
    rows: RosterGridRow[];
}


/** A weekly roster record. */
export interface Roster {
    id: string;
    companyId: number | null;
    branchId: number | null;
    /** Branch name, when the relation is loaded. */
    branchName: string | null;
    /** Week start date, ISO `yyyy-MM-dd`. */
    weekStart: string | null;
    /** Week end date, ISO `yyyy-MM-dd`. */
    weekEnd: string | null;
    status: RosterStatus;
    /** ISO 8601 timestamp of publication, or `null` while unpublished. */
    publishedAt: string | null;
    /** Name of the user who published the roster, when loaded. */
    publishedByName: string | null;
    /**
     * Optimistic-lock version, bumped on every publish and post-publication
     * save. The change preview/apply endpoints reject a stale `version` with
     * HTTP 409, so the UI must refresh before retrying.
     */
    version: number;
    /** Server-side shift count (list view). */
    shiftsCount: number | null;
    /** Nested shifts (detail view only). */
    shifts: RosterShift[];
    createdAt: string | null;
    updatedAt: string | null;
}

/** Server-side filters accepted by the roster list endpoint. */
export interface RosterListParams {
    /** Restrict to a single lifecycle state. */
    status?: RosterStatus;
    /** Restrict to a single branch. */
    branchId?: string;
    /** Only rosters starting on/after this ISO date. */
    weekStart?: string;
    /** Only rosters ending on/before this ISO date. */
    weekEnd?: string;
    /** Page size (defaults to the backend's 15). */
    perPage?: number;
}

/** Aggregate counters rendered in the roster list KPI row. */
export interface RosterStats {
    total: number;
    draft: number;
    published: number;
    shifts: number;
}

/** Payable-hours summary derived from a roster's shifts. */
export interface RosterWeekSummary {
    /** Number of shifts in the roster. */
    shiftCount: number;
    /** Total payable hours across every shift. */
    totalHours: number;
    /** Count of shifts without an assigned employee. */
    openShifts: number;
    /** Distinct employees rostered during the week. */
    employeeCount: number;
}
