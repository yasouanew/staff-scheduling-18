<?php

namespace App\Http\Requests\Branch;

use App\Http\Requests\Branch\Concerns\ValidatesBranchSchedule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreBranchRequest extends FormRequest
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
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'manager_id' => ['nullable', 'integer', 'exists:employees,id'],
            // Branch names only need to be unique inside a company. Non super
            // admins have their company forced in the controller, so the rule
            // resolves the same company the branch will actually be created in.
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('branches', 'name')->where(
                    fn ($query) => $query->where('company_id', $this->targetCompanyId())
                ),
            ],
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
     * The company the branch will belong to.
     *
     * Super admins may create a branch for any company, so their payload wins;
     * everyone else is pinned to their own company by the controller.
     */
    protected function targetCompanyId(): ?int
    {
        $companyId = $this->user()?->hasRole('super_admin')
            ? $this->input('company_id')
            : $this->user()?->company_id;

        return $companyId === null ? null : (int) $companyId;
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

