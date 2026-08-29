<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\Plan;
use App\Models\Roster;
use App\Models\Shift;
use App\Models\Subscription;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    use ApiResponse;

    /**
     * Return a role-aware analytics overview for the authenticated user.
     *
     * Super admins receive a cross-tenant platform snapshot, while company
     * admins and schedulers receive metrics scoped to their own company.
     */
    public function overview(Request $request): JsonResponse
    {
        $user = $request->user();

        $payload = $user->hasRole('super_admin')
            ? $this->platformOverview()
            : $this->companyOverview((int) $user->company_id);

        return $this->successResponse($payload, 'Dashboard overview retrieved successfully.');
    }

    /**
     * Build the cross-tenant platform snapshot for super admins.
     *
     * @return array<string, mixed>
     */
    protected function platformOverview(): array
    {
        $totalCompanies = Company::count();
        $activeCompanies = Company::where('status', 'active')->count();
        $totalEmployees = Employee::count();
        $activeSubscriptions = Subscription::where('status', 'active')->count();

        $planDistribution = Plan::query()
            ->withCount(['subscriptions as active_subscriptions_count' => function ($query) {
                $query->where('status', 'active');
            }])
            ->get()
            ->map(fn (Plan $plan) => [
                'id' => $plan->id,
                'name' => $plan->name,
                'tenant_count' => (int) $plan->active_subscriptions_count,
            ])
            ->values()
            ->all();

        return [
            'scope' => 'platform',
            'stats' => [
                'total_companies' => $totalCompanies,
                'active_companies' => $activeCompanies,
                'total_employees' => $totalEmployees,
                'active_subscriptions' => $activeSubscriptions,
            ],
            'plan_distribution' => $planDistribution,
            'recent_companies' => Company::query()
                ->latest()
                ->limit(5)
                ->get(['id', 'name', 'status', 'created_at'])
                ->map(fn (Company $company) => [
                    'id' => $company->id,
                    'name' => $company->name,
                    'status' => $company->status,
                    'created_at' => $company->created_at?->toIso8601String(),
                ])
                ->all(),
        ];
    }

    /**
     * Build the company-scoped snapshot for admins and schedulers.
     *
     * @return array<string, mixed>
     */
    protected function companyOverview(int $companyId): array
    {
        $weekStart = Carbon::now()->startOfWeek();
        $weekEnd = Carbon::now()->endOfWeek();

        $totalEmployees = Employee::where('company_id', $companyId)->count();
        $activeEmployees = Employee::where('company_id', $companyId)
            ->where('status', 'active')
            ->count();
        $totalBranches = Branch::where('company_id', $companyId)->count();
        $totalDepartments = Department::where('company_id', $companyId)->count();

        $shiftsThisWeek = Shift::where('company_id', $companyId)
            ->whereBetween('date', [$weekStart->toDateString(), $weekEnd->toDateString()])
            ->count();

        $pendingLeave = LeaveRequest::where('company_id', $companyId)
            ->where('status', 'pending')
            ->count();

        $publishedRosters = Roster::where('company_id', $companyId)
            ->where('status', 'published')
            ->count();

        $departmentAllocation = Department::query()
            ->where('company_id', $companyId)
            ->withCount(['shifts' => function ($query) use ($weekStart, $weekEnd) {
                $query->whereBetween('date', [$weekStart->toDateString(), $weekEnd->toDateString()]);
            }])
            ->get()
            ->map(fn (Department $department) => [
                'department_id' => $department->id,
                'department' => $department->name,
                'shift_count' => (int) $department->shifts_count,
            ])
            ->values()
            ->all();

        return [
            'scope' => 'company',
            'stats' => [
                'total_employees' => $totalEmployees,
                'active_employees' => $activeEmployees,
                'total_branches' => $totalBranches,
                'total_departments' => $totalDepartments,
                'shifts_this_week' => $shiftsThisWeek,
                'pending_leave_requests' => $pendingLeave,
                'published_rosters' => $publishedRosters,
            ],
            'department_allocation' => $departmentAllocation,
            'week' => [
                'start' => $weekStart->toDateString(),
                'end' => $weekEnd->toDateString(),
            ],
        ];
    }
}
