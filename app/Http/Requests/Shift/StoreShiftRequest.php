<?php

namespace App\Http\Requests\Shift;

use Illuminate\Foundation\Http\FormRequest;

class StoreShiftRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is handled by the ShiftPolicy via the controller.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'roster_id' => ['required', 'integer', 'exists:rosters,id'],
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'date' => ['required', 'date'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i'],
            'break_minutes' => ['nullable', 'integer', 'min:0'],
            'paid_break' => ['nullable', 'boolean'],
            'required_staff' => ['nullable', 'integer', 'min:1', 'max:99'],
            'status' => ['nullable', 'string', 'in:scheduled,completed,cancelled,swap_requested'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
