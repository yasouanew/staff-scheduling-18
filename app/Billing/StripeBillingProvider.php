<?php

namespace App\Billing;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Laravel\Cashier\Cashier;

/**
 * Stripe payment provider, implemented on top of Laravel Cashier.
 *
 * This is the only class in the application that calls Stripe directly. All
 * provider-specific concerns (checkout sessions, subscription CRUD, refunds)
 * are consolidated here so the rest of the billing stack depends only on the
 * {@see BillingProvider} contract.
 */
class StripeBillingProvider implements BillingProvider
{
    /**
     * Resolve the Stripe price id for a plan / billing cycle.
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

    public function startCheckout(
        User $user,
        Plan $plan,
        string $cycle,
        string $subscriptionId,
        ?string $successUrl,
        ?string $cancelUrl,
        ?int $trialDays = null,
    ): array {
        $priceId = $this->priceIdFor($plan, $cycle);

        if (! $priceId) {
            throw new \RuntimeException('The selected plan is not configured with a Stripe price for this billing cycle.');
        }

        $user->createOrGetStripeCustomer();

        $metadata = [
            'local_subscription_id' => $subscriptionId,
            'plan_id' => (string) $plan->id,
            'billing_cycle' => $cycle,
        ];

        $payload = [
            'customer' => $user->stripe_id,
            'mode' => 'subscription',
            'line_items' => [['price' => $priceId, 'quantity' => 1]],
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'client_reference_id' => $subscriptionId,
            'metadata' => $metadata,
            'subscription_data' => ['metadata' => $metadata],
        ];

        if ($trialDays) {
            $payload['subscription_data']['trial_period_days'] = $trialDays;
        }

        $session = Cashier::stripe()->checkout->sessions->create($payload);

        return [
            'url' => $session->url,
            'session_id' => $session->id,
        ];
    }

    public function createSubscription(
        User $user,
        Plan $plan,
        string $cycle,
        string $paymentMethod,
        ?int $trialDays = null,
    ): array {
        $priceId = $this->priceIdFor($plan, $cycle);

        if (! $priceId) {
            throw new \RuntimeException('The selected plan is not configured with a Stripe price for this billing cycle.');
        }

        $user->createOrGetStripeCustomer();
        $user->updateDefaultPaymentMethod($paymentMethod);

        $payload = [
            'customer' => $user->stripe_id,
            'items' => [['price' => $priceId]],
            'default_payment_method' => $paymentMethod,
            'expand' => ['latest_invoice.payment_intent'],
        ];

        if ($trialDays) {
            $payload['trial_period_days'] = $trialDays;
        }

        $stripeSub = $user->stripe()->subscriptions->create($payload);
        $paymentIntent = $stripeSub->latest_invoice->payment_intent ?? null;

        return [
            'subscription_id' => $stripeSub->id,
            'status' => $stripeSub->status,
            'payment_intent_id' => $paymentIntent->id ?? null,
            'invoice_reference' => $stripeSub->latest_invoice->id ?? null,
        ];
    }

    public function cancel(User $user, Subscription $subscription, bool $immediately = false): void
    {
        $stripe = $user->stripe();

        if ($immediately) {
            $stripe->subscriptions->cancel($subscription->stripe_id, []);
        } else {
            $stripe->subscriptions->update($subscription->stripe_id, ['cancel_at_period_end' => true]);
        }
    }

    public function resume(User $user, Subscription $subscription): void
    {
        $user->stripe()->subscriptions->update(
            $subscription->stripe_id,
            ['cancel_at_period_end' => false]
        );
    }

    public function swap(User $user, Subscription $subscription, Plan $plan, string $cycle): void
    {
        $priceId = $this->priceIdFor($plan, $cycle);

        if (! $priceId) {
            return;
        }

        $stripeSub = $user->stripe()->subscriptions->retrieve($subscription->stripe_id, []);
        $user->stripe()->subscriptions->update($subscription->stripe_id, [
            'items' => [[
                'id' => $stripeSub->items->data[0]->id,
                'price' => $priceId,
            ]],
        ]);
    }

    public function billingPortal(User $user, ?string $returnUrl = null): string
    {
        $user->createOrGetStripeCustomer();

        $session = Cashier::stripe()->billingPortal->sessions->create([
            'customer' => $user->stripe_id,
            'return_url' => $returnUrl ?? rtrim((string) config('app.frontend_url', config('app.url')), '/'),
        ]);

        return (string) $session->url;
    }

    public function refund(User $user, string $paymentIntentId, float $amount): array
    {
        $refund = Cashier::stripe()->refunds->create([
            'payment_intent' => $paymentIntentId,
            'amount' => (int) round($amount * 100),
        ]);

        return [
            'refund_id' => $refund->id,
            'amount_refunded' => $refund->amount / 100,
        ];
    }
}
