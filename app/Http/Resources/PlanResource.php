<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PlanResource extends JsonResource
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
            'name' => $this->name,
            'slug' => $this->slug,
            'price_monthly' => $this->price_monthly,
            'price_six_monthly' => $this->price_six_monthly,
            'price_yearly' => $this->price_yearly,
            'stripe_monthly_price_id' => $this->stripe_monthly_price_id,
            'stripe_six_monthly_price_id' => $this->stripe_six_monthly_price_id,
            'stripe_yearly_price_id' => $this->stripe_yearly_price_id,
            'stripe_product_id' => $this->stripe_product_id,
            'max_employees' => $this->max_employees,
            'max_branches' => $this->max_branches,
            'features' => $this->features ?? [],
            'is_active' => $this->is_active,
            'subscriptions_count' => $this->whenCounted('subscriptions'),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
