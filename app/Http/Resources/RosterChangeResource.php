<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\RosterChange
 */
class RosterChangeResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'roster_id' => $this->roster_id,
            'shift_id' => $this->shift_id,
            'employee_id' => $this->employee_id,
            'action' => $this->action,
            'old_data' => $this->old_data,
            'new_data' => $this->new_data,
            'performed_by' => $this->performed_by,
            'performed_by_name' => optional($this->performer)->name,
            'employee_name' => optional($this->employee)->full_name,
            'created_at' => optional($this->created_at)->toIso8601String(),
        ];
    }
}
