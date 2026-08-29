<?php

namespace App\Http\Controllers\Api;

use App\Enums\Feature;
use App\Http\Controllers\Controller;
use App\Http\Requests\Billing\ChangeSubscriptionPlanRequest;
use App\Http\Resources\SubscriptionSummaryResource;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Services\EntitlementService;
use App\Services\SubscriptionService;
use App\Services\UsageService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The authenticated business's own subscription management surface.
 *
 * Unlike the super-admin `SubscriptionController` (which operates on an
 * explicit `companies/{company}` path), every endpoint here is scoped to the
 * caller's own company — the SPA never has to thread a company id through the
 * URL and a user can never target another business.
 *
 * Endpoints:
 *
 *   GET    subscription            → current plan, status, trial, usage, features
 *   GET    subscription/plans      → the active plan catalogue (billing values)
 *   GET    subscription/usage      → branch + per-branch employee usage
 *   GET    subscription/features   → feature access for the current plan
 *   POST   subscription/upgrade    → switch to a larger / equal plan
 *   POST   subscription/downgrade  → switch to a smaller plan (usage-validated)
 *   POST   subscription/cancel     → cancel the subscription
 *
 * Reads are guarded by `subscription.view`; mutations by `subscription.manage`
 * (both enforced through the existing SubscriptionPolicy). Employees and
 * ordinary branch managers never carry those permissions, so they cannot reach
 * billing mutations. Plan pricing is resolved from the database in the service
 * layer — the backend never trusts a client-supplied price.
 */
class PlanSubscriptionController extends Controller
{
    use ApiResponse;

    public function __construct(
        private SubscriptionService $subscriptionService,
        private EntitlementService $entitlements,
        private UsageService $usage,
    ) {}

    /**
     * The business's current subscription summary.
     */
    public function show(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('viewAny', [Subscription::class, $company]);

        $subscription = $this->entitlements->entitledSubscription($company);

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription),
            'Subscription retrieved successfully.'
        );
    }

    /**
     * The active plan catalogue with database pricing values.
     *
     * Stripe implementation ids are intentionally excluded — the SPA only needs
     * the display name, description, price, currency and allowances.
     */
    public function plans(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('viewAny', [Subscription::class, $company]);

        $plans = Plan::query()
            ->active()
            ->orderBy('sort_order')
            ->orderBy('price_monthly')
            ->get()
            ->map(fn (Plan $plan): array => [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'description' => $plan->description,
                'currency' => $plan->currency ?? 'AUD',
                'price_monthly' => $plan->price_monthly,
                'price_six_monthly' => $plan->price_six_monthly,
                'price_yearly' => $plan->price_yearly,
                'interval' => ['monthly', 'six_month', 'yearly'],
                'max_branches' => $plan->max_branches,
                'max_employees' => $plan->max_employees,
                'features' => $plan->features ?? [],
            ]);

        return $this->successResponse($plans, 'Plans retrieved successfully.');
    }

    /**
     * Branch + per-branch employee usage against the plan's allowances.
     *
     * Returns the Task 5 shape: a top-level `branches` counter plus a
     * `branches_usage` list carrying id / name / active / employees_used /
     * employee_capacity / remaining for every active branch.
     */
    public function usage(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('viewAny', [Subscription::class, $company]);

        $plan = $this->usage->entitledPlan($company);

        $branchesUsage = $company->branches()
            ->withCount(['employees as employees_used' => fn ($query) => $query->active()])
            ->get()
            ->map(fn ($branch) => [
                'id' => $branch->id,
                'name' => $branch->name,
                'active' => $this->entitlements->branchIsEntitled($branch),
                'employees_used' => (int) $branch->employees_used,
                'employee_capacity' => $this->entitlements->branchEmployeeCapacity($branch),
                'remaining' => $this->usage->remainingEmployeeCapacity($branch),
            ])
            ->values();

        return $this->successResponse([
            'branches' => [
                'used' => $this->usage->activeBranches($company),
                'limit' => $plan?->max_branches,
            ],
            'branches_usage' => $branchesUsage,
        ], 'Usage retrieved successfully.');
    }

    /**
     * Feature access for the business's current plan.
     */
    public function features(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('viewAny', [Subscription::class, $company]);

        $plan = $this->entitlements->entitledPlan($company);

        $features = collect(Feature::cases())->map(function (Feature $feature) use ($company): array {
            $configuration = $this->entitlements->configuration($company, $feature);

            return [
                'key' => $feature->value,
                'label' => $feature->label(),
                'branch_scoped' => $feature->isBranchScoped(),
                'enabled' => $configuration !== null && $configuration['enabled'],
                'limit' => $configuration['limit'] ?? null,
            ];
        })->values();

        return $this->successResponse([
            'plan' => $plan ? [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
            ] : null,
            'entitled' => $this->entitlements->hasEntitledSubscription($company),
            'features' => $features,
        ], 'Features retrieved successfully.');
    }

    /**
     * Upgrade the subscription to a larger (or equal) plan.
     *
     * The target plan is resolved from the database by id; the backend decides
     * whether the change is an upgrade based on the plan's allowances, never on
     * a client-supplied price. Billing cycle may change in the same request.
     */
    public function upgrade(ChangeSubscriptionPlanRequest $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->requireSubscription($company);

        $this->authorize('update', [$subscription, $company]);

        $plan = Plan::findOrFail($request->validated()['plan_id']);

        $subscription = $this->subscriptionService->changePlan(
            $subscription,
            $plan,
            $request->validated()['billing_cycle'] ?? null,
            $request->user(),
        );

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription),
            'Subscription upgraded successfully.'
        );
    }

    /**
     * Downgrade the subscription to a smaller plan.
     *
     * Rejected (structured BillingLimitException, 422) when the business
     * currently uses more active branches than the target plan's max_branches,
     * or has more active employees than the target plan's max_employees.
     */
    public function downgrade(ChangeSubscriptionPlanRequest $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->requireSubscription($company);

        $this->authorize('update', [$subscription, $company]);

        $plan = Plan::findOrFail($request->validated()['plan_id']);

        $subscription = $this->subscriptionService->changePlan(
            $subscription,
            $plan,
            $request->validated()['billing_cycle'] ?? null,
            $request->user(),
        );

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription),
            'Subscription downgraded successfully.'
        );
    }

    /**
     * Cancel the business's subscription.
     *
     * Cancels at the end of the current billing period by default; pass
     * `immediately = true` to cancel right away.
     */
    public function cancel(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->requireSubscription($company);

        $this->authorize('update', [$subscription, $company]);

        $subscription = $this->subscriptionService->cancel(
            $subscription,
            $request->boolean('immediately', false),
        );

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription),
            'Subscription cancelled successfully.'
        );
    }

    /**
     * Resolve the company the request acts on.
     *
     * Non super admins are always scoped to their own company; super admins
     * fall back to their own company as well (they may use the dedicated
     * companies/{company} subscription routes for cross-tenant management).
     */
    protected function resolveCompany(Request $request): Company
    {
        $company = $request->user()->company;

        if (! $company) {
            abort(403, 'No company is associated with this account.');
        }

        return $company;
    }

    /**
     * The business's entitled subscription, or a 404 when unsubscribed.
     */
    protected function requireSubscription(Company $company): Subscription
    {
        $subscription = $this->entitlements->entitledSubscription($company);

        abort_unless($subscription, 404, 'No active subscription exists for this business.');

        return $subscription;
    }
}
