<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class EmployeeResource extends JsonResource
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
            'department_id' => $this->department_id,
            'position_id' => $this->position_id,
            'branch_id' => $this->branch_id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'employee_number' => $this->employee_number,
            'employment_type' => $this->employment_type,
            'dob' => $this->dob?->toDateString(),
            'gender' => $this->gender,
            'address' => $this->address,
            'emergency_contact' => $this->emergency_contact,
            'emergency_phone' => $this->emergency_phone,
            'hire_date' => $this->hire_date?->toDateString(),
            'termination_date' => $this->termination_date?->toDateString(),
            'hourly_rate' => $this->hourly_rate,
            'photo' => $this->photo,
            'photo_url' => $this->photo ? Storage::disk('public')->url($this->photo) : null,
            'status' => $this->status,
            'company' => new CompanyResource($this->whenLoaded('company')),
            'user' => new UserResource($this->whenLoaded('user')),
            'department' => new DepartmentResource($this->whenLoaded('department')),
            'position' => new PositionResource($this->whenLoaded('position')),
            'branch' => new BranchResource($this->whenLoaded('branch')),
            'invitation' => $this->whenLoaded(
                'invitation',
                fn () => $this->invitation
                    ? new EmployeeInvitationResource($this->invitation)
                    : null
            ),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),

        ];
    }
}
