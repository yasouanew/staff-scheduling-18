<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Branch\ActivateBranchRequest;
use App\Http\Requests\Branch\UpdateBranchCapacityRequest;
use App\Http\Resources\BranchResource;
use App\Models\Branch;
use App\Models\Company;
use App\Services\BranchSubscriptionService;
use App\Services\UsageService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchSubscriptionController extends Controller
{
    use ApiResponse;

    public function __construct(
        private BranchSubscriptionService $branchSubscriptions,
        private UsageService $usage,
    ) {}

    /**
     * Report usage for the authenticated business: branch count vs the plan's
     * branch allowance, plus per-branch employee capacity usage.
     */
    public function usage(Request $request, ?Company $company = null): JsonResponse
    {
        $company = $this->resolveCompany($request, $company);

        // Permission check only — the company is already pinned to the
        // authenticated business by resolveCompany(), so there is no branch to
        // scope against here.
        $this->authorize('viewAny', Branch::class);

        return $this->successResponse(
            $this->usage->usageFor($company),
            'Usage retrieved successfully.'
        );
    }

    /**
     * Activate a branch under the business subscription.
     */
    public function activate(ActivateBranchRequest $request, Branch $branch): JsonResponse
    {
        $this->authorize('activate', $branch);

        $company = $branch->company;

        $branchSubscription = $this->branchSubscriptions->activateBranch(
            $company,
            $branch,
            $request->validated()['employee_capacity'] ?? null,
            $request->user(),
        );

        return $this->successResponse(
            [
                'branch' => new BranchResource($branch->refresh()->load(['company', 'manager'])),
                'branch_subscription' => [
                    'id' => $branchSubscription->id,
                    'status' => $branchSubscription->status,
                    'employee_capacity' => $branchSubscription->employee_capacity,
                    'started_at' => $branchSubscription->started_at?->toISOString(),
                ],
                'usage' => $this->usage->usageFor($company),
            ],
            'Branch activated successfully.'
        );
    }

    /**
     * Deactivate a branch under the business subscription.
     */
    public function deactivate(Request $request, Branch $branch): JsonResponse
    {
        $this->authorize('deactivate', $branch);

        $company = $branch->company;

        $branchSubscription = $this->branchSubscriptions->deactivateBranch(
            $company,
            $branch,
            $request->user(),
        );

        return $this->successResponse(
            [
                'branch' => new BranchResource($branch->refresh()->load(['company', 'manager'])),
                'branch_subscription' => [
                    'id' => $branchSubscription->id,
                    'status' => $branchSubscription->status,
                    'ended_at' => $branchSubscription->ended_at?->toISOString(),
                ],
                'usage' => $this->usage->usageFor($company),
            ],
            'Branch deactivated successfully.'
        );
    }

    /**
     * Update the employee capacity allocated to a branch.
     */
    public function updateCapacity(UpdateBranchCapacityRequest $request, Branch $branch): JsonResponse
    {
        $this->authorize('manageCapacity', $branch);

        $company = $branch->company;

        $branchSubscription = $this->branchSubscriptions->setEmployeeCapacity(
            $company,
            $branch,
            (int) $request->validated()['employee_capacity'],
            $request->user(),
        );

        return $this->successResponse(
            [
                'branch' => new BranchResource($branch->refresh()->load(['company', 'manager'])),
                'branch_subscription' => [
                    'id' => $branchSubscription->id,
                    'employee_capacity' => $branchSubscription->employee_capacity,
                ],
                'usage' => $this->usage->usageFor($company),
            ],
            'Branch capacity updated successfully.'
        );
    }

    /**
     * Resolve the company to report usage for.
     *
     * Non super admins are always scoped to their own company; a super admin
     * may optionally pass a specific company id.
     */
    protected function resolveCompany(Request $request, ?Company $company): Company
    {
        if (! $request->user()->hasRole('super_admin')) {
            return $request->user()->company;
        }

        return $company ?? $request->user()->company;
    }
}
