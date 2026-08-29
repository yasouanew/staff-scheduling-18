/**
 * Domain types for the Shift Templates feature.
 *
 * These are the canonical shapes consumed by the shift-templates feature. They
 * are intentionally decoupled from the transport/DTO layer (see
 * `useShiftTemplates`) so UI components depend only on stable, well-named
 * fields.
 *
 * The backend `ShiftTemplateResource` exposes: name, description, start_time,
 * end_time, break_minutes (the "break duration"), is_paid_break, color and
 * status, plus the owning company / branch / department / position relations.
 */

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/** Lifecycle state of a template (matches the backend `in:active,inactive` rule). */
export const SHIFT_TEMPLATE_STATUSES = ['active', 'inactive'] as const;

/** Template lifecycle state used to drive status badges and filters. */
export type ShiftTemplateStatus = (typeof SHIFT_TEMPLATE_STATUSES)[number];

/** Human-readable labels for each template status. */
export const SHIFT_TEMPLATE_STATUS_LABELS: Record<ShiftTemplateStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
};

/* -------------------------------------------------------------------------- */
/* Colour palette                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Curated template colour swatches (hex values match the backend's
 * `regex:/^#([A-Fa-f0-9]{6})$/` rule). These are data values sent to the API —
 * not Tailwind styling — so hard-coded hex here is intentional and permitted.
 */
export const SHIFT_TEMPLATE_COLOR_OPTIONS = [
    '#2563EB', // blue
    '#0891B2', // cyan
    '#16A34A', // green
    '#CA8A04', // amber
    '#EA580C', // orange
    '#DC2626', // red
    '#DB2777', // pink
    '#7C3AED', // violet
    '#4B5563', // gray
] as const;

/** Default colour applied to a brand-new template. */
export const DEFAULT_SHIFT_TEMPLATE_COLOR = SHIFT_TEMPLATE_COLOR_OPTIONS[0];

/* -------------------------------------------------------------------------- */
/* Break presets                                                              */
/* -------------------------------------------------------------------------- */

/** Common unpaid/paid break durations offered as quick presets (minutes). */
export const BREAK_MINUTE_PRESETS = [0, 15, 30, 45, 60] as const;

/* -------------------------------------------------------------------------- */
/* Core domain model                                                          */
/* -------------------------------------------------------------------------- */

/** A reusable shift template belonging to a company. */
export interface ShiftTemplate {
    /** Stable unique identifier (stringified for routing convenience). */
    id: string;
    /** Owning company id. */
    companyId: number | null;
    /** Optional branch scope. */
    branchId: number | null;
    /** Optional department scope. */
    departmentId: number | null;
    /** Default position (role) filled by shifts built from this template. */
    positionId: number | null;
    /** Template name, e.g. `Morning Open`. */
    name: string;
    /** Optional longer description of the template. */
    description: string | null;
    /** Shift start in 24-hour `HH:mm`. */
    startTime: string;
    /** Shift end in 24-hour `HH:mm` (may be earlier than start for overnight). */
    endTime: string;
    /** Break duration in minutes. */
    breakMinutes: number;
    /** Whether the break is paid (affects payable hours). */
    isPaidBreak: boolean;
    /** Hex colour used for calendar/roster tinting, e.g. `#2563EB`. */
    color: string | null;
    /** Current lifecycle status. */
    status: ShiftTemplateStatus;
    /** Owning branch name (present when the relation is loaded). */
    branchName: string | null;
    /** Owning department name (present when the relation is loaded). */
    departmentName: string | null;
    /** Default position name (present when the relation is loaded). */
    positionName: string | null;
    /** ISO-8601 creation timestamp. */
    createdAt: string | null;
    /** ISO-8601 last-updated timestamp. */
    updatedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Query params                                                               */
/* -------------------------------------------------------------------------- */

/** Filters accepted by the shift-templates list endpoint. */
export interface ShiftTemplateListParams {
    search?: string;
    status?: ShiftTemplateStatus;
    branchId?: number;
    departmentId?: number;
    positionId?: number;
    perPage?: number;
}

/* -------------------------------------------------------------------------- */
/* Roster options (used when turning a template into a real shift)            */
/* -------------------------------------------------------------------------- */

/** A selectable roster week used as the target of a template-created shift. */
export interface RosterOption {
    /** Stable roster identifier. */
    id: string;
    /** `YYYY-MM-DD` first day of the roster week. */
    weekStart: string | null;
    /** `YYYY-MM-DD` last day of the roster week. */
    weekEnd: string | null;
    /** Roster lifecycle status, e.g. `draft` / `published`. */
    status: string | null;
    /** Branch this roster belongs to (when loaded). */
    branchName: string | null;
    /** Branch id, used to scope the created shift. */
    branchId: number | null;
}
