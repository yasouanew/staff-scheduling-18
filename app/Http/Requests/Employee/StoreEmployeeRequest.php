<?php

namespace App\Http\Requests\Employee;

use Illuminate\Foundation\Http\FormRequest;

class StoreEmployeeRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is handled by the EmployeePolicy via the controller.
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
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'employee_number' => ['nullable', 'string', 'max:50'],
            'employment_type' => ['nullable', 'string', 'in:full_time,part_time,casual,contractor'],
            'dob' => ['nullable', 'date', 'before:today'],
            'gender' => ['nullable', 'string', 'in:male,female,other,prefer_not_to_say'],
            'address' => ['nullable', 'string', 'max:1000'],
            'emergency_contact' => ['nullable', 'string', 'max:255'],
            'emergency_phone' => ['nullable', 'string', 'max:50'],
            'hire_date' => ['nullable', 'date'],
            'termination_date' => ['nullable', 'date', 'after_or_equal:hire_date'],
            'hourly_rate' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'],
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'status' => ['nullable', 'string', 'in:active,inactive,terminated'],
        ];
    }
}
