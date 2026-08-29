<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SubscriptionPaymentResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
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
            'is_refundable' => $this->isRefundable(),
            'is_refunded' => $this->isRefunded(),
            'paid_at' => $this->paid_at?->toIso8601String(),
            'refunded_at' => $this->refunded_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
