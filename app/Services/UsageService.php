<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Plan;
use Illuminate\Support\Collection;

/**
 * Centralized usage calculation for a business.
 *
 * Answers "how much of the plan's allowance is this company using?" for both
 * branch count and per-branch employee capacity, always scoped to the given
 * business (never to a client-supplied company/branch id alone).
 *
 * The shape mirrors the plan allowances:
 *
 *     {
 *         "branches": { "used": 2, "limit": 5 },
 *         "branch_usage": [
 *             { "branch_id": 1, "employees_used": 20, "capacity": 25, "remaining": 5 }
 *         ]
 *     }
 *
 * "Active employees" are employees with `status = active` (archived/inactive
 * staff do not consume capacity, per the business rules).
 */
class UsageService
{
    public function __construct(
        private EntitlementService $entitlements,
    ) {}

    /**
     * Full usage snapshot for a business.
     *
     * @return array{
     *     branches: array{used: int, limit: int|null},
     *     branch_usage: list<array{branch_id: int, employees_used: int, capacity: int|null, remaining: int|null}>
     * }
     */
    public function usageFor(Company $company): array
    {
        return [
            'branches' => $this->branchUsage($company),
            'branch_usage' => $this->branchUsageDetails($company),
        ];
    }

    /**
     * Count of active branches for the business.
     *
     * A branch counts toward the plan's branch allowance only once it actually
     * carries an entitled (paid / trialing) branch subscription. A branch that
     * merely exists with `status = active` but has not been activated under the
     * business subscription is dormant and consumes no allowance.
     */
    public function activeBranches(Company $company): int
    {
        return $company->branches()
            ->whereHas('branchSubscriptions', function ($query): void {
                $query->entitled()->where(function ($period): void {
                    $period->whereNull('ended_at')->orWhere('ended_at', '>', now());
                });
            })
            ->count();
    }

    /**
     * The maximum number of branches allowed by the business's entitled plan,
     * or null when unlimited.
     */
    public function maxBranches(Company $company): ?int
    {
        $plan = $this->entitlements->entitledPlan($company);

        return $plan?->max_branches;
    }

    /**
     * Branch allowance summary: used vs limit (null limit = unlimited).
     *
     * @return array{used: int, limit: int|null}
     */
    public function branchUsage(Company $company): array
    {
        return [
            'used' => $this->activeBranches($company),
            'limit' => $this->maxBranches($company),
        ];
    }

    /**
     * Whether the business can still add an active branch under its plan.
     */
    public function canAddBranch(Company $company): bool
    {
        $limit = $this->maxBranches($company);

        return $limit === null || $this->activeBranches($company) < $limit;
    }

    /**
     * Count of active employees assigned to a branch.
     *
     * Archived/inactive employees are excluded so they do not consume capacity.
     */
    public function activeEmployeesForBranch(Branch $branch): int
    {
        return $branch->employees()->active()->count();
    }

    /**
     * Count of active employees across the whole business.
     */
    public function activeEmployees(Company $company): int
    {
        return $company->employees()->active()->count();
    }

    /**
     * The employee capacity allocated to a branch (branch subscription override,
     * falling back to the plan's max_employees), or null when unlimited.
     */
    public function branchEmployeeCapacity(Branch $branch): ?int
    {
        return $this->entitlements->branchEmployeeCapacity($branch);
    }

    /**
     * The remaining capacity for a branch (capacity minus active employees), or
     * null when the branch is unlimited.
     */
    public function remainingEmployeeCapacity(Branch $branch): ?int
    {
        $capacity = $this->branchEmployeeCapacity($branch);

        if ($capacity === null) {
            return null;
        }

        return max(0, $capacity - $this->activeEmployeesForBranch($branch));
    }

    /**
     * Whether a branch can accept one more active employee.
     */
    public function canAddEmployee(Branch $branch): bool
    {
        $capacity = $this->branchEmployeeCapacity($branch);

        return $capacity === null || $this->activeEmployeesForBranch($branch) < $capacity;
    }

    /**
     * Per-branch usage details for every active branch of the business.
     *
     * @return list<array{branch_id: int, employees_used: int, capacity: int|null, remaining: int|null}>
     */
    public function branchUsageDetails(Company $company): array
    {
        return $company->branches()
            ->whereHas('branchSubscriptions', function ($query): void {
                $query->entitled()->where(function ($period): void {
                    $period->whereNull('ended_at')->orWhere('ended_at', '>', now());
                });
            })
            ->get()
            ->map(fn (Branch $branch) => [
                'branch_id' => $branch->id,
                'employees_used' => $this->activeEmployeesForBranch($branch),
                'capacity' => $this->branchEmployeeCapacity($branch),
                'remaining' => $this->remainingEmployeeCapacity($branch),
            ])
            ->values()
            ->all();
    }

    /**
     * Convenience: the entitled plan for a business (used internally and by
     * reporting endpoints so they never hard-code plan names).
     */
    public function entitledPlan(Company $company): ?Plan
    {
        return $this->entitlements->entitledPlan($company);
    }
}
