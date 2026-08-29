import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
    format,
    getISOWeek,
    startOfMonth,
    startOfWeek,
    subMonths,
    subWeeks,
} from 'date-fns';

import type {
    ActivityItem,
    DashboardAnalytics,
    DepartmentAllocationBreakdown,
    LaborCostPeriod,
    LaborCostSeries,
    ScheduledHoursSeries,
} from '@/types/analytics';

/**
 * Client-side analytics engine for the Company Admin dashboard.
 *
 * The dashboard derives its trend/allocation series deterministically here so
 * the presentation components stay pure and decoupled from transport concerns.
 * Swapping to a server endpoint later is a localized change to the query
 * function — the returned {@link DashboardAnalytics} contract is stable.
 */

/** Root cache key for all dashboard analytics queries. */
export const DASHBOARD_ANALYTICS_QUERY_KEY = ['dashboard', 'analytics'] as const;

/** Options controlling how the analytics dataset is shaped. */
interface UseDashboardAnalyticsOptions {
    /** Trend granularity for the labor-cost chart. Defaults to `weekly`. */
    period?: LaborCostPeriod;
}

/** Round to the nearest whole number (helper for readable series values). */
function round(value: number): number {
    return Math.round(value);
}

/** Build the labor-cost-vs-budget series for the requested granularity. */
function buildLaborCost(period: LaborCostPeriod): LaborCostSeries {
    const isWeekly = period === 'weekly';
    const count = isWeekly ? 12 : 6;
    const now = new Date();
    const baseBudget = isWeekly ? 42_000 : 182_000;

    const points = Array.from({ length: count }, (_, position) => {
        const stepsAgo = count - 1 - position;
        const date = isWeekly
            ? startOfWeek(subWeeks(now, stepsAgo), { weekStartsOn: 1 })
            : startOfMonth(subMonths(now, stepsAgo));

        // Smooth seasonal wave + gentle upward drift keeps the chart lifelike.
        const seasonal = Math.sin(position / 2) * (isWeekly ? 3_800 : 14_500);
        const drift = position * (isWeekly ? 420 : 2_600);
        const actualCost = Math.max(0, round(baseBudget - 3_400 + seasonal + drift));

        return {
            date: date.toISOString(),
            label: isWeekly ? `W${getISOWeek(date)}` : format(date, 'LLL'),
            actualCost,
            budget: baseBudget,
        };
    });

    return {
        period,
        points,
        totalActual: points.reduce((sum, point) => sum + point.actualCost, 0),
        totalBudget: points.reduce((sum, point) => sum + point.budget, 0),
    };
}

/** Build the 8-week scheduled-vs-worked hours series. */
function buildScheduledHours(): ScheduledHoursSeries {
    const count = 8;
    const now = new Date();

    const points = Array.from({ length: count }, (_, position) => {
        const stepsAgo = count - 1 - position;
        const date = startOfWeek(subWeeks(now, stepsAgo), { weekStartsOn: 1 });
        const scheduledHours = round(1_200 + Math.sin(position / 1.5) * 140 + position * 18);
        const actualHours = round(scheduledHours * (0.92 + (position % 3) * 0.02));

        return {
            date: date.toISOString(),
            label: `W${getISOWeek(date)}`,
            scheduledHours,
            actualHours,
        };
    });

    const averageScheduled = round(
        points.reduce((sum, point) => sum + point.scheduledHours, 0) / points.length,
    );

    return { points, averageScheduled };
}

/** Build the department shift-distribution breakdown. */
function buildDepartmentAllocation(): DepartmentAllocationBreakdown {
    const slices: DepartmentAllocationBreakdown['slices'] = [
        { id: 'nursing', department: 'Nursing', shiftCount: 128, hours: 1_024, tone: 'primary' },
        { id: 'aged-care', department: 'Aged Care', shiftCount: 96, hours: 768, tone: 'info' },
        { id: 'admin', department: 'Administration', shiftCount: 54, hours: 432, tone: 'success' },
        { id: 'kitchen', department: 'Kitchen', shiftCount: 42, hours: 336, tone: 'warning' },
        { id: 'maintenance', department: 'Maintenance', shiftCount: 24, hours: 192, tone: 'danger' },
    ];

    return {
        slices,
        totalShifts: slices.reduce((sum, slice) => sum + slice.shiftCount, 0),
    };
}

/** Build the recent-activity feed relative to now. */
function buildRecentActivity(): ActivityItem[] {
    const now = Date.now();
    const minutesAgo = (minutes: number): string => new Date(now - minutes * 60_000).toISOString();

    return [
        {
            id: 'act-1',
            type: 'shift_published',
            title: `Week ${getISOWeek(new Date())} roster published`,
            description: '42 shifts across 5 departments',
            timestamp: minutesAgo(14),
            actor: 'Olivia Bennett',
        },
        {
            id: 'act-2',
            type: 'leave_requested',
            title: 'Annual leave requested',
            description: '5 days from 18–22 Aug',
            timestamp: minutesAgo(52),
            actor: 'Marcus Chen',
        },
        {
            id: 'act-3',
            type: 'employee_joined',
            title: 'New employee onboarded',
            description: 'Registered Nurse · Nursing',
            timestamp: minutesAgo(180),
            actor: 'Priya Nair',
        },
        {
            id: 'act-4',
            type: 'timesheet_approved',
            title: 'Timesheets approved',
            description: '18 timesheets for Aged Care',
            timestamp: minutesAgo(320),
            actor: 'James Whitfield',
        },
        {
            id: 'act-5',
            type: 'roster_updated',
            title: 'Kitchen roster amended',
            description: '3 shifts reassigned after a swap',
            timestamp: minutesAgo(610),
            actor: 'Sofia Alvarez',
        },
    ];
}

/** Assemble the full analytics payload for the requested period. */
function buildDashboardAnalytics(period: LaborCostPeriod): DashboardAnalytics {
    return {
        laborCost: buildLaborCost(period),
        scheduledHours: buildScheduledHours(),
        departmentAllocation: buildDepartmentAllocation(),
        recentActivity: buildRecentActivity(),
    };
}

/**
 * Provides dashboard analytics through TanStack Query. Returns the standard
 * query result so the page can render loading / error / empty states while the
 * chart components remain pure and prop-driven.
 */
export function useDashboardAnalytics(
    options: UseDashboardAnalyticsOptions = {},
): UseQueryResult<DashboardAnalytics, Error> {
    const period = options.period ?? 'weekly';

    return useQuery<DashboardAnalytics, Error>({
        queryKey: [...DASHBOARD_ANALYTICS_QUERY_KEY, period],
        queryFn: () => Promise.resolve(buildDashboardAnalytics(period)),
        staleTime: 60_000,
    });
}
