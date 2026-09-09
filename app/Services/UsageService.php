<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Centralized usage calculation for a business.
 *
 * Answers "how much of the plan's allowance is this company using?", scoped to
 * the given business (never to a client-supplied company/branch id alone).
 *
 * The primary allowance under the per-seat (active-user) model is `seats`; the
 * legacy branch-count and per-branch employee-capacity shape is retained until
 * the branch subsystem is removed:
 *
 *     {
 *         "seats": { "used": 3, "limit": 5 },
 *         "branches": { "used": 2, "limit": 5 },
 *         "branch_usage": [
 *             { "branch_id": 1, "employees_used": 20, "capacity": 25, "remaining": 5 }
 *         ]
 *     }
 *
 * "Active seats" are user accounts in the company with `role != 'super_admin'`
 * and `status = 'active'` (with or without an employee profile — the founding
 * admin counts). "Active employees" (used only by the legacy branch reporting)
 * are employees with `status = 'active'`.
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
     *     seats: array{used: int, limit: int|null},
     *     branches: array{used: int, limit: int|null},
     *     branch_usage: list<array{branch_id: int, employees_used: int, capacity: int|null, remaining: int|null}>
     * }
     */
    public function usageFor(Company $company): array
    {
        return [
            'seats' => $this->seatUsage($company),
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
     *
     * @deprecated The billing authority is now the active user-account seat
     *             count (see {@see self::activeSeats()}). Retained for legacy
     *             branch capacity reporting until the branch subsystem lands.
     */
    public function activeEmployees(Company $company): int
    {
        return $company->employees()->active()->count();
    }

    /**
     * Count of active user seats in the company.
     *
     * A seat is one active user account (any role except the platform-wide
     * `super_admin`, with or without an employee profile). The optional
     * $exclude lets callers ignore one account when estimating a change.
     */
    public function activeSeats(Company $company, ?User $exclude = null): int
    {
        return User::query()
            ->activeSeats($company->id, $exclude)
            ->count();
    }

    /**
     * The maximum number of active user seats allowed by the business's
     * entitled plan, or null when unlimited.
     */
    public function maxSeats(Company $company): ?int
    {
        return $this->entitledPlan($company)?->maxSeats();
    }

    /**
     * Seat allowance summary: used vs limit (null limit = unlimited).
     *
     * @return array{used: int, limit: int|null}
     */
    public function seatUsage(Company $company): array
    {
        return [
            'used' => $this->activeSeats($company),
            'limit' => $this->maxSeats($company),
        ];
    }

    /**
     * The number of additional seats a company can still activate before its
     * entitled plan is full, or null when the plan is unlimited.
     */
    public function remainingSeats(Company $company): ?int
    {
        $limit = $this->maxSeats($company);

        if ($limit === null) {
            return null;
        }

        return max(0, $limit - $this->activeSeats($company));
    }

    /**
     * Whether the company can still activate one more user seat under its
     * entitled plan.
     */
    public function canActivateSeat(Company $company): bool
    {
        $limit = $this->maxSeats($company);

        return $limit === null || $this->activeSeats($company) < $limit;
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
