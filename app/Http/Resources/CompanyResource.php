<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompanyResource extends JsonResource
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
            'abn' => $this->abn,
            'email' => $this->email,
            'phone' => $this->phone,
            'logo' => $this->logo,
            'timezone' => $this->timezone,
            'country' => $this->country,
            'state' => $this->state,
            'business_type' => $this->business_type,
            'status' => $this->status,
            'trial_ends_at' => $this->trial_ends_at?->toIso8601String(),
            'locked_at' => $this->locked_at?->toIso8601String(),
            'subscription_id' => $this->subscription_id,
            'branches_count' => $this->whenCounted('branches'),
            'employees_count' => $this->whenCounted('employees'),
            'users_count' => $this->whenCounted('users'),
            'settings' => new CompanySettingResource($this->whenLoaded('settings')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
