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
 * and, for branch-scoped features, additionally requires an active branch
 * subscription for the specific branch. All decision rules (trial, active,
 * past due, cancelled, expired, no subscription) live here so controllers,
 * services, policies, middleware and jobs never hard-code plan names or
 * feature strings.
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
     * Whether the given business currently grants access to a feature.
     *
     * When a branch is provided and the feature is branch-scoped, the branch
     * must also carry an active (paid) branch subscription — otherwise the
     * feature is considered unavailable for that branch.
     */
    public function allows(Company $company, Feature $feature, ?Branch $branch = null): bool
    {
        if (! $this->hasEntitledSubscription($company)) {
            return false;
        }

        $enabled = $this->enabledFeatureKeys($company)->contains($feature->value);

        if (! $enabled) {
            return false;
        }

        if ($feature->isBranchScoped()) {
            return $branch !== null && $this->branchIsEntitled($branch);
        }

        return true;
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
        return $this->entitledSubscription($company)?->plan;
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
        return $this->entitledSubscription($company) !== null;
    }

    /**
     * The entitled subscription for the business, or null.
     *
     * Resolution order follows the existing billing rules and mirrors
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
        return $company->subscriptions()
            ->where(function ($query): void {
                // Active subscriptions grant access while their period is live.
                $query->where('status', 'active')
                    ->where(function ($period): void {
                        $period->whereNull('ends_at')->orWhere('ends_at', '>', now());
                    });
            })
            ->orWhere(function ($query): void {
                // Trialing subscriptions grant access while the trial is running.
                $query->where('status', 'trialing')
                    ->where(function ($trial): void {
                        $trial->whereNull('trial_ends_at')->orWhere('trial_ends_at', '>', now());
                    });
            })
            ->orWhere(function ($query): void {
                // Grace-period subscriptions keep access for the configurable
                // window after a payment failure before suspension.
                $query->where('status', 'grace_period')
                    ->where(function ($grace): void {
                        $grace->whereNull('grace_ends_at')->orWhere('grace_ends_at', '>', now());
                    });
            })
            ->latest('starts_at')
            ->first();
    }

    /**
     * Whether a specific branch currently has an active (entitled) branch
     * subscription, i.e. a branch that has been paid for.
     */
    public function branchIsEntitled(Branch $branch): bool
    {
        return $branch->branchSubscriptions()
            ->entitled()
            ->where(function ($query): void {
                $query->whereNull('ended_at')->orWhere('ended_at', '>', now());
            })
            ->exists();
    }

    /**
     * The employee capacity granted to a branch, if any.
     *
     * Prefers the branch subscription's own capacity and falls back to the
     * plan's max_employees when the branch subscription has none set.
     */
    public function branchEmployeeCapacity(Branch $branch): ?int
    {
        $branchSubscription = $branch->branchSubscriptions()
            ->entitled()
            ->latest('started_at')
            ->first();

        if ($branchSubscription && $branchSubscription->employee_capacity !== null) {
            return (int) $branchSubscription->employee_capacity;
        }

        $subscription = $branch->company
            ? $this->entitledSubscription($branch->company)
            : null;

        return $subscription?->plan?->max_employees;
    }
}
