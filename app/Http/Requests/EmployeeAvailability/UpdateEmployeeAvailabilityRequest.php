<?php

namespace App\Http\Requests\EmployeeAvailability;

use Illuminate\Foundation\Http\FormRequest;

class UpdateEmployeeAvailabilityRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is handled by the EmployeeAvailabilityPolicy via the controller.
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
            'day_of_week' => ['sometimes', 'required', 'integer', 'between:0,6'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i', 'after:start_time'],
            'is_available' => ['nullable', 'boolean'],
        ];
    }
}
