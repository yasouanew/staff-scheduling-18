/**
 * Domain types for the Positions feature.
 *
 * These are the canonical shapes consumed by the positions feature. They are
 * intentionally decoupled from the transport/DTO layer (see `usePositions`) so
 * UI components depend only on stable, well-named fields.
 *
 * The backend `PositionResource` exposes: name (the job "title"), code,
 * description, default_hourly_rate (the "pay scale"), color and status, plus the
 * owning `company` and `department` relations.
 */

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/** Lifecycle state of a position (matches the backend `in:active,inactive` rule). */
export const POSITION_STATUSES = ['active', 'inactive'] as const;

/** Position lifecycle state used to drive status badges and toggles. */
export type PositionStatus = (typeof POSITION_STATUSES)[number];

/** Human-readable labels for each position status. */
export const POSITION_STATUS_LABELS: Record<PositionStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
};

/* -------------------------------------------------------------------------- */
/* Colour palette                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Curated position colour swatches (hex values match the backend's
 * `regex:/^#([A-Fa-f0-9]{6})$/` rule). These are data values sent to the API —
 * not Tailwind styling — so hard-coded hex here is intentional and permitted.
 */
export const POSITION_COLOR_OPTIONS = [
    '#3B82F6', // blue (backend default)
    '#2563EB', // blue
    '#7C3AED', // violet
    '#DB2777', // pink
    '#DC2626', // red
    '#EA580C', // orange
    '#CA8A04', // amber
    '#16A34A', // green
    '#0891B2', // cyan
    '#4B5563', // gray
] as const;

/** Default colour applied to a brand-new position (matches backend default `#3B82F6`). */
export const DEFAULT_POSITION_COLOR = POSITION_COLOR_OPTIONS[0];

/* -------------------------------------------------------------------------- */
/* Core domain model                                                          */
/* -------------------------------------------------------------------------- */

/** A single job position (role) belonging to a company / department. */
export interface Position {
    /** Stable unique identifier (stringified for routing convenience). */
    id: string;
    /** Owning company id. */
    companyId: number | null;
    /** Owning department id (positions may optionally belong to a department). */
    departmentId: number | null;
    /** Position title, e.g. `Barista`. */
    name: string;
    /** Optional short code, e.g. `BAR`. */
    code: string | null;
    /** Optional longer description of the role. */
    description: string | null;
    /** Default hourly pay rate (the "pay scale"), in dollars. */
    defaultHourlyRate: number | null;
    /** Hex colour used for calendar/roster tinting, e.g. `#2563EB`. */
    color: string | null;
    /** Current lifecycle status. */
    status: PositionStatus;
    /** Owning company name (present when the relation is loaded). */
    companyName: string | null;
    /** Owning department name (present when the relation is loaded). */
    departmentName: string | null;
    /** ISO-8601 creation timestamp. */
    createdAt: string | null;
    /** ISO-8601 last-updated timestamp. */
    updatedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Query params                                                               */
/* -------------------------------------------------------------------------- */

/** Filters accepted by the positions list endpoint. */
export interface PositionListParams {
    search?: string;
    status?: PositionStatus;
    departmentId?: number;
    perPage?: number;
}
