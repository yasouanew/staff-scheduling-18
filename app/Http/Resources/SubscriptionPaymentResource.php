<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SubscriptionPaymentResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * The subscription block (status + period dates) lets the SPA's Invoices
     * tab show the subscription state ("Expired", "Active", …) alongside the
     * subscription / expiry dates for every invoice row.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $subscription = $this->whenLoaded('subscription');

        return [
            'id' => $this->id,
            'subscription_id' => $this->subscription_id,
            'amount' => $this->amount,
            'amount_refunded' => $this->amount_refunded,
            'currency' => $this->currency,
            'payment_provider' => $this->payment_provider,
            'provider_reference' => $this->provider_reference,
            'stripe_payment_intent_id' => $this->stripe_payment_intent_id,
            'status' => $this->status,
            'type' => $this->type ?? 'subscription',
            'description' => $this->description,
            'is_refundable' => $this->isRefundable(),
            'is_refunded' => $this->isRefunded(),
            'paid_at' => $this->paid_at?->toIso8601String(),
            'refunded_at' => $this->refunded_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'subscription' => $subscription instanceof \App\Models\Subscription ? [
                'id' => $subscription->id,
                'status' => $subscription->status,
                'billing_cycle' => $subscription->billing_cycle,
                'starts_at' => $subscription->starts_at?->toIso8601String(),
                'ends_at' => $subscription->ends_at?->toIso8601String(),
                'cancelled_at' => $subscription->cancelled_at?->toIso8601String(),
            ] : null,
        ];
    }
}
