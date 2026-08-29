<?php

namespace App\Http\Requests\Employee;

use Illuminate\Foundation\Http\FormRequest;

class InviteEmployeeRequest extends FormRequest
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
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'role' => ['required', 'string', 'in:company_admin,scheduler,employee'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'employment_type' => ['nullable', 'string', 'in:full_time,part_time,casual,contractor'],
            'hourly_rate' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'],
        ];
    }
}
