<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public-safe view of an onboarding invitation.
 *
 * Only status metadata is exposed — the token, code and setup-token hashes never
 * leave the server, so the team page can show "invited 2 days ago, still
 * pending" without handing anyone the means to accept on the invitee's behalf.
 */
class EmployeeInvitationResource extends JsonResource
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
            'employee_id' => $this->employee_id,
            'user_id' => $this->user_id,
            'email' => $this->email,
            'role' => $this->role,
            'channel' => $this->channel,
            'status' => $this->statusLabel(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'last_sent_at' => $this->last_sent_at?->toIso8601String(),
            'send_count' => $this->send_count,
            'accepted_at' => $this->accepted_at?->toIso8601String(),
            'invited_by' => $this->whenLoaded('inviter', fn () => $this->inviter?->name),
        ];
    }

    /**
     * Derive the single status the UI badges on: accepted, expired or pending.
     */
    protected function statusLabel(): string
    {
        if ($this->accepted_at !== null) {
            return 'accepted';
        }

        return $this->isExpired() ? 'expired' : 'pending';
    }
}
