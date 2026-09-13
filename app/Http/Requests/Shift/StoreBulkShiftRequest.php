<?php

namespace App\Http\Requests\Shift;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBulkShiftRequest extends FormRequest
{
    /**
     * Authorization is handled by the ShiftPolicy via the controller.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * One branch-day created atomically: shared roster/date plus N per-employee rows.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'roster_id' => ['required', 'integer', 'exists:rosters,id'],
            'date' => ['required', 'date'],
            'shifts' => ['required', 'array', 'min:1', 'max:100'],
            'shifts.*.employee_id' => [
                'nullable',
                'integer',
                Rule::exists('employees', 'id')->where('status', 'active'),
            ],
            'shifts.*.position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'shifts.*.department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'shifts.*.start_time' => ['required', 'date_format:H:i'],
            'shifts.*.end_time' => ['required', 'date_format:H:i'],
            'shifts.*.break_minutes' => ['nullable', 'integer', 'min:0'],
            'shifts.*.paid_break' => ['nullable', 'boolean'],
            'shifts.*.required_staff' => ['nullable', 'integer', 'min:1', 'max:99'],
            'shifts.*.status' => ['nullable', 'string', 'in:scheduled,completed,cancelled,swap_requested'],
            'shifts.*.notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
