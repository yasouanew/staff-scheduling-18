<?php

namespace App\Http\Requests\LeaveType;

use Illuminate\Foundation\Http\FormRequest;

class UpdateLeaveTypeRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is handled by the LeaveTypePolicy via the controller.
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
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string', 'max:1000'],
            'allowance_days' => ['nullable', 'numeric', 'min:0', 'max:365'],
            'is_paid' => ['sometimes', 'boolean'],
            'allows_rollover' => ['sometimes', 'boolean'],
            'max_rollover_days' => ['nullable', 'numeric', 'min:0', 'max:365'],
            'requires_approval' => ['sometimes', 'boolean'],
            'allow_half_day' => ['sometimes', 'boolean'],
            'max_days_per_request' => ['nullable', 'integer', 'min:1', 'max:365'],
            'color' => ['nullable', 'string', 'regex:/^#([A-Fa-f0-9]{6})$/'],
            'status' => ['sometimes', 'string', 'in:active,inactive'],
        ];
    }
}
