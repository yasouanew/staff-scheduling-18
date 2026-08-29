<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RosterResource extends JsonResource
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
            'branch_id' => $this->branch_id,
            'week_start' => $this->week_start?->toDateString(),
            'week_end' => $this->week_end?->toDateString(),
            'status' => $this->status,
            'version' => $this->version,
            'published_at' => $this->published_at?->toIso8601String(),
            'published_by' => $this->published_by,
            'company' => new CompanyResource($this->whenLoaded('company')),
            'branch' => new BranchResource($this->whenLoaded('branch')),
            'publisher' => new UserResource($this->whenLoaded('publisher')),
            'shifts' => ShiftResource::collection($this->whenLoaded('shifts')),
            'shifts_count' => $this->when(isset($this->shifts_count), $this->shifts_count),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
