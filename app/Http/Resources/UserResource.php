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

                if ($company === null) {
                    return [
                        'is_locked' => false,
                        'reason' => null,
                        'locked_at' => null,
                        'trial_ends_at' => null,
                        'trial_is_active' => false,
                        'active_subscription_id' => null,
                        'active_subscription_ends_at' => null,
                    ];
                }

                // Authoritative server-side access state — never derived from a
                // client-supplied timestamp or the client's clock.
                $state = app(\App\Services\AccessStateService::class)->toArray($company);

                return $state + [
                    'locked_at' => $company->locked_at?->toIso8601String(),
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
            // Expose permissions whenever the authenticated user's roles are
            // loaded (the account endpoints: /auth/me, login, register, profile
            // update, web-welcome complete and feature-tip dismiss). Nested
            // resources (roster publisher, leave approver, ...) do not eager-load
            // roles, so their UserResource never leaks the permission list.
            'permissions' => $this->when(
                $this->relationLoaded('roles'),
                fn () => $this->getAllPermissions()->pluck('name')
            ),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'web_welcome_completed_at' => $this->web_welcome_completed_at?->toIso8601String(),
            'web_feature_tips' => $this->web_feature_tips ?? [],
            'email_verified_at' => $this->email_verified_at?->toIso8601String(),
        ];
    }
}
