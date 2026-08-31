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
     * Cancel a subscription immediately or at the end of the current period.
     */
    public function cancel(User $user, Subscription $subscription, bool $immediately = false): void;

    /**
     * Resume a cancelled (or grace-period) subscription.
     */
    public function resume(User $user, Subscription $subscription): void;

    /**
     * Swap the subscription's plan / billing cycle in the provider.
     */
    public function swap(User $user, Subscription $subscription, Plan $plan, string $cycle): void;

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
