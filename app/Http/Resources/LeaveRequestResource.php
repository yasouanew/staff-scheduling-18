<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeaveRequestResource extends JsonResource
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
            'employee_id' => $this->employee_id,
            'leave_type_id' => $this->leave_type_id,
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'start_session' => $this->start_session,
            'end_session' => $this->end_session,
            'total_days' => $this->total_days,
            'reason' => $this->reason,
            'attachment' => $this->attachment,
            'attachments' => $this->attachments ?? ($this->attachment ? [$this->attachment] : []),
            'status' => $this->status,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at?->toIso8601String(),
            'rejected_by' => $this->rejected_by,
            'rejected_at' => $this->rejected_at?->toIso8601String(),
            'rejection_reason' => $this->rejection_reason,
            'admin_notes' => $this->admin_notes,
            'employee' => new EmployeeResource($this->whenLoaded('employee')),
            'leave_type' => $this->whenLoaded('leaveType'),
            'approver' => new UserResource($this->whenLoaded('approver')),
            'rejecter' => new UserResource($this->whenLoaded('rejecter')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
