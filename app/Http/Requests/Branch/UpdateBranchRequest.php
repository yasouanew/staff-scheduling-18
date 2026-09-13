<?php

namespace App\Http\Requests\Branch;

use App\Http\Requests\Branch\Concerns\ValidatesBranchSchedule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateBranchRequest extends FormRequest
{
    use ValidatesBranchSchedule;


    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is handled by the BranchPolicy via the controller.
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
            // The branch being edited is ignored so re-saving an unchanged name
            // (or a case-only edit of it) is not treated as a duplicate. The
            // company is taken from the existing branch rather than the payload,
            // which the update endpoint never lets a client change.
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('branches', 'name')
                    ->where(fn ($query) => $query->where('company_id', $this->route('branch')?->company_id))
                    ->ignore($this->route('branch')?->getKey()),
            ],
            'manager_id' => ['nullable', 'integer', 'exists:employees,id'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:1000'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'timezone' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'in:active,inactive'],
            ...$this->scheduleRules(),
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
            ...$this->scheduleMessages(),
            'name.unique' => 'A branch with this name already exists for this company.',
        ];
    }
}

