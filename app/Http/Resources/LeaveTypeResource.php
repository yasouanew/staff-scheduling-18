<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeaveTypeResource extends JsonResource
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
            'name' => $this->name,
            'code' => $this->code,
            'description' => $this->description,
            'allowance_days' => $this->allowance_days,
            'is_paid' => (bool) $this->is_paid,
            'allows_rollover' => (bool) $this->allows_rollover,
            'max_rollover_days' => $this->max_rollover_days,
            'requires_approval' => (bool) $this->requires_approval,
            'allow_half_day' => (bool) $this->allow_half_day,
            'max_days_per_request' => $this->max_days_per_request,
            'color' => $this->color,
            'status' => $this->status,
            'created_by' => $this->created_by,
            'updated_by' => $this->updated_by,
            'company' => new CompanyResource($this->whenLoaded('company')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
