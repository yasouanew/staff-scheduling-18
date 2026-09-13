<?php

namespace App\Services;

use App\Enums\Feature;
use App\Models\Branch;
use App\Models\Company;
use App\Models\Plan;
use App\Models\PlanFeature;
use App\Models\Subscription;
use Illuminate\Support\Collection;

/**
 * Centralized plan and feature entitlement engine.
 *
 * Resolves entitlements for a business (company) by walking the chain:
 *
 *     Business → Active Subscription → Plan → Features
 *
 * Entitlements are company-scoped: branches are an organisational dimension of
 * the business and no longer carry their own subscription. All decision rules
 * (trial, active, past due, cancelled, expired, no subscription) live here so
 * controllers, services, policies, middleware and jobs never hard-code plan
 * names or feature strings.
 */
class EntitlementService
{
    /**
     * Statuses that make a subscription grant access to the service.
     *
     * A trialing subscription only grants access while the trial period is
     * still running; that date check is handled by {@see self::subscriptionIsEntitled}.
     *
     * @var list<string>
     */
    private const ENTITLED_STATUSES = ['trialing', 'active'];

    /**
     * The single authoritative resolver for "does this company have access now?".
     *
     * Every subscription/trial entitlement decision in the codebase goes through
     * this service so there is exactly one rule and one clock (the server's)
     * deciding access. Client-supplied timestamps are never consulted.
     */
    protected function accessState(): AccessStateService
    {
        return app(AccessStateService::class);
    }

    /**
     * Whether the given business currently grants access to a feature.
     *
     * Entitlements are company-scoped: the decision is made purely from the
     * business's entitled plan. The `$branch` parameter is retained for
     * signature compatibility with existing callers and is accepted-and-ignored
     * (no branch-scoped entitlement exists any more).
     */
    public function allows(Company $company, Feature $feature, ?Branch $branch = null): bool
    {
        if (! $this->hasEntitledSubscription($company)) {
            return false;
        }

        return $this->enabledFeatureKeys($company)->contains($feature->value);
    }

    /**
     * The numeric limit applied to a feature for a business, or null if unlimited.
     *
     * Limits are sourced (in priority order) from the plan_feature pivot
     * `limit_value`, then the `configuration.limit`, then null (unlimited).
     */
    public function limit(Company $company, Feature $feature): ?int
    {
        $planFeature = $this->planFeatureFor($company, $feature);

        if (! $planFeature) {
            return null;
        }

        if ($planFeature->limit_value !== null) {
            return (int) $planFeature->limit_value;
        }

        $configuration = is_array($planFeature->configuration)
            ? $planFeature->configuration
            : [];

        if (array_key_exists('limit', $configuration)) {
            return (int) $configuration['limit'];
        }

        return null;
    }

    /**
     * The full configuration for a feature (enabled flag, limit, and any
     * arbitrary per-plan options), or null when the feature is not on the plan.
     *
     * @return array{enabled: bool, limit: int|null}|null
     */
    public function configuration(Company $company, Feature $feature): ?array
    {
        $planFeature = $this->planFeatureFor($company, $feature);

        if (! $planFeature) {
            return null;
        }

        return [
            'enabled' => (bool) $planFeature->is_enabled,
            'limit' => $this->limit($company, $feature),
        ];
    }

    /**
     * The plan currently granting the business access, if any.
     *
     * Mirrors Company::activeSubscription() but also treats a running trial as
     * an entitled subscription (consistent with the rest of the billing layer).
     */
    public function entitledPlan(Company $company): ?Plan
    {
        $plan = $this->entitledSubscription($company)?->plan;

        if ($plan !== null) {
            return $plan;
        }

        // Fallback: check if the company has a latest subscription of any status
        return $company->subscriptions()
            ->with('plan')
            ->latest('starts_at')
            ->latest('id')
            ->first()
            ?->plan;
    }

    /**
     * All feature keys enabled for the business by its entitled subscription.
     *
     * @return Collection<int, string>
     */
    public function enabledFeatureKeys(Company $company): Collection
    {
        $plan = $this->entitledPlan($company);

        if (! $plan) {
            return collect();
        }

        return $plan->features()
            ->wherePivot('is_enabled', true)
            ->get(['features.key'])
            ->pluck('key');
    }

    /**
     * The plan_feature row for a business + feature, or null.
     */
    public function planFeatureFor(Company $company, Feature $feature): ?PlanFeature
    {
        $plan = $this->entitledPlan($company);

        if (! $plan) {
            return null;
        }

        return $plan->planFeatures()
            ->whereHas('feature', fn ($q) => $q->where('key', $feature->value))
            ->with('feature')
            ->first();
    }

    /**
     * Whether the business has a subscription that currently grants access.
     */
    public function hasEntitledSubscription(Company $company): bool
    {
        return $this->accessState()->hasEntitledSubscription($company);
    }

    /**
     * The entitled subscription for the business, or null.
     *
     * Delegated to {@see AccessStateService::entitledSubscription()} so the
     * resolution order, the server clock, and the skew buffer are shared with
     * every other access check in the application. Resolution order mirrors
     * `SubscriptionStatus::grantsAccess()`:
     *  - an active subscription whose period has not ended is entitled;
     *  - a trialing subscription is entitled while the trial is running;
     *  - a grace_period subscription is entitled while its `grace_ends_at`
     *    window is still open (payment-failure grace period);
     *  - past due (beyond grace), suspended, cancelled, expired, and inactive
     *    subscriptions are not.
     */
    public function entitledSubscription(Company $company): ?Subscription
    {
        return $this->accessState()->entitledSubscription($company);
    }

    /**
     * The employee capacity granted to a branch.
     *
     * Capacity is company-scoped: every branch of the business shares the
     * entitled plan's `max_employees`. Returns null when the branch has no
     * company or the company has no entitled subscription (meaning unlimited /
     * unenforced).
     */
    public function branchEmployeeCapacity(Branch $branch): ?int
    {
        $subscription = $branch->company
            ? $this->entitledSubscription($branch->company)
            : null;

        return $subscription?->plan?->max_employees;
    }
}
