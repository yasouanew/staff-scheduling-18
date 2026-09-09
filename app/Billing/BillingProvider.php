<?php

namespace App\Billing;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;

/**
 * Contract for the payment-provider integration.
 *
 * The application (via SubscriptionService / PaymentService / webhook
 * controller) depends only on this interface. Provider-specific concerns are
 * isolated behind it so switching providers never leaks API calls into
 * controllers. The concrete Stripe implementation wraps Laravel Cashier, which
 * is the only place that touches Stripe directly.
 */
interface BillingProvider
{
    /**
     * Create a hosted, provider-secure checkout session for a subscription.
     *
     * No raw card data ever transits the application.
     *
     * @return array{url: string, session_id: string}
     */
    public function startCheckout(
        User $user,
        Plan $plan,
        string $cycle,
        string $subscriptionId,
        ?string $successUrl,
        ?string $cancelUrl,
        ?int $trialDays = null,
    ): array;

    /**
     * Create the subscription in the provider (requires a payment method).
     *
     * @return array{subscription_id: string, status: string, payment_intent_id: string|null, invoice_reference: string|null}
     */
    public function createSubscription(
        User $user,
        Plan $plan,
        string $cycle,
        string $paymentMethod,
        ?int $trialDays = null,
    ): array;

    /**
     * Start a hosted, one-off Checkout session for a single charge — used to
     * collect the prorated "rest of the money" for a plan upgrade when the
     * customer has no default payment method on file.
     *
     * The session carries `purpose: plan_change` metadata (plus the local
     * subscription id, target plan and billing cycle) so the payment-completion
     * handler can apply the deferred plan change.
     *
     * @return array{url: string, session_id: string}
     */
    public function startOneOffCheckout(
        User $user,
        float $amount,
        string $currency,
        string $description,
        string $subscriptionId,
        string $planId,
        string $cycle,
        ?string $successUrl,
        ?string $cancelUrl,
    ): array;

    /**
     * Cancel a subscription immediately or at the end of the current period.
     */
    public function cancel(User $user, Subscription $subscription, bool $immediately = false): void;

    /**
     * Resume a cancelled (or grace-period) subscription.
     */
    public function resume(User $user, Subscription $subscription): void;

    /**
     * Swap the subscription's plan / billing cycle in the provider.
     *
     * @param  array{proration_behavior?: string, proration_date?: int}  $options
     *     - `proration_behavior`: Stripe proration strategy. `always_invoice`
     *       charges the prorated difference immediately (upgrades); the
     *       default `create_prorations` defers it to the next renewal.
     *     - `proration_date`: unix timestamp the proration is calculated at
     *       (defaults to now).
     * @return array<string, mixed>|null  The provider invoice produced by the
     *     swap (id, amount_paid, amount_due, currency, payment_intent,
     *     billing_reason) or null when the provider returns none.
     */
    public function swap(User $user, Subscription $subscription, Plan $plan, string $cycle, array $options = []): ?array;

    /**
     * Create a Stripe Customer Portal session for the given customer.
     *
     * The portal lets the customer self-serve payment-method changes, invoice
     * history and card updates without the application ever handling raw card
     * data. Subscription / entitlement state stays authoritative in the local
     * application; the portal only manages the payment relationship.
     *
     * @return string  The hosted portal URL the company admin is redirected to.
     */
    public function billingPortal(User $user, ?string $returnUrl = null): string;

    /**
     * Refund a previously recorded payment.
     *
     * @return array{refund_id: string, amount_refunded: float}
     */
    public function refund(User $user, string $paymentIntentId, float $amount): array;
}
