<?php

namespace App\Services;

use App\Billing\BillingProvider;
use App\Models\SubscriptionPayment;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PaymentService
{
    public function __construct(
        private readonly BillingProvider $billing,
    ) {
    }
    /**
     * Refund a subscription payment (fully or partially) via Stripe.
     *
     * @param  float|null  $amount  The amount to refund. Null refunds the remaining balance.
     */
    public function refund(SubscriptionPayment $payment, ?float $amount = null): SubscriptionPayment
    {
        if (! $payment->isRefundable()) {
            throw new \RuntimeException('This payment cannot be refunded.');
        }

        $remaining = (float) $payment->amount - (float) $payment->amount_refunded;
        $refundAmount = $amount === null ? $remaining : min($amount, $remaining);

        if ($refundAmount <= 0) {
            throw new \RuntimeException('Refund amount must be greater than zero.');
        }

        return DB::transaction(function () use ($payment, $refundAmount, $remaining) {
            $this->refundInStripe($payment, $refundAmount);

            $totalRefunded = (float) $payment->amount_refunded + $refundAmount;
            $fullyRefunded = $totalRefunded >= (float) $payment->amount;

            $payment->update([
                'amount_refunded' => $totalRefunded,
                'status' => $fullyRefunded ? 'refunded' : $payment->status,
                'refunded_at' => now(),
            ]);

            return $payment->fresh();
        });
    }

    /**
     * Issue the refund in Stripe against the stored PaymentIntent.
     */
    protected function refundInStripe(SubscriptionPayment $payment, float $amount): void
    {
        $user = $payment->subscription?->user;

        if (! $user || ! $payment->stripe_payment_intent_id) {
            throw new \RuntimeException('This payment cannot be refunded.');
        }

        $this->billing->refund($user, $payment->stripe_payment_intent_id, $amount);
    }
}
