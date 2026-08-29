<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ShiftResource extends JsonResource
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
            'roster_id' => $this->roster_id,
            'employee_id' => $this->employee_id,
            'position_id' => $this->position_id,
            'department_id' => $this->department_id,
            'date' => $this->date?->toDateString(),
            'start_time' => $this->start_time,
            'end_time' => $this->end_time,
            'break_minutes' => $this->break_minutes,
            'paid_break' => $this->paid_break,
            'required_staff' => $this->required_staff,
            'status' => $this->status,
            'notes' => $this->notes,
            // Transient roster validation flags (see RosterConflictService).
            // Only present once a roster has been annotated, so the grid can
            // fall back to "no conflict" whenever they are absent.
            'overtime_risk' => $this->when(
                isset($this->overtime_risk),
                fn () => (bool) $this->overtime_risk,
            ),
            'leave_conflict' => $this->when(
                isset($this->leave_conflict),
                fn () => (bool) $this->leave_conflict,
            ),
            'double_booked' => $this->when(
                isset($this->double_booked),
                fn () => (bool) $this->double_booked,
            ),
            'company' => new CompanyResource($this->whenLoaded('company')),
            'branch' => new BranchResource($this->whenLoaded('branch')),
            'roster' => new RosterResource($this->whenLoaded('roster')),
            'employee' => new EmployeeResource($this->whenLoaded('employee')),
            'position' => new PositionResource($this->whenLoaded('position')),
            'department' => new DepartmentResource($this->whenLoaded('department')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
