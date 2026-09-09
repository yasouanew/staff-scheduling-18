<?php

namespace App\Http\Resources;

use App\Models\Subscription;
use App\Services\EntitlementService;
use App\Services\SubscriptionService;
use App\Services\UsageService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The "my subscription" summary returned to the authenticated business.
 *
 * Combines the resolved plan, subscription state (status / trial / billing
 * dates), current usage (active-user seats first, legacy branch usage until the
 * branch subsystem is removed), and the features the plan grants.
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
        $subscriptions = app(SubscriptionService::class);

        // Previous subscription records (including expired ones) for the
        // `/subscription` page. The billing-portal link is intentionally NOT
        // generated here — Stripe portal URLs are single-use sessions, so the
        // SPA opens one on demand via POST subscription/billing-portal (which
        // also works while the subscription is expired).
        $history = $company ? $subscriptions->subscriptionHistory($company) : collect();

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
                'max_seats' => $plan->maxSeats(),
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
            // Server-computed proration estimate for switching to a different
            // plan/cycle. The provider is authoritative for the final charge;
            // this block only powers the confirmation UI. `renews_at` mirrors
            // the subscription's `ends_at` — a plan switch never changes the
            // renewal date (Task 6).
            'plan_change' => $subscription && $plan
                ? $subscriptions->planChangeEstimate($subscription, $plan)
                : [
                    'amount_due' => 0.0,
                    'currency' => $company?->currency ?? 'AUD',
                    'renews_at' => $subscription?->cancel_at_period_end
                        ? null
                        : $subscription?->ends_at?->toIso8601String(),
                    'elapsed' => null,
                ],
            'usage' => $company ? $usage->usageFor($company) : [
                'branches' => ['used' => 0, 'limit' => null],
                'branch_usage' => [],
            ],
            'features' => $features,
            'entitled' => $company ? $entitlements->hasEntitledSubscription($company) : false,
            // Every past + present subscription record (status, plan, period
            // dates) — the "previous records" block on the subscription page.
            'subscription_history' => $history->map(fn (Subscription $record): array => [
                'id' => $record->id,
                'status' => $record->status,
                'billing_cycle' => $record->billing_cycle,
                'plan_name' => $record->plan?->name,
                'starts_at' => $record->starts_at?->toIso8601String(),
                'ends_at' => $record->ends_at?->toIso8601String(),
                'cancelled_at' => $record->cancelled_at?->toIso8601String(),
                'is_current' => $subscription !== null && (int) $record->id === (int) $subscription->id,
            ])->values()->all(),
        ];
    }
}
