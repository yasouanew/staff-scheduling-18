<?php

namespace App\Services;

use App\Enums\SubscriptionStatus;
use App\Exceptions\BranchCapacityException;
use App\Models\Branch;
use App\Models\BranchSubscription;
use App\Models\Company;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Branch subscription and employee capacity enforcement.
 *
 * Encapsulates the paid-branch business rules (Task 4):
 *
 *  1. The business (company) owns the subscription.
 *  2. A branch is either active or inactive under that subscription.
 *  3. Only active subscribed branches can use paid scheduling functionality.
 *  4. Employees do not carry individual subscriptions — they consume the
 *     capacity of the branch they are assigned to.
 *  5. Employee capacity is calculated from active employees only (archived /
 *     inactive staff do not consume capacity).
 *
 * Every method re-scopes the branch against the authenticated business before
 * doing anything, so a client-supplied `branch_id` / `company_id` can never be
 * trusted on its own. Violations surface as a structured
 * {@see BranchCapacityException} so HTTP callers can translate them into a
 * consistent API error without the decision logic leaking into controllers.
 */
class BranchSubscriptionService
{
    public function __construct(
        private EntitlementService $entitlements,
        private UsageService $usage,
    ) {}

    /**
     * Activate (or refresh) the branch subscription for a branch.
     *
     * Verifies, in order:
     *  - the branch belongs to the given company (cross-business guard);
     *  - the company has a subscription that currently grants access;
     *  - the company is under (or within) its plan's branch limit.
     *
     * A branch that is already covered by an entitled branch subscription is
     * refreshed in place rather than counted twice against the branch limit.
     *
     * @param  int|null  $employeeCapacity  Optional per-branch capacity override
     *                                      (defaults to the plan's max_employees).
     */
    public function activateBranch(
        Company $company,
        Branch $branch,
        ?int $employeeCapacity = null,
        ?User $actor = null,
    ): BranchSubscription {
        return DB::transaction(function () use ($company, $branch, $employeeCapacity, $actor) {
            $this->assertBranchBelongsToCompany($company, $branch);

            $subscription = $this->entitlements->entitledSubscription($company);

            if ($subscription === null) {
                throw new BranchCapacityException(
                    'This business does not have an active subscription.',
                    'NO_ACTIVE_SUBSCRIPTION',
                    ['company_id' => $company->id],
                    422,
                );
            }

            $existing = $branch->activeBranchSubscription();

            if ($existing === null && ! $this->usage->canAddBranch($company)) {
                $branchUsage = $this->usage->branchUsage($company);

                throw new BranchCapacityException(
                    'This business has reached its branch limit for the current plan.',
                    'BRANCH_LIMIT_REACHED',
                    [
                        'used' => $branchUsage['used'],
                        'limit' => $branchUsage['limit'],
                    ],
                    422,
                );
            }

            $startedAt = now();
            $capacity = $employeeCapacity ?? $subscription->plan?->max_employees;

            // Reactivation: when no entitled row exists (the branch was
            // previously deactivated, leaving a cancelled row), reuse that
            // prior row for this branch + subscription instead of inserting a
            // duplicate. The schema enforces a unique [branch_id,
            // subscription_id] pair, so a fresh create() would otherwise fail.
            $existing ??= $branch->branchSubscriptions()
                ->where('subscription_id', $subscription->id)
                ->latest('started_at')
                ->first();

            $branchSubscription = $existing
                ? tap($existing)->update([
                    'subscription_id' => $subscription->id,
                    'status' => SubscriptionStatus::Active->value,
                    'employee_capacity' => $capacity,
                    'started_at' => $startedAt,
                    'ended_at' => null,
                    'cancelled_at' => null,
                ])
                : BranchSubscription::create([
                    'company_id' => $company->id,
                    'branch_id' => $branch->id,
                    'subscription_id' => $subscription->id,
                    'status' => SubscriptionStatus::Active->value,
                    'employee_capacity' => $capacity,
                    'started_at' => $startedAt,
                ]);

            activity('branch')
                ->performedOn($branch)
                ->causedBy($actor)
                ->withProperties([
                    'event' => 'BRANCH_ACTIVATED',
                    'branch_subscription_id' => $branchSubscription->id,
                    'subscription_id' => $subscription->id,
                    'employee_capacity' => $capacity,
                    'started_at' => $startedAt->toISOString(),
                ])
                ->event('branch_activated')
                ->log('Branch activated under the business subscription.');

            return $branchSubscription->refresh();
        });
    }

    /**
     * Deactivate a branch under the business subscription.
     *
     * The current entitled branch subscription is ended (status cancelled,
     * with ended_at and cancelled_at stamped) so the branch no longer grants
     * paid access. Deactivating an already-inactive branch is a no-op that
     * returns the (inactive) branch subscription row.
     */
    public function deactivateBranch(
        Company $company,
        Branch $branch,
        ?User $actor = null,
    ): BranchSubscription {
        return DB::transaction(function () use ($company, $branch, $actor) {
            $this->assertBranchBelongsToCompany($company, $branch);

            $current = $branch->branchSubscriptions()
                ->entitled()
                ->latest('started_at')
                ->first();

            if ($current === null) {
                throw new BranchCapacityException(
                    'This branch is not currently active under the business subscription.',
                    'BRANCH_NOT_ACTIVE',
                    ['branch_id' => $branch->id],
                    422,
                );
            }

            $endedAt = now();

            $current->update([
                'status' => SubscriptionStatus::Cancelled->value,
                'ended_at' => $endedAt,
                'cancelled_at' => $endedAt,
            ]);

            activity('branch')
                ->performedOn($branch)
                ->causedBy($actor)
                ->withProperties([
                    'event' => 'BRANCH_DEACTIVATED',
                    'branch_subscription_id' => $current->id,
                    'subscription_id' => $current->subscription_id,
                    'ended_at' => $endedAt->toISOString(),
                ])
                ->event('branch_deactivated')
                ->log('Branch deactivated under the business subscription.');

            return $current->refresh();
        });
    }

    /**
     * Assert that a business + branch can accept additional active employees.
     *
     * This is the single enforcement point used by employee create / invite /
     * update / transfer. It verifies:
     *
     *  - the branch belongs to the company (cross-business guard);
     *  - the company has an entitled subscription;
     *  - the branch is entitled (has an active branch subscription);
     *  - the branch has capacity remaining for the requested additional count.
     *
     * @param  int  $additional  Number of extra active employees being added.
     *
     * @throws BranchCapacityException when any rule is violated.
     */
    public function assertCanAddEmployee(
        Company $company,
        Branch $branch,
        int $additional = 1,
    ): void {
        $this->assertBranchBelongsToCompany($company, $branch);

        // Serialize concurrent capacity consumption for this branch. The row
        // lock is only effective inside a transaction; every caller already
        // wraps this check plus the employee insert in a DB::transaction, so
        // two requests that both try to take the final capacity slot cannot
        // both pass this check (Request A -> 25, Request B -> 26 rejected).
        Branch::query()->whereKey($branch->id)->lockForUpdate()->first();

        if (! $this->entitlements->hasEntitledSubscription($company)) {
            throw new BranchCapacityException(
                'This business does not have an active subscription.',
                'NO_ACTIVE_SUBSCRIPTION',
                ['company_id' => $company->id],
                422,
            );
        }

        if (! $this->entitlements->branchIsEntitled($branch)) {
            throw new BranchCapacityException(
                'This branch is not active under the business subscription.',
                'BRANCH_NOT_ENTITLED',
                ['branch_id' => $branch->id],
                422,
            );
        }

        $capacity = $this->usage->branchEmployeeCapacity($branch);

        if ($capacity === null) {
            return; // unlimited — nothing to enforce
        }

        $used = $this->usage->activeEmployeesForBranch($branch);
        $remaining = max(0, $capacity - $used);

        if ($used + $additional > $capacity) {
            throw new BranchCapacityException(
                'This branch has reached its employee capacity.',
                'EMPLOYEE_CAPACITY_REACHED',
                [
                    'branch_id' => $branch->id,
                    'used' => $used,
                    'capacity' => $capacity,
                    'remaining' => $remaining,
                    'requested' => $additional,
                ],
                422,
            );
        }
    }

    /**
     * Transfer an employee from their current branch to a destination branch.
     *
     * The destination capacity is validated BEFORE the assignment changes, and
     * the whole operation (validation + re-assignment + audit) runs inside a
     * single database transaction so a rejected transfer never leaves a
     * partially-updated record.
     *
     * The employee's company is used as the authoritative business scope, so a
     * destination branch from another company is always rejected.
     */
    public function transferEmployee(
        Employee $employee,
        Branch $destination,
        ?User $actor = null,
    ): Employee {
        return DB::transaction(function () use ($employee, $destination, $actor) {
            $company = $employee->company;

            $this->assertBranchBelongsToCompany($company, $destination);

            $source = $employee->branch;

            if ($source && $source->id === $destination->id) {
                return $employee->refresh()->load(['company', 'branch']);
            }

            // Validate the destination BEFORE mutating anything.
            $this->assertCanAddEmployee($company, $destination, 1);

            $employee->update(['branch_id' => $destination->id]);

            activity('employee')
                ->performedOn($employee)
                ->causedBy($actor)
                ->withProperties([
                    'event' => 'EMPLOYEE_TRANSFERRED',
                    'from_branch_id' => $source?->id,
                    'to_branch_id' => $destination->id,
                    'company_id' => $company->id,
                ])
                ->event('employee_transferred')
                ->log('Employee transferred to another branch.');

            return $employee->refresh()->load(['company', 'branch']);
        });
    }

    /**
     * Update the employee capacity allocated to a branch.
     *
     * The new capacity may not be lower than the branch's current active
     * employee count (you cannot shrink a branch below the people already in
     * it). Records an EMPLOYEE_CAPACITY_CHANGED audit event.
     */
    public function setEmployeeCapacity(
        Company $company,
        Branch $branch,
        int $employeeCapacity,
        ?User $actor = null,
    ): BranchSubscription {
        return DB::transaction(function () use ($company, $branch, $employeeCapacity, $actor) {
            $this->assertBranchBelongsToCompany($company, $branch);

            // Serialize capacity changes against concurrent employee creation so
            // a resize can never race with an in-flight capacity check.
            Branch::query()->whereKey($branch->id)->lockForUpdate()->first();

            $current = $branch->activeBranchSubscription();

            if ($current === null) {
                // No active branch subscription — nothing to resize. Callers
                // should activate the branch first.
                throw new BranchCapacityException(
                    'This branch is not active under the business subscription.',
                    'BRANCH_NOT_ENTITLED',
                    ['branch_id' => $branch->id],
                    422,
                );
            }

            $used = $this->usage->activeEmployeesForBranch($branch);

            if ($employeeCapacity < $used) {
                throw new BranchCapacityException(
                    'Branch capacity cannot be lower than its current active employee count.',
                    'EMPLOYEE_CAPACITY_TOO_LOW',
                    [
                        'branch_id' => $branch->id,
                        'used' => $used,
                        'capacity' => $employeeCapacity,
                    ],
                    422,
                );
            }

            $previous = $current->employee_capacity;

            $current->update(['employee_capacity' => $employeeCapacity]);

            activity('branch')
                ->performedOn($branch)
                ->causedBy($actor)
                ->withProperties([
                    'event' => 'EMPLOYEE_CAPACITY_CHANGED',
                    'branch_subscription_id' => $current->id,
                    'previous' => $previous,
                    'new' => $employeeCapacity,
                    'active_employees' => $used,
                ])
                ->event('employee_capacity_changed')
                ->log('Branch employee capacity updated.');

            return $current->refresh();
        });
    }

    /**
     * Guard that the branch belongs to the given company.
     *
     * @throws BranchCapacityException when the branch belongs to another business.
     */
    protected function assertBranchBelongsToCompany(Company $company, Branch $branch): void
    {
        if ((int) $branch->company_id !== (int) $company->id) {
            throw new BranchCapacityException(
                'This branch does not belong to the authenticated business.',
                'CROSS_BUSINESS_ACCESS_DENIED',
                [
                    'company_id' => $company->id,
                    'branch_id' => $branch->id,
                ],
                403,
            );
        }
    }
}
