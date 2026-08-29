/**
 * Analytics domain types for the Company Admin dashboard.
 *
 * These describe the *shape* of the data consumed by the charts and activity
 * panel. They are deliberately transport-agnostic: whether the numbers are
 * derived client-side or fetched from an API later, the presentation layer only
 * ever depends on these stable interfaces.
 */

/** Semantic accent tokens available to charts (mapped to CSS variables). */
export type ChartTone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

/* -------------------------------------------------------------------------- */
/* Labor cost                                                                 */
/* -------------------------------------------------------------------------- */

/** Granularity toggle for the labor-cost trend. */
export type LaborCostPeriod = 'weekly' | 'monthly';

/** A single point on the labor-cost-vs-budget trend. */
export interface LaborCostPoint {
    /** ISO date marking the start of the period (stable x-axis key). */
    date: string;
    /** Short axis label, e.g. "W32" (weekly) or "Jul" (monthly). */
    label: string;
    /** Actual labor spend for the period, in AUD. */
    actualCost: number;
    /** Budgeted labor spend for the period, in AUD. */
    budget: number;
}

/** Aggregated labor-cost dataset backing the trend chart. */
export interface LaborCostSeries {
    period: LaborCostPeriod;
    points: LaborCostPoint[];
    /** Sum of actual spend across all points (AUD). */
    totalActual: number;
    /** Sum of budget across all points (AUD). */
    totalBudget: number;
}

/* -------------------------------------------------------------------------- */
/* Scheduled hours                                                            */
/* -------------------------------------------------------------------------- */

/** A single scheduled-vs-worked hours data point. */
export interface ScheduledHoursPoint {
    date: string;
    label: string;
    /** Total scheduled hours for the period. */
    scheduledHours: number;
    /** Total actually-worked hours for the period. */
    actualHours: number;
}

/** Scheduled-hours dataset (weekly trend). */
export interface ScheduledHoursSeries {
    points: ScheduledHoursPoint[];
    /** Average scheduled hours per period, rounded. */
    averageScheduled: number;
}

/* -------------------------------------------------------------------------- */
/* Department allocation                                                      */
/* -------------------------------------------------------------------------- */

/** Shift distribution for a single department. */
export interface DepartmentAllocationSlice {
    /** Stable identifier (slug) used as a React key. */
    id: string;
    /** Department display name. */
    department: string;
    /** Number of shifts allocated to this department. */
    shiftCount: number;
    /** Total scheduled hours attributed to this department. */
    hours: number;
    /** Semantic tone driving the slice + legend color. */
    tone: ChartTone;
}

/** Department allocation breakdown backing the donut chart. */
export interface DepartmentAllocationBreakdown {
    slices: DepartmentAllocationSlice[];
    /** Sum of all slice `shiftCount` values. */
    totalShifts: number;
}

/* -------------------------------------------------------------------------- */
/* Recent activity                                                            */
/* -------------------------------------------------------------------------- */

/** Discriminating category for a recent-activity entry. */
export type ActivityType =
    | 'shift_published'
    | 'leave_requested'
    | 'employee_joined'
    | 'roster_updated'
    | 'timesheet_approved';

/** A single item in the "Recent Activity" feed. */
export interface ActivityItem {
    id: string;
    type: ActivityType;
    title: string;
    description: string;
    /** ISO timestamp of when the event occurred. */
    timestamp: string;
    /** Human name of the actor who triggered the event. */
    actor: string;
}

/* -------------------------------------------------------------------------- */
/* Aggregate                                                                  */
/* -------------------------------------------------------------------------- */

/** The complete analytics payload rendered by the dashboard page. */
export interface DashboardAnalytics {
    laborCost: LaborCostSeries;
    scheduledHours: ScheduledHoursSeries;
    departmentAllocation: DepartmentAllocationBreakdown;
    recentActivity: ActivityItem[];
}
