<?php

namespace App\Services;

use App\Billing\BillingProvider;
use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\User;
use Illuminate\Http\Request;
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

        // Pre-flight: opening a checkout must satisfy the same branch / employee
        // allowance rules as an upgrade or downgrade — including when the
        // company is on a trial (or locked) and has no entitled subscription
        // yet. Without this an admin could subscribe to a plan with fewer seats
        // than the active user accounts require. A checkout can never be used
        // to bypass the plan-allowance validation.
        $current = $this->entitledSubscription($company);

        if ($current) {
            $this->assertCanChangeToPlan($current, $plan);
        } else {
            $this->assertCanSubscribeToPlan($company, $plan);
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

            $baseUrl = rtrim((string) $this->checkoutReturnBaseUrl(), '/');
            // The SPA hosts the self-service subscription dashboard at `/subscription`
            // (there is no `/companies/{id}/subscriptions` route). The query string
            // tells the page to confirm the Stripe Checkout session server-side.
            $successUrl = $baseUrl.'/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}';
            $cancelUrl = $baseUrl.'/subscription?checkout=cancelled';

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
     * Resume an unfinished Stripe Checkout attempt.
     *
     * When a business starts a hosted checkout but never completes the payment,
     * the local subscription row stays `incomplete`. This method lets the admin
     * pick the attempt back up from the `/subscription` page: the stale row is
     * closed (marked `expired`) and a fresh checkout is opened for the SAME
     * plan and billing cycle, so "Complete payment" always leads to a live
     * Stripe session.
     *
     * @return array{subscription: Subscription, checkout_url: string, checkout_session_id: string}
     *
     * @throws \RuntimeException when there is no pending checkout attempt or the
     *                          plan is not configured with a Stripe price.
     */
    public function retryCheckout(Company $company, User $user): array
    {
        $pending = $company->subscriptions()
            ->where('status', 'incomplete')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first();

        if (! $pending) {
            throw new \RuntimeException('There is no pending checkout to complete.');
        }

        $plan = $pending->plan;

        if (! $plan) {
            throw new \RuntimeException('The pending checkout no longer references a valid plan.');
        }

        return DB::transaction(function () use ($company, $user, $pending, $plan) {
            // Close the abandoned attempt so it stops appearing as pending and
            // the reconcile command never has to expire it later.
            $pending->update([
                'status' => 'expired',
                'ends_at' => $pending->ends_at ?? now(),
            ]);

            return $this->startCheckout(
                $company,
                $user,
                $plan,
                $pending->billing_cycle ?? 'monthly',
            );
        });
    }

    /**
     * Abandon an unfinished checkout attempt.
     *
     * Marks the `incomplete` row `expired` so the admin can dismiss the
     * "complete your payment" prompt and pick any plan from the catalogue
     * instead. No Stripe call is needed — the session simply lapses.
     */
    public function discardIncomplete(Company $company): Subscription
    {
        $pending = $company->subscriptions()
            ->where('status', 'incomplete')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first();

        if (! $pending) {
            throw new \RuntimeException('There is no pending checkout to discard.');
        }

        $pending->update([
            'status' => 'expired',
            'ends_at' => $pending->ends_at ?? now(),
        ]);

        return $pending->fresh();
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

        // A direct (non-checkout) subscription must also satisfy the plan's
        // branch / seat allowances relative to current usage before it is
        // created — otherwise the admin could bypass the self-service guard.
        $this->assertCanSubscribeToPlan($company, $plan);

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
     *    business currently has more active user seats than the target plan's
     *    seat allowance (`max_employees` reused as the active-user seat cap);
     *  - a plan whose allowance is equal or larger never blocks the change.
     *
     * Note: under the per-seat model the seat count is derived from active user
     * accounts (any non-super_admin role), not from the mirroring employees
     * table, so the downgrade guard compares `activeSeats` against the target
     * plan's `maxSeats()`.
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
        $result = $this->changePlanWithPayment($subscription, $plan, $cycle, $actor);

        return $result['subscription'];
    }

    /**
     * Change the subscription's plan / billing cycle AND settle the money for
     * the switch with the payment provider.
     *
     * This is the full plan-switch orchestration on top of the allowance
     * validation performed by {@see self::changePlan()}:
     *
     *  - **Upgrade** (target price > current price): the Stripe subscription
     *    is swapped with `proration_behavior: always_invoice`, which charges
     *    the prorated "rest of the money" immediately with the customer's
     *    default payment method. The proration invoice is recorded as a
     *    `subscription_payments` row (`type = proration`) — idempotent with
     *    the `invoice.paid` webhook because both key on the provider invoice
     *    id. When the customer has no default payment method the plan change
     *    is NOT applied locally; instead a hosted Checkout session for the
     *    prorated amount is returned so the admin can pay first.
     *  - **Downgrade** (target price < current price): the swap creates
     *    prorations and the prorated difference is refunded in cash against
     *    the current period's succeeded PaymentIntent (capped at what was
     *    actually paid), recorded as a `type = refund` row.
     *  - The renewal date (`ends_at`) is preserved in every path — Stripe's
     *    `billing_cycle_anchor: unchanged` keeps the provider in agreement.
     *
     * @param  string|null  $cycle  Optional new billing cycle (defaults to the
     *                              subscription's current cycle).
     * @return array{
     *     subscription: Subscription,
     *     charge: array{amount: float, currency: string, reference: string|null, payment_intent: string|null}|null,
     *     refund: array{amount: float, currency: string, refund_id: string|null}|null,
     *     checkout_url: string|null,
     * }
     */
    public function changePlanWithPayment(
        Subscription $subscription,
        Plan $plan,
        ?string $cycle = null,
        ?User $actor = null,
    ): array {
        $cycle = $cycle ?? $subscription->billing_cycle;

        $this->assertCanChangeToPlan($subscription, $plan);

        $currentPlan = $subscription->plan;
        $oldPrice = $currentPlan ? $this->amountFor($currentPlan, $cycle) : 0.0;
        $newPrice = $this->amountFor($plan, $cycle);
        $direction = $newPrice > $oldPrice ? 'upgrade' : ($newPrice < $oldPrice ? 'downgrade' : 'lateral');

        $providerBacked = (bool) ($subscription->stripe_id && $subscription->user && $this->priceIdFor($plan, $cycle));

        // Whether the provider can charge the customer inline right now (a
        // default payment method exists on the Stripe customer).
        $hasCardOnFile = $providerBacked && $this->hasDefaultPaymentMethod($subscription);

        // Upgrades need money NOW. Without a default payment method on the
        // Stripe customer the provider cannot charge the difference inline, so
        // the plan change is deferred behind a hosted Checkout session for the
        // "rest of the money" (see changePlanWithCheckout()).
        //
        // Stripe refuses Checkout sessions below its A$0.50 minimum, so a
        // trivially small positive difference with no card on file is applied
        // directly instead of crashing — the new price takes effect from the
        // next renewal via Stripe's pending proration items.
        if ($providerBacked && $direction === 'upgrade' && ! $hasCardOnFile) {
            $amountDue = (float) $this->planChangeEstimate($subscription, $plan, $cycle)['amount_due'];

            if ($amountDue >= 0.50) {
                $checkout = $this->changePlanWithCheckout($subscription, $plan, $cycle, $actor);

                return [
                    'subscription' => $checkout['subscription'],
                    'charge' => null,
                    'refund' => null,
                    'checkout_url' => $checkout['checkout_url'],
                ];
            }
        }

        $charge = null;
        $refund = null;
        $checkoutUrl = null;

        $subscription = DB::transaction(function () use ($subscription, $plan, $cycle, $actor, $providerBacked, $direction, $hasCardOnFile, &$charge, &$refund) {
            $priceId = $this->priceIdFor($plan, $cycle);

            $invoice = null;

            if ($providerBacked) {
                // `always_invoice` charges the difference immediately on
                // upgrades when a card is on file; otherwise pending proration
                // items (`create_prorations`) carry it to the next renewal.
                // Downgrades keep Stripe's default proration (credit items)
                // and the cash refund is issued below.
                $invoice = $this->billing->swap(
                    $subscription->user,
                    $subscription,
                    $plan,
                    $cycle,
                    ['proration_behavior' => $direction === 'upgrade' && $hasCardOnFile ? 'always_invoice' : 'create_prorations'],
                );
            }

            $previousPlanId = $subscription->plan_id;
            $previousPlanName = $subscription->plan?->name;

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

            if ($providerBacked && $direction === 'upgrade') {
                $charge = $this->recordProrationCharge($subscription, $plan, $cycle, $invoice, $previousPlanName);
            }

            if ($providerBacked && $direction === 'downgrade') {
                $refund = $this->refundDowngradeDifference($subscription, $plan, $cycle, $previousPlanName);
            }

            return $subscription->fresh();
        });

        return [
            'subscription' => $subscription,
            'charge' => $charge,
            'refund' => $refund,
            'checkout_url' => $checkoutUrl,
        ];
    }

    /**
     * Whether the Stripe customer behind the subscription has a default
     * payment method that an immediate proration invoice could be charged to.
     */
    protected function hasDefaultPaymentMethod(Subscription $subscription): bool
    {
        $user = $subscription->user;

        if (! $user || ! $user->stripe_id) {
            return false;
        }

        try {
            $customer = $user->stripe()->customers->retrieve($user->stripe_id, []);

            return ! empty($customer->invoice_settings?->default_payment_method);
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Record the proration invoice produced by a plan-change swap as a
     * `subscription_payments` row (`type = proration`).
     *
     * Idempotent: the provider invoice id is used as the `provider_reference`,
     * the same key the `invoice.paid` webhook upserts on, so the immediate
     * record and the webhook converge to a single row.
     *
     * @param  array<string, mixed>|null  $invoice  Normalised provider invoice
     *     from {@see BillingProvider::swap()}.
     * @return array{amount: float, currency: string, reference: string|null, payment_intent: string|null}|null
     */
    protected function recordProrationCharge(
        Subscription $subscription,
        Plan $plan,
        string $cycle,
        ?array $invoice,
        ?string $previousPlanName,
    ): ?array {
        $reference = $invoice['id'] ?? null;

        // Without a provider invoice there is no charge to record (e.g. the
        // provider produced no proration for a lateral change).
        if (! $reference) {
            return null;
        }

        $amountCents = $invoice['amount_paid'] ?? $invoice['amount_due'] ?? 0;
        $amount = (float) ($amountCents / 100);
        $currency = strtoupper($invoice['currency'] ?? 'AUD');

        $payment = $subscription->payments()->updateOrCreate(
            ['provider_reference' => $reference],
            [
                'amount' => $amount,
                'currency' => $currency,
                'payment_provider' => 'stripe',
                'stripe_payment_intent_id' => $invoice['payment_intent'] ?? null,
                'status' => ($invoice['amount_paid'] ?? 0) > 0 ? 'succeeded' : 'pending',
                'type' => 'proration',
                'description' => 'Plan change: '.($previousPlanName ?? 'previous plan').' → '.$plan->name,
                'paid_at' => ($invoice['amount_paid'] ?? 0) > 0 ? now() : null,
            ],
        );

        return [
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency,
            'reference' => $payment->provider_reference,
            'payment_intent' => $payment->stripe_payment_intent_id,
        ];
    }

    /**
     * Refund the prorated difference produced by a downgrade, in cash,
     * against the current period's succeeded PaymentIntent.
     *
     * The refund is capped at what the business actually paid for the current
     * period (minus anything already refunded) so a mispriced catalogue can
     * never over-refund. The refund is recorded as a `type = refund` row so
     * the Invoices tab shows the money returned for the plan change.
     *
     * @return array{amount: float, currency: string, refund_id: string|null}|null
     */
    protected function refundDowngradeDifference(
        Subscription $subscription,
        Plan $plan,
        string $cycle,
        ?string $previousPlanName,
    ): ?array {
        $currentPlan = $subscription->plan;

        if (! $currentPlan) {
            return null;
        }

        $difference = round($this->amountFor($currentPlan, $cycle) - $this->amountFor($plan, $cycle), 2);

        if ($difference <= 0) {
            return null;
        }

        // The most recent succeeded payment of this subscription is the
        // charge the prorated difference came from.
        $payment = $subscription->payments()
            ->succeeded()
            ->where('type', '!=', 'refund')
            ->whereNotNull('stripe_payment_intent_id')
            ->orderByDesc('paid_at')
            ->orderByDesc('id')
            ->first();

        if (! $payment) {
            return null;
        }

        // Never refund more than the business actually paid for the period.
        $refundable = round((float) $payment->amount - (float) $payment->amount_refunded, 2);
        $refundAmount = min($difference, $refundable);

        if ($refundAmount <= 0) {
            return null;
        }

        $user = $subscription->user;

        if (! $user) {
            return null;
        }

        $result = $this->billing->refund($user, (string) $payment->stripe_payment_intent_id, $refundAmount);

        $totalRefunded = (float) $payment->amount_refunded + $refundAmount;

        $payment->update([
            'amount_refunded' => $totalRefunded,
            'status' => $totalRefunded >= (float) $payment->amount ? 'refunded' : $payment->status,
            'refunded_at' => now(),
        ]);

        $refundRow = $subscription->payments()->create([
            'amount' => $refundAmount,
            'currency' => $payment->currency,
            'payment_provider' => 'stripe',
            'provider_reference' => $result['refund_id'] ?? null,
            'stripe_payment_intent_id' => $payment->stripe_payment_intent_id,
            'status' => 'refunded',
            'type' => 'refund',
            'description' => 'Plan change refund: '.($previousPlanName ?? 'previous plan').' → '.$plan->name,
            'amount_refunded' => $refundAmount,
            'refunded_at' => now(),
        ]);

        return [
            'amount' => (float) $refundRow->amount,
            'currency' => $refundRow->currency,
            'refund_id' => $result['refund_id'] ?? null,
        ];
    }

    /**
     * Defer a plan change behind a hosted, ONE-OFF Checkout session for the
     * prorated difference.
     *
     * Used when the business wants to upgrade but the Stripe customer has no
     * default payment method (the provider cannot charge the proration
     * invoice). A full-price subscription checkout would overcharge a customer
     * who already paid most of the current period, so this opens a payment-mode
     * session for ONLY the prorated "rest of the money".
     *
     * The current subscription is left completely untouched (still active, same
     * plan, same renewal date) — the local plan is NOT flipped here. The
     * session carries `purpose: plan_change` metadata, and the completion
     * handlers (`checkout.session.completed` webhook /
     * `POST subscription/checkout/confirm`) apply the deferred plan change once
     * the money is actually paid.
     *
     * @return array{subscription: Subscription, checkout_url: string, checkout_session_id: string}
     *
     * @throws \RuntimeException when the prorated amount cannot be determined.
     */
    public function changePlanWithCheckout(
        Subscription $subscription,
        Plan $plan,
        ?string $cycle = null,
        ?User $actor = null,
    ): array {
        $cycle = $cycle ?? $subscription->billing_cycle;

        $this->assertCanChangeToPlan($subscription, $plan);

        $user = $actor ?? $subscription->user;

        if (! $user) {
            throw new \RuntimeException('The subscription is not attached to a user.');
        }

        // The prorated "rest of the money" for the remainder of the current
        // period — the exact amount the customer still owes for the upgrade.
        $estimate = $this->planChangeEstimate($subscription, $plan, $cycle);

        $amountDue = round((float) $estimate['amount_due'], 2);

        if ($amountDue <= 0) {
            throw new \RuntimeException(
                'No payment is required for this plan change — it can be applied directly.'
            );
        }

        $baseUrl = rtrim((string) $this->checkoutReturnBaseUrl(), '/');
        $successUrl = $baseUrl.'/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}';
        $cancelUrl = $baseUrl.'/subscription?checkout=cancelled';

        $checkout = $this->billing->startOneOffCheckout(
            user: $user,
            amount: $amountDue,
            currency: (string) $estimate['currency'],
            description: 'Plan upgrade: '.($subscription->plan?->name ?? 'current plan').' → '.$plan->name,
            subscriptionId: (string) $subscription->id,
            planId: (string) $plan->id,
            cycle: $cycle,
            successUrl: $successUrl,
            cancelUrl: $cancelUrl,
        );

        // Persist the session id so the SPA-side confirmation
        // (`POST subscription/checkout/confirm`) can find this subscription for
        // the one-off session without calling Stripe to resolve the reference.
        $subscription->update(['checkout_session_id' => $checkout['session_id']]);

        activity('subscription')
            ->performedOn($subscription)
            ->causedBy($actor)
            ->withProperties([
                'event' => 'PLAN_CHANGE_CHECKOUT_OPENED',
                'previous_plan_id' => $subscription->plan_id,
                'new_plan_id' => $plan->id,
                'billing_cycle' => $cycle,
                'amount_due' => $amountDue,
                'checkout_session_id' => $checkout['session_id'],
            ])
            ->event('plan_change_checkout_opened')
            ->log('Plan change deferred to a one-off hosted checkout.');

        return [
            'subscription' => $subscription->fresh(),
            'checkout_url' => $checkout['url'],
            'checkout_session_id' => $checkout['session_id'],
        ];
    }

    /**
     * Apply a plan change that was deferred behind a paid one-off Checkout
     * session ({@see self::changePlanWithCheckout()}).
     *
     * Called from the payment-completion handlers once the prorated difference
     * has actually been collected. Re-validates the plan allowances (usage may
     * have changed while the session was open), flips the local plan / cycle,
     * records the collected money as a `type = proration` payment row and —
     * critically — preserves the renewal date (`ends_at`), because the one-off
     * charge bought the remainder of the CURRENT period on the new plan.
     *
     * Idempotent: if the subscription already sits on the target plan the
     * payment row is still upserted but the plan state is left alone.
     *
     * @param  array{id: string|null, amount_paid: int|float|null, currency: string|null, payment_intent: string|null}  $payment
     */
    public function completePlanChangeCheckout(
        Subscription $subscription,
        string $planId,
        string $cycle,
        array $payment,
    ): Subscription {
        $plan = Plan::find($planId);

        if (! $plan) {
            throw new \RuntimeException('The plan for the deferred plan change no longer exists.');
        }

        $previousPlanName = $subscription->plan?->name;

        DB::transaction(function () use ($subscription, $plan, $cycle, $payment, $previousPlanName) {
            // Re-validate: the business may have grown past the target plan's
            // allowances while the checkout session was open. In that edge case
            // the money stays collected but the plan is not applied — the
            // exception surfaces to the webhook/confirm handler which records
            // the event for manual follow-up.
            $this->assertCanChangeToPlan($subscription, $plan);

            $alreadyApplied = (string) $subscription->plan_id === (string) $plan->id
                && $subscription->billing_cycle === $cycle;

            if (! $alreadyApplied) {
                $previousPlanId = $subscription->plan_id;

                $subscription->update([
                    'plan_id' => $plan->id,
                    'billing_cycle' => $cycle,
                    'stripe_price' => $subscription->stripe_id
                        ? ($this->priceIdFor($plan, $cycle) ?? $subscription->stripe_price)
                        : $subscription->stripe_price,
                ]);

                activity('subscription')
                    ->performedOn($subscription)
                    ->withProperties([
                        'event' => 'PLAN_CHANGED',
                        'previous_plan_id' => $previousPlanId,
                        'new_plan_id' => $plan->id,
                        'billing_cycle' => $cycle,
                        'via' => 'one_off_checkout',
                    ])
                    ->event('plan_changed')
                    ->log('Deferred plan change applied after one-off checkout payment.');
            }

            // Record the collected proration money. The checkout session id is
            // the idempotency key (each session is charged exactly once).
            $reference = $payment['id'] ?? null;

            if ($reference) {
                $amountCents = (float) ($payment['amount_paid'] ?? 0);
                $amount = round($amountCents / 100, 2);

                $subscription->payments()->updateOrCreate(
                    ['provider_reference' => $reference],
                    [
                        'amount' => $amount,
                        'currency' => strtoupper((string) ($payment['currency'] ?? 'AUD')),
                        'payment_provider' => 'stripe',
                        'stripe_payment_intent_id' => $payment['payment_intent'] ?? null,
                        'status' => $amount > 0 ? 'succeeded' : 'pending',
                        'type' => 'proration',
                        'description' => 'Plan change: '.($previousPlanName ?? 'previous plan').' → '.$plan->name,
                        'paid_at' => $amount > 0 ? now() : null,
                    ],
                );
            }
        });

        return $subscription->fresh();
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
     * `max_branches` or more active user seats than the target plan's seat
     * allowance (`maxSeats()`, backed by `max_employees`). Exposed separately so
     * callers can pre-flight a plan change before committing it.
     */
    public function assertCanChangeToPlan(Subscription $subscription, Plan $plan): void
    {
        $company = $subscription->company;

        if (! $company) {
            return;
        }

        $this->assertCanSubscribeToPlan($company, $plan);
    }

    /**
     * Validate that a company can subscribe to (or switch to) the target plan
     * based on its CURRENT usage — regardless of whether it already holds an
     * entitled subscription.
     *
     * This is the shared guard for every subscription entry point:
     *  - {@see self::changePlan()} (in-place upgrade/downgrade),
     *  - {@see self::startCheckout()} when an entitled subscription exists,
     *  - {@see self::startCheckout()} for a trial/locked company with no
     *    entitled subscription (the gap this closes),
     *  - {@see self::subscribe()} (manual / platform-driven subscriptions).
     *
     * Raises a structured {@see \App\Exceptions\BillingLimitException} (422) when
     * the business currently uses more active branches than the target plan's
     * `max_branches` or more active user seats than the target plan's seat
     * allowance (`maxSeats()`, backed by `max_employees`). Exposed publicly so
     * callers can pre-flight a subscription before committing it.
     */
    public function assertCanSubscribeToPlan(Company $company, Plan $plan): void
    {
        // Branch allowance check (retained until the branch subsystem is removed).
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

        // Seat capacity check (total active user accounts across the business —
        // the billing authority under the per-seat model).
        $targetLimit = $plan->maxSeats();

        if ($targetLimit !== null && $this->usage->activeSeats($company) > $targetLimit) {
            throw new \App\Exceptions\BillingLimitException(
                'Your business currently has more active members than this plan allows. Deactivate some members before switching plans.',
                'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED',
                [
                    'used' => $this->usage->activeSeats($company),
                    'capacity' => $targetLimit,
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
     * The company's subscription history (most recent first).
     *
     * Powers the "previous records of the subscription" block on the SPA's
     * `/subscription` page: every past and present subscription row with its
     * status, plan, billing cycle and period dates — including expired ones —
     * so the admin can see exactly when each period started and ended.
     *
     * @return \Illuminate\Support\Collection<int, Subscription>
     */
    public function subscriptionHistory(Company $company, int $limit = 20): \Illuminate\Support\Collection
    {
        return $company->subscriptions()
            ->with('plan')
            ->latest('starts_at')
            ->latest('id')
            ->limit($limit)
            ->get();
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
     * Estimate the prorated amount due when switching the subscription to a
     * different plan / billing cycle.
     *
     * Task 6 rule: a plan switch must charge the "rest of the money" needed to
     * match the new plan for the *current* billing period, while the renewal
     * date (`ends_at`) stays exactly the same. The provider's proration engine
     * is authoritative for the final charge; this method only produces a
     * transparent estimate for the confirmation UI.
     *
     * The estimate is the difference between the new plan's full period price
     * and the current plan's full period price, scaled by the fraction of the
     * current period that has already elapsed:
     *
     *     due = (newPrice - oldPrice) * elapsedFraction
     *
     * - Upgrades (newPrice > oldPrice) yield a positive amount the admin pays
     *   now to "top up" to the new plan.
     * - Downgrades (newPrice < oldPrice) yield a negative amount — the provider
     *   credits the difference back, so the UI shows a credit rather than a
     *   charge.
     * - Same price / no period window yields zero (nothing due).
     *
     * `ends_at` is deliberately never part of this calculation: the renewal
     * date is preserved across the switch.
     *
     * @param  Plan         $targetPlan  The plan being switched to.
     * @param  string|null  $cycle       Target billing cycle (defaults to the
     *                                   subscription's current cycle).
     * @return array{amount_due: float, currency: string, renews_at: string|null, elapsed: float|null}
     */
    public function planChangeEstimate(
        Subscription $subscription,
        Plan $targetPlan,
        ?string $cycle = null,
    ): array {
        $cycle = $cycle ?? $subscription->billing_cycle;
        $currentPlan = $subscription->plan;

        $currency = $targetPlan->currency ?? $currentPlan?->currency ?? 'AUD';

        // Renewal date is preserved across the switch — this is the whole point
        // of the task: the expiry stays the same.
        $renewsAt = $subscription->cancel_at_period_end
            ? null
            : $subscription->ends_at?->toIso8601String();

        $oldPrice = $currentPlan ? $this->amountFor($currentPlan, $cycle) : 0.0;
        $newPrice = $this->amountFor($targetPlan, $cycle);

        // The "rest of the money" is the plain difference between the two
        // plans for the current billing cycle: upgrading from a $10 plan to a
        // $30 plan charges $20; downgrading credits the same $20. The swap
        // preserves the billing-cycle anchor (renewal date), so no time-based
        // scaling is applied — the collected / refunded amount is always the
        // full difference, never a sub-dollar sliver Stripe would reject
        // (its A$0.50 minimum charge).
        $amountDue = round($newPrice - $oldPrice, 2);

        return [
            'amount_due' => $amountDue,
            'currency' => $currency,
            'renews_at' => $renewsAt,
            'elapsed' => $this->elapsedFraction($subscription),
        ];
    }

    /**
     * The fraction of the current billing period already elapsed, or null when
     * there is no usable period window (no `starts_at` / `ends_at`).
     *
     * Clamped to [0, 1] so a misconfigured period can never produce a negative
     * or over-100% proration estimate.
     */
    protected function elapsedFraction(Subscription $subscription): ?float
    {
        $start = $subscription->starts_at;
        $end = $subscription->ends_at;

        if (! $start || ! $end || $end->isPast()) {
            return null;
        }

        $total = (float) $start->diffInSeconds($end);
        $elapsed = (float) $start->diffInSeconds(now());

        if ($total <= 0) {
            return null;
        }

        return max(0.0, min(1.0, $elapsed / $total));
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
        // Falls back to the company's most recent subscription (any status) so
        // an admin whose subscription has expired can still open the portal to
        // manage payment methods / invoices and renew.
        $subscription = $this->entitledSubscription($company)
            ?? $company->subscriptions()->latest('starts_at')->first();

        abort_unless($subscription, 422, 'No subscription to manage in the billing portal.');

        return $this->billing->billingPortal($user, $this->billingPortalReturnUrl($company));
    }

    /**
     * The frontend URL the admin returns to after leaving the billing portal.
     */
    protected function billingPortalReturnUrl(Company $company): string
    {
        $baseUrl = rtrim((string) $this->checkoutReturnBaseUrl(), '/');

        // The SPA's subscription self-service page lives at `/subscription`.
        return $baseUrl.'/subscription?portal=return';
    }

    /**
     * The origin that hosts the SPA's self-service subscription dashboard.
     *
     * Prefers the configured frontend origin (used to build the Stripe
     * Checkout / Customer Portal return URLs), but when the frontend is served
     * by the same Laravel process — e.g. `php artisan serve` with no separate
     * Vite host — it falls back to the actual request origin so the return
     * always points at the browser's current host/port (localhost:8000,
     * 127.0.0.1:8000, a .test vhost, etc.) rather than a stale config value.
     */
    protected function checkoutReturnBaseUrl(): string
    {
        $configured = (string) config('app.frontend_url', '');

        if ($configured !== '') {
            return $configured;
        }

        $request = app(Request::class);

        return $request->getSchemeAndHttpHost();
    }
}
