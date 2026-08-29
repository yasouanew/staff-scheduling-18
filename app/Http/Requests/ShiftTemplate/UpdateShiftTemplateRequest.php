<?php

namespace App\Http\Requests\ShiftTemplate;

use Illuminate\Foundation\Http\FormRequest;

class UpdateShiftTemplateRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is handled by the ShiftTemplatePolicy via the controller.
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
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'start_time' => ['sometimes', 'required', 'date_format:H:i'],
            'end_time' => ['sometimes', 'required', 'date_format:H:i'],
            'break_minutes' => ['nullable', 'integer', 'min:0', 'max:1440'],
            'color' => ['nullable', 'string', 'regex:/^#([A-Fa-f0-9]{6})$/'],
            'is_paid_break' => ['nullable', 'boolean'],
            'status' => ['nullable', 'string', 'in:active,inactive'],
        ];
    }
}
