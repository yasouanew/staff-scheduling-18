<?php

namespace App\Services;

use App\Exceptions\BranchCapacityException;
use App\Models\Branch;
use App\Models\Company;

/**
 * Branch employee capacity enforcement.
 *
 * Transitional shape: branch subscriptions are no longer part of the
 * entitlement model (subscriptions are company-scoped). This class no longer
 * activates, deactivates or resizes branches — it only answers one question:
 *
 *   "Can this branch accept additional active employees?"
 *
 * Capacity comes from the company's entitled plan (`max_employees`) and is
 * counted from active employees only (archived / inactive staff do not consume
 * capacity).
 *
 * The branch is always re-scoped against the owning business before anything
 * happens, so a client-supplied `branch_id` / `company_id` can never be trusted
 * on its own. Violations surface as a structured {@see BranchCapacityException}
 * so HTTP callers can translate them into a consistent API error without the
 * decision logic leaking into controllers.
 *
 * @deprecated Transitional. Retained for employee capacity checks only; branch
 *             subscription lifecycle handling was removed. See
 *             plans/remove-branch-subscription-guard.md.
 */
class BranchSubscriptionService
{
    public function __construct(
        private EntitlementService $entitlements,
        private UsageService $usage,
    ) {}

    /**
     * Assert that a business + branch can accept additional active employees.
     *
     * This is the single enforcement point used by employee create / invite /
     * update / transfer. It verifies:
     *
     *  - the branch belongs to the company (cross-business guard);
     *  - the company has an entitled subscription;
     *  - the branch has capacity remaining for the requested additional count.
     *
     * Capacity is resolved by `usage->branchEmployeeCapacity()`, which now
     * always comes from the company's entitled plan (`max_employees`) — there
     * is no per-branch override any more.
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

        $capacity = $this->usage->branchEmployeeCapacity($branch);

        if ($capacity === null) {
            return; // unlimited — nothing to enforce
        }

        $used = $this->usage->activeEmployeesForBranch($branch);
        $remaining = max(0, $capacity - $used);

        if ($used + $additional > $capacity) {
            throw new BranchCapacityException(
                'Employee capacity reached. Contact your company administrator.',
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
