<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
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
            'company_access' => $this->when($this->company_id !== null, function (): array {
                $company = $this->company;
                $subscription = $company?->activeSubscription();

                return [
                    'is_locked' => $company?->isAccessLocked() ?? false,
                    'locked_at' => $company?->locked_at?->toIso8601String(),
                    'trial_ends_at' => $company?->trial_ends_at?->toIso8601String(),
                    'trial_is_active' => $company?->isTrialActive() ?? false,
                    'active_subscription_id' => $subscription?->id,
                    'active_subscription_ends_at' => $subscription?->ends_at?->toIso8601String(),
                ];
            }),
            'branch_id' => $this->branch_id,
            'employee_id' => $this->whenLoaded('employee', fn () => $this->employee?->id),
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'role' => $this->role,
            'status' => $this->status,
            'roles' => $this->whenLoaded('roles', fn () => $this->getRoleNames()),
            'permissions' => $this->when(
                $request->routeIs('api.auth.me') || $request->routeIs('api.auth.login') || $request->routeIs('api.auth.register'),
                fn () => $this->getAllPermissions()->pluck('name')
            ),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'web_welcome_completed_at' => $this->web_welcome_completed_at?->toIso8601String(),
            'web_feature_tips' => $this->web_feature_tips ?? [],
            'email_verified_at' => $this->email_verified_at?->toIso8601String(),
        ];
    }
}
