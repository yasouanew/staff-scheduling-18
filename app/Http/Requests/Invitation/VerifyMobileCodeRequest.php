<?php

namespace App\Http\Requests\Invitation;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the code the employee typed into the app (mobile onboarding step 2).
 */
class VerifyMobileCodeRequest extends FormRequest
{
    /** Public route — the emailed code is the authorisation. */
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
        $length = (int) config('invitations.code_length', 6);

        return [
            'email' => ['required', 'email', 'max:255'],
            'code' => ['required', 'string', 'digits:'.$length],
        ];
    }

    /**
     * Strip formatting the on-screen keyboard may add (spaces, dashes) and
     * normalise the address before the digits rule runs.
     */
    protected function prepareForValidation(): void
    {
        $merge = [];

        if ($this->filled('email')) {
            $merge['email'] = strtolower(trim((string) $this->input('email')));
        }

        if ($this->filled('code')) {
            $merge['code'] = preg_replace('/\D/', '', (string) $this->input('code'));
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }

    /**
     * Get custom messages for validator errors.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        $length = (int) config('invitations.code_length', 6);

        return [
            'code.digits' => "Enter the {$length}-digit code from your email.",
        ];
    }
}
