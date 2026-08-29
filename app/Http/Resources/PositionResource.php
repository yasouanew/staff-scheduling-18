<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PositionResource extends JsonResource
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
            'department_id' => $this->department_id,
            'name' => $this->name,
            'code' => $this->code,
            'description' => $this->description,
            'default_hourly_rate' => $this->default_hourly_rate,
            'color' => $this->color,
            'status' => $this->status,
            'created_by' => $this->created_by,
            'updated_by' => $this->updated_by,
            'company' => new CompanyResource($this->whenLoaded('company')),
            'department' => new DepartmentResource($this->whenLoaded('department')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
