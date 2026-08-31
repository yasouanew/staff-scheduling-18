<?php

namespace App\Services;

use App\Billing\BillingProvider;
use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Canonical subscription domain service.
 *
 * Every subscription lifecycle operation — creating, activating, cancelling,
 * resuming, changing plan, changing billing period, and resolving the current
 * plan / status / entitlements — flows through this single service. Both the
 * company self-service surface ({@see \App\Http\Controllers\Api\PlanSubscriptionController})
 * and the explicit-company platform surface
 * ({@see \App\Http\Controllers\Api\SubscriptionController}) call the same
 * methods here, so business rules (downgrade validation, Stripe reconciliation,
 * entitlement windows) are never duplicated in a controller.
 *
 * Layering:
 *
 *     Controller → SubscriptionService (application + domain) → BillingProvider
 *
 * The billing provider is the only component that talks to Stripe; this service
 * decides WHEN to call it and reconciles the local application state.
 */
class SubscriptionService
{
    public function __construct(
        private readonly BillingProvider $billing,
        private readonly EntitlementService $entitlements,
        private readonly UsageService $usage,
    ) {
    }
    /**
     * Resolve the Stripe price ID for a plan and billing cycle.
     */
    protected function priceIdFor(Plan $plan, string $cycle): ?string
    {
        return match ($cycle) {
            'monthly' => $plan->stripe_monthly_price_id,
            'six_month' => $plan->stripe_six_monthly_price_id,
            'yearly' => $plan->stripe_yearly_price_id,
            default => null,
        };
    }

    /**
     * Resolve the plan price amount for a billing cycle.
     */
    protected function amountFor(Plan $plan, string $cycle): float
    {
        return (float) match ($cycle) {
            'monthly' => $plan->price_monthly,
            'six_month' => $plan->price_six_monthly,
            'yearly' => $plan->price_yearly,
            default => throw new \InvalidArgumentException('Unsupported billing cycle.'),
        };
    }

    /**
     * Resolve a local end date for non-Stripe subscriptions and safe fallbacks.
     */
    protected function periodEndFor(string $cycle): \Illuminate\Support\Carbon
    {
        return match ($cycle) {
            'monthly' => now()->addMonth(),
            'six_month' => now()->addMonths(6),
            'yearly' => now()->addYear(),
            default => throw new \InvalidArgumentException('Unsupported billing cycle.'),
        };
    }

    /**
     * Start a hosted Stripe Checkout session for a company subscription.
     * The verified Stripe webhook is the source of truth for final activation.
     *
     * @return array{subscription: Subscription, checkout_url: string, checkout_session_id: string}
     */
    public function startCheckout(Company $company, User $user, Plan $plan, string $cycle, ?int $trialDays = null): array
    {
        $priceId = $this->priceIdFor($plan, $cycle);

        if (! $priceId) {
            throw new \RuntimeException('The selected plan is not configured with a Stripe price for this billing cycle.');
        }

        // Pre-flight: when the company already holds an entitled subscription,
        // opening a checkout is a plan change — so it must satisfy the same
        // branch / employee allowance rules as an upgrade or downgrade. A
        // checkout can never be used to bypass the downgrade validation.
        $current = $this->entitledSubscription($company);

        if ($current) {
            $this->assertCanChangeToPlan($current, $plan);
        }

        return DB::transaction(function () use ($company, $user, $plan, $cycle, $trialDays, $priceId) {
            $subscription = Subscription::create([
                'company_id' => $company->id,
                'user_id' => $user->id,
                'plan_id' => $plan->id,
                'status' => 'incomplete',
                'billing_cycle' => $cycle,
                'starts_at' => now(),
                'ends_at' => $this->periodEndFor($cycle),
                'trial_ends_at' => $trialDays ? now()->addDays($trialDays) : null,
                'stripe_price' => $priceId,
                'quantity' => 1,
            ]);

            $baseUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');
            $successUrl = $baseUrl.'/companies/'.$company->id.'/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}';
            $cancelUrl = $baseUrl.'/companies/'.$company->id.'/subscriptions?checkout=cancelled';

            $checkout = $this->billing->startCheckout(
                user: $user,
                plan: $plan,
                cycle: $cycle,
                subscriptionId: (string) $subscription->id,
                successUrl: $successUrl,
                cancelUrl: $cancelUrl,
                trialDays: $trialDays,
            );

            $subscription->update(['checkout_session_id' => $checkout['session_id']]);

            return [
                'subscription' => $subscription->fresh(),
                'checkout_url' => $checkout['url'],
                'checkout_session_id' => $checkout['session_id'],
            ];
        });
    }

    /**
     * Subscribe a company to a plan.
     *
     * When a Stripe payment method is supplied the subscription is created in
     * Stripe (via Cashier's Billable customer) and mirrored locally. Without a
     * payment method a local/manual subscription is created (e.g. trials,
     * comped accounts) which keeps the flow usable in every environment.
     *
     * @param  array{billing_cycle?: string, payment_method?: string|null, trial_days?: int|null}  $options
     */
    public function subscribe(Company $company, User $user, Plan $plan, array $options = []): Subscription
    {
        $cycle = $options['billing_cycle'] ?? 'monthly';
        $paymentMethod = $options['payment_method'] ?? null;
        $trialDays = $options['trial_days'] ?? null;

        return DB::transaction(function () use ($company, $user, $plan, $cycle, $paymentMethod, $trialDays) {
            $attributes = [
                'company_id' => $company->id,
                'user_id' => $user->id,
                'plan_id' => $plan->id,
                'billing_cycle' => $cycle,
                'status' => $trialDays ? 'trialing' : 'active',
                'starts_at' => now(),
                'ends_at' => $this->periodEndFor($cycle),
                'trial_ends_at' => $trialDays ? now()->addDays($trialDays) : null,
            ];

            if ($paymentMethod) {
                $stripeData = $this->createStripeSubscription($user, $plan, $cycle, $paymentMethod, $trialDays);
                $attributes = array_merge($attributes, $stripeData['attributes']);
            }

            /** @var Subscription $subscription */
            $subscription = Subscription::create($attributes);

            if ($paymentMethod && isset($stripeData['payment'])) {
                $this->recordPayment($subscription, $plan, $cycle, $stripeData['payment']);
            }

            return $subscription->fresh();
        });
    }

    /**
     * Create the subscription inside Stripe using the Cashier customer.
     *
     * @return array{attributes: array<string, mixed>, payment: array<string, mixed>|null}
     */
    protected function createStripeSubscription(User $user, Plan $plan, string $cycle, string $paymentMethod, ?int $trialDays): array
    {
        $priceId = $this->priceIdFor($plan, $cycle);

        $result = $this->billing->createSubscription(
            user: $user,
            plan: $plan,
            cycle: $cycle,
            paymentMethod: $paymentMethod,
            trialDays: $trialDays,
        );

        return [
            'attributes' => [
                'stripe_id' => $result['subscription_id'],
                'stripe_status' => $result['status'],
                'stripe_price' => $priceId,
                'quantity' => 1,
                'status' => $result['status'] === 'trialing' ? 'trialing' : 'active',
            ],
            'payment' => $result['payment_intent_id'] ? [
                'payment_intent_id' => $result['payment_intent_id'],
                'reference' => $result['invoice_reference'],
                'status' => $result['status'] === 'active' ? 'succeeded' : 'pending',
            ] : null,
        ];
    }

    /**
     * Record a payment row for a subscription.
     *
     * @param  array<string, mixed>  $payment
     */
    protected function recordPayment(Subscription $subscription, Plan $plan, string $cycle, array $payment): SubscriptionPayment
    {
        return $subscription->payments()->create([
            'amount' => $this->amountFor($plan, $cycle),
            'currency' => 'AUD',
            'payment_provider' => 'stripe',
            'provider_reference' => $payment['reference'] ?? null,
            'stripe_payment_intent_id' => $payment['payment_intent_id'] ?? null,
            'status' => $payment['status'] ?? 'pending',
            'paid_at' => ($payment['status'] ?? null) === 'succeeded' ? now() : null,
        ]);
    }

    /**
     * Cancel a subscription (at period end by default).
     */
    public function cancel(Subscription $subscription, bool $immediately = false): Subscription
    {
        return DB::transaction(function () use ($subscription, $immediately) {
            if ($subscription->stripe_id && $subscription->user) {
                $this->cancelInStripe($subscription, $immediately);
            }

            $subscription->update([
                'status' => $immediately ? 'cancelled' : 'active',
                'cancelled_at' => now(),
                'ends_at' => $immediately ? now() : ($subscription->ends_at ?? $this->periodEndFor($subscription->billing_cycle)),
                'stripe_status' => $subscription->stripe_id ? ($immediately ? 'canceled' : 'active') : $subscription->stripe_status,
            ]);

            return $subscription->fresh();
        });
    }

    /**
     * Cancel the subscription in Stripe.
     */
    protected function cancelInStripe(Subscription $subscription, bool $immediately): void
    {
        if (! $subscription->user) {
            return;
        }

        $this->billing->cancel($subscription->user, $subscription, $immediately);
    }

    /**
     * Resume a subscription that is within its grace period.
     */
    public function resume(Subscription $subscription): Subscription
    {
        return DB::transaction(function () use ($subscription) {
            if ($subscription->stripe_id && $subscription->user) {
                $this->billing->resume($subscription->user, $subscription);
            }

            $subscription->update([
                'status' => 'active',
                'cancelled_at' => null,
                'ends_at' => $subscription->ends_at ?? $this->periodEndFor($subscription->billing_cycle),
                'stripe_status' => $subscription->stripe_id ? 'active' : $subscription->stripe_status,
            ]);

            return $subscription->fresh();
        });
    }

    /**
     * Change the subscription's plan / billing cycle after validating that the
     * business can still fit inside the target plan's allowances.
     *
     * This is the single backend decision point for upgrade / downgrade /
     * billing-period changes. Both the company self-service surface and the
     * explicit-company platform surface route through here, so a downgrade can
     * never bypass the allowance validation:
     *
     *  - the target plan is resolved from the database (never trusted from the
     *    frontend);
     *  - a change is rejected (structured BillingLimitException) when the
     *    business currently has more active branches than the target plan's
     *    `max_branches`, or more active employees than the target plan's
     *    `max_employees`;
     *  - a plan whose allowances are equal or larger never blocks the change.
     *
     * @param  string|null  $cycle  Optional new billing cycle (defaults to the
     *                              subscription's current cycle).
     */
    public function changePlan(
        Subscription $subscription,
        Plan $plan,
        ?string $cycle = null,
        ?User $actor = null,
    ): Subscription {
        $cycle = $cycle ?? $subscription->billing_cycle;

        $this->assertCanChangeToPlan($subscription, $plan);

        return DB::transaction(function () use ($subscription, $plan, $cycle, $actor) {
            $priceId = $this->priceIdFor($plan, $cycle);

            if ($subscription->stripe_id && $subscription->user && $priceId) {
                $this->billing->swap($subscription->user, $subscription, $plan, $cycle);
            }

            $previousPlanId = $subscription->plan_id;

            $subscription->update([
                'plan_id' => $plan->id,
                'billing_cycle' => $cycle,
                'stripe_price' => $subscription->stripe_id ? $priceId : $subscription->stripe_price,
            ]);

            activity('subscription')
                ->performedOn($subscription)
                ->causedBy($actor)
                ->withProperties([
                    'event' => 'PLAN_CHANGED',
                    'previous_plan_id' => $previousPlanId,
                    'new_plan_id' => $plan->id,
                    'billing_cycle' => $cycle,
                ])
                ->event('plan_changed')
                ->log('Subscription plan changed.');

            return $subscription->fresh();
        });
    }

    /**
     * Change only the billing cycle while keeping the current plan.
     *
     * Delegates to {@see self::changePlan()} so the change is reconciled with
     * Stripe and follows the exact same validation path as an upgrade/downgrade
     * (a same-plan cycle change always passes the allowance checks because the
     * business already fits inside its own plan).
     *
     * @param  string  $cycle  The new billing cycle (monthly|six_month|yearly).
     */
    public function changeBillingPeriod(Subscription $subscription, string $cycle, ?User $actor = null): Subscription
    {
        $plan = $subscription->plan;

        abort_unless($plan, 422, 'Cannot change the billing period without an assigned plan.');

        return $this->changePlan($subscription, $plan, $cycle, $actor);
    }

    /**
     * Validate that the business can switch its subscription to the target plan.
     *
     * Raises a structured {@see \App\Exceptions\BillingLimitException} (422) when
     * the business currently uses more active branches than the target plan's
     * `max_branches` or more active employees than the target plan's
     * `max_employees`. Exposed separately so callers can pre-flight a plan
     * change before committing it.
     */
    public function assertCanChangeToPlan(Subscription $subscription, Plan $plan): void
    {
        $company = $subscription->company;

        if (! $company) {
            return;
        }

        // Branch allowance check.
        if ($plan->max_branches !== null && $this->usage->activeBranches($company) > $plan->max_branches) {
            throw new \App\Exceptions\BillingLimitException(
                'Your business currently uses more active branches than this plan allows.',
                'DOWNGRADE_BRANCH_LIMIT_EXCEEDED',
                [
                    'used' => $this->usage->activeBranches($company),
                    'limit' => $plan->max_branches,
                ],
                422,
            );
        }

        // Employee capacity check (total active employees across the business).
        if ($plan->max_employees !== null && $this->usage->activeEmployees($company) > $plan->max_employees) {
            throw new \App\Exceptions\BillingLimitException(
                'Your business currently has more active employees than this plan allows.',
                'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED',
                [
                    'used' => $this->usage->activeEmployees($company),
                    'capacity' => $plan->max_employees,
                ],
                422,
            );
        }
    }

    /**
     * The plan currently granting a company access, if any.
     *
     * Entitlement resolution (active / trialing / grace-period windows) lives in
     * the EntitlementService; this is the subscription domain's canonical query
     * façade so controllers never re-implement the entitlement rules.
     */
    public function currentPlan(Company $company): ?Plan
    {
        return $this->entitlements->entitledPlan($company);
    }

    /**
     * The subscription currently granting a company access, if any.
     */
    public function entitledSubscription(Company $company): ?Subscription
    {
        return $this->entitlements->entitledSubscription($company);
    }

    /**
     * The current application status for a company, or null when not entitled.
     */
    public function currentStatus(Company $company): ?SubscriptionStatus
    {
        $subscription = $this->entitledSubscription($company);

        if (! $subscription) {
            return null;
        }

        return SubscriptionStatus::tryFrom((string) $subscription->status);
    }

    /**
     * Create a Stripe Customer Portal session for the company.
     *
     * The portal lets the company admin self-serve payment-method changes,
     * invoice history and card updates. Subscription / entitlement state
     * remains authoritative in the local application; the portal only manages
     * the payment relationship.
     */
    public function billingPortal(Company $company, User $user): string
    {
        $subscription = $this->entitledSubscription($company);

        abort_unless($subscription, 422, 'No entitled subscription to manage in the billing portal.');

        return $this->billing->billingPortal($user, $this->billingPortalReturnUrl($company));
    }

    /**
     * The frontend URL the admin returns to after leaving the billing portal.
     */
    protected function billingPortalReturnUrl(Company $company): string
    {
        $baseUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return $baseUrl.'/companies/'.$company->id.'/subscriptions?portal=return';
    }
}
