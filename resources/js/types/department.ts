/**
 * Domain types for the Departments feature.
 *
 * These are the canonical shapes consumed by the departments feature. They are
 * intentionally decoupled from the transport/DTO layer (see `useDepartments`)
 * so UI components depend only on stable, well-named fields.
 *
 * The backend `DepartmentResource` exposes: name, code, description, color and
 * status, plus a `positions_count` and the owning `company` relation.
 */

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/** Lifecycle state of a department (matches the backend `in:active,inactive` rule). */
export const DEPARTMENT_STATUSES = ['active', 'inactive'] as const;

/** Department lifecycle state used to drive status badges and toggles. */
export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];

/** Human-readable labels for each department status. */
export const DEPARTMENT_STATUS_LABELS: Record<DepartmentStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
};

/* -------------------------------------------------------------------------- */
/* Colour palette                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Curated department colour swatches (hex values match the backend's
 * `regex:/^#([A-Fa-f0-9]{6})$/` rule). These are data values sent to the API —
 * not Tailwind styling — so hard-coded hex here is intentional and permitted.
 */
export const DEPARTMENT_COLOR_OPTIONS = [
    '#6366F1', // indigo (backend default)
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

/** Default colour applied to a brand-new department (matches backend default `#6366F1`). */
export const DEFAULT_DEPARTMENT_COLOR = DEPARTMENT_COLOR_OPTIONS[0];

/* -------------------------------------------------------------------------- */
/* Core domain model                                                          */
/* -------------------------------------------------------------------------- */

/** A single organisational department belonging to a company. */
export interface Department {
    /** Stable unique identifier (stringified for routing convenience). */
    id: string;
    /** Owning company id. */
    companyId: number | null;
    /** Department display name, e.g. `Front of House`. */
    name: string;
    /** Optional short code, e.g. `FOH`. */
    code: string | null;
    /** Optional longer description. */
    description: string | null;
    /** Hex colour used for calendar/roster tinting, e.g. `#2563EB`. */
    color: string | null;
    /** Current lifecycle status. */
    status: DepartmentStatus;
    /** Owning company name (present when the relation is loaded). */
    companyName: string | null;
    /** Number of positions in this department (present when counted by the API). */
    positionsCount: number | null;
    /** ISO-8601 creation timestamp. */
    createdAt: string | null;
    /** ISO-8601 last-updated timestamp. */
    updatedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Query params                                                               */
/* -------------------------------------------------------------------------- */

/** Filters accepted by the departments list endpoint. */
export interface DepartmentListParams {
    search?: string;
    status?: DepartmentStatus;
    perPage?: number;
}
