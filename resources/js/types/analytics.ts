/**
 * Analytics domain types for the Company Admin dashboard.
 *
 * These describe the shape of the data consumed by the dashboard charts. All
 * values are sourced from the real company-scoped `/dashboard/overview` API —
 * nothing is derived or fabricated client-side.
 */

/** Semantic accent tokens available to charts (mapped to CSS variables). */
export type ChartTone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

/* -------------------------------------------------------------------------- */
/* Department allocation                                                      */
/* -------------------------------------------------------------------------- */

/** Shift distribution for a single department. */
export interface DepartmentAllocationSlice {
    /** Stable identifier (department id) used as a React key. */
    id: string;
    /** Department display name. */
    department: string;
    /** Number of shifts allocated to this department. */
    shiftCount: number;
    /** Semantic tone driving the slice + legend color. */
    tone: ChartTone;
}

/** Department allocation breakdown backing the donut chart. */
export interface DepartmentAllocationBreakdown {
    slices: DepartmentAllocationSlice[];
    /** Sum of all slice `shiftCount` values. */
    totalShifts: number;
}
