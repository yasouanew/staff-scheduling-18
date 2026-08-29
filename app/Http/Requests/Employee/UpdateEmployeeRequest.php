<?php

namespace App\Http\Requests\Employee;

use Illuminate\Foundation\Http\FormRequest;

class UpdateEmployeeRequest extends FormRequest
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
     * Every editable column on the employee profile is accepted here, because the
     * team page's edit dialog is the single place an administrator maintains a
     * record — a field missing from this list would silently discard whatever the
     * admin typed into it.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'first_name' => ['sometimes', 'required', 'string', 'max:255'],
            'last_name' => ['sometimes', 'required', 'string', 'max:255'],
            'employee_number' => ['nullable', 'string', 'max:50'],
            // `contract` is what the UI (and the rest of the app) calls it;
            // `contractor` is accepted so records created by earlier versions can
            // still be saved without silently rewriting their employment basis.
            'employment_type' => ['nullable', 'string', 'in:full_time,part_time,casual,contract,contractor'],
            'dob' => ['nullable', 'date', 'before:today'],
            'gender' => ['nullable', 'string', 'in:male,female,other,prefer_not_to_say'],
            'address' => ['nullable', 'string', 'max:1000'],
            'emergency_contact' => ['nullable', 'string', 'max:255'],
            'emergency_phone' => ['nullable', 'string', 'max:50'],
            'hire_date' => ['nullable', 'date'],
            'termination_date' => ['nullable', 'date', 'after_or_equal:hire_date'],
            'hourly_rate' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'],
            // Anything other than `active` revokes the person's access — see
            // EmployeeService::syncAccountAccess().
            'status' => ['nullable', 'string', 'in:active,pending,inactive,terminated'],
        ];
    }

    /**
     * Get custom messages for validator errors.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'termination_date.after_or_equal' => 'The termination date cannot be before the hire date.',
        ];
    }
}
