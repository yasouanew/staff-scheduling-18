<?php

namespace App\Http\Requests\Employee;

use App\Services\InvitationService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates "Send invite" from the team page row menu.
 *
 * The email is optional: an employee who already has a linked account is
 * re-invited at their existing address, while an employee created without a
 * login must supply one here (enforced by the service).
 */
class SendInvitationRequest extends FormRequest
{
    /**
     * Authorization is handled by the controller via EmployeePolicy.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var \App\Models\Employee $employee */
        $employee = $this->route('employee');

        return [
            'role' => ['required', 'string', Rule::in(InvitationService::ASSIGNABLE_ROLES)],
            'email' => [
                'nullable',
                'email',
                'max:255',
                // The invitee may keep their own address, but must not collide
                // with anybody else's login.
                Rule::unique('users', 'email')->ignore($employee?->user_id),
            ],
        ];
    }

    /**
     * Normalise the address before validation so casing/whitespace never
     * creates a "duplicate" account for the same person.
     */
    protected function prepareForValidation(): void
    {
        if ($this->filled('email')) {
            $this->merge(['email' => strtolower(trim((string) $this->input('email')))]);
        }
    }

    /**
     * Get custom messages for validator errors.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'role.in' => 'Choose a valid role: company admin, scheduler or employee.',
            'email.unique' => 'This email address is already in use by another account.',
        ];
    }
}
