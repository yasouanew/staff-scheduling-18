<?php

namespace App\Http\Resources;

use App\Services\EntitlementService;
use App\Services\UsageService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The "my subscription" summary returned to the authenticated business.
 *
 * Combines the resolved plan, subscription state (status / trial / billing
 * dates), current branch + employee usage, and the features the plan grants.
 *
 * Deliberately omits payment-provider secrets: Stripe ids, checkout session
 * ids and provider credentials are never exposed here — only the billing
 * cycle and dates the SPA needs to render the billing page.
 */
class SubscriptionSummaryResource extends JsonResource
{
    public function __construct($resource)
    {
        parent::__construct($resource);
    }

    /**
     * Transform the subscription summary into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var \App\Models\Subscription|null $subscription */
        $subscription = $this->resource;

        $company = $subscription?->company;
        $plan = $subscription?->plan;

        $entitlements = app(EntitlementService::class);
        $usage = app(UsageService::class);

        $features = collect(\App\Enums\Feature::cases())->map(function (\App\Enums\Feature $feature) use ($entitlements, $company): array {
            $configuration = $company ? $entitlements->configuration($company, $feature) : null;

            return [
                'key' => $feature->value,
                'label' => $feature->label(),
                'branch_scoped' => $feature->isBranchScoped(),
                'enabled' => $configuration !== null && $configuration['enabled'],
                'limit' => $configuration['limit'] ?? null,
            ];
        })->values();

        return [
            'plan' => $plan ? [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'description' => $plan->description,
                'currency' => $plan->currency ?? 'AUD',
                'price_monthly' => $plan->price_monthly,
                'price_yearly' => $plan->price_yearly,
                'interval' => $subscription->billing_cycle ?? 'monthly',
                'max_branches' => $plan->max_branches,
                'max_employees' => $plan->max_employees,
            ] : null,
            'subscription' => $subscription ? [
                'id' => $subscription->id,
                'status' => $subscription->status,
                'billing_cycle' => $subscription->billing_cycle,
                'on_trial' => $subscription->onTrial(),
                'is_active' => $subscription->isActive(),
                'is_cancelled' => $subscription->isCancelled(),
                'trial_ends_at' => $subscription->trial_ends_at?->toIso8601String(),
                'starts_at' => $subscription->starts_at?->toIso8601String(),
                'ends_at' => $subscription->ends_at?->toIso8601String(),
                'renews_at' => $subscription->cancel_at_period_end ? null : $subscription->ends_at?->toIso8601String(),
                'cancelled_at' => $subscription->cancelled_at?->toIso8601String(),
            ] : null,
            'trial' => $company ? [
                'active' => $company->isTrialActive(),
                'trial_ends_at' => $company->trial_ends_at?->toIso8601String(),
            ] : null,
            'usage' => $company ? $usage->usageFor($company) : [
                'branches' => ['used' => 0, 'limit' => null],
                'branch_usage' => [],
            ],
            'features' => $features,
            'entitled' => $company ? $entitlements->hasEntitledSubscription($company) : false,
        ];
    }
}
