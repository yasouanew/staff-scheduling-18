<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SubscriptionResource extends JsonResource
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
            'company_id' => $this->company_id,
            'user_id' => $this->user_id,
            'plan_id' => $this->plan_id,
            'stripe_id' => $this->stripe_id,
            'stripe_status' => $this->stripe_status,
            'stripe_price' => $this->stripe_price,
            'quantity' => $this->quantity,
            'status' => $this->status,
            'billing_cycle' => $this->billing_cycle,
            'on_trial' => $this->onTrial(),
            'is_active' => $this->isActive(),
            'is_cancelled' => $this->isCancelled(),
            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'trial_ends_at' => $this->trial_ends_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'plan' => new PlanResource($this->whenLoaded('plan')),
            'payments' => SubscriptionPaymentResource::collection($this->whenLoaded('payments')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
