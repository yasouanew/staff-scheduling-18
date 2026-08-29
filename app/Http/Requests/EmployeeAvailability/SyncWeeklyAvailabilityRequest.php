<?php

namespace App\Http\Requests\EmployeeAvailability;

use Illuminate\Foundation\Http\FormRequest;

class SyncWeeklyAvailabilityRequest extends FormRequest
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
     * Replaces the employee's full weekly availability with the given slots.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'availabilities' => ['required', 'array', 'min:1'],
            'availabilities.*.day_of_week' => ['required', 'integer', 'between:0,6'],
            'availabilities.*.start_time' => ['nullable', 'date_format:H:i'],
            'availabilities.*.end_time' => ['nullable', 'date_format:H:i', 'after:availabilities.*.start_time'],
            'availabilities.*.is_available' => ['nullable', 'boolean'],
        ];
    }
}
