import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiClient, type ApiSuccessResponse } from '@/lib/api-client';
import type {
    ChartTone,
    DepartmentAllocationBreakdown,
    DepartmentAllocationSlice,
} from '@/types/analytics';

/** Root cache key for all company dashboard overview queries. */
export const DASHBOARD_OVERVIEW_QUERY_KEY = ['dashboard', 'overview'] as const;

/** Company-scoped operational stats surfaced by the real API. */
export interface CompanyDashboardStats {
    totalEmployees: number;
    activeEmployees: number;
    totalBranches: number;
    totalDepartments: number;
    shiftsThisWeek: number;
    pendingLeaveRequests: number;
    publishedRosters: number;
}

/** Full company dashboard overview payload (mapped from `/dashboard/overview`). */
export interface CompanyDashboardOverview {
    stats: CompanyDashboardStats;
    departmentAllocation: DepartmentAllocationBreakdown;
    week: { start: string; end: string };
}

/** Raw company overview response from the API (snake_case). */
interface CompanyOverviewDto {
    scope: 'company';
    stats: {
        total_employees: number;
        active_employees: number;
        total_branches: number;
        total_departments: number;
        shifts_this_week: number;
        pending_leave_requests: number;
        published_rosters: number;
    };
    department_allocation: {
        department_id: number;
        department: string;
        shift_count: number;
    }[];
    week: { start: string; end: string };
}

/** Cycled semantic tones so each department slice is visually distinct. */
const DEPARTMENT_TONES: readonly ChartTone[] = ['primary', 'success', 'warning', 'info', 'danger'];

/** Map the real department-allocation payload into presentational chart slices. */
function mapDepartmentAllocation(
    rows: CompanyOverviewDto['department_allocation'],
): DepartmentAllocationSlice[] {
    return rows.map((row, index) => ({
        id: String(row.department_id),
        department: row.department,
        shiftCount: row.shift_count,
        tone: DEPARTMENT_TONES[index % DEPARTMENT_TONES.length],
    }));
}

/** Fetch and map the real company-scoped dashboard overview. */
async function fetchCompanyOverview(): Promise<CompanyDashboardOverview> {
    const response = await apiClient.get<ApiSuccessResponse<CompanyOverviewDto>>(
        '/dashboard/overview',
    );
    const dto = response.data.data;

    const slices = mapDepartmentAllocation(dto.department_allocation);

    return {
        stats: {
            totalEmployees: dto.stats.total_employees,
            activeEmployees: dto.stats.active_employees,
            totalBranches: dto.stats.total_branches,
            totalDepartments: dto.stats.total_departments,
            shiftsThisWeek: dto.stats.shifts_this_week,
            pendingLeaveRequests: dto.stats.pending_leave_requests,
            publishedRosters: dto.stats.published_rosters,
        },
        departmentAllocation: {
            slices,
            totalShifts: slices.reduce((sum, slice) => sum + slice.shiftCount, 0),
        },
        week: dto.week,
    };
}

/**
 * Provides the company admin dashboard with its real operational snapshot from
 * the backend. Returns the standard query result so the page can render
 * loading / error / empty states while the chart components stay pure and
 * prop-driven.
 */
export function useCompanyDashboardOverview(): UseQueryResult<CompanyDashboardOverview, Error> {
    return useQuery<CompanyDashboardOverview, Error>({
        queryKey: DASHBOARD_OVERVIEW_QUERY_KEY,
        queryFn: fetchCompanyOverview,
        staleTime: 60_000,
    });
}
