<?php

namespace App\Http\Requests\Invitation;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Validates the password the employee chose in the app (mobile step 3).
 *
 * The `setup_token` is the short-lived proof issued when their code was
 * verified — without it, knowing an email address would be enough to take over
 * an account.
 */
class CompleteMobileSetupRequest extends FormRequest
{
    /** Public route — the setup token is the authorisation. */
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
        return [
            'email' => ['required', 'email', 'max:255'],
            'setup_token' => ['required', 'string'],
            'password' => [
                'required',
                'confirmed',
                Password::min(8)->letters()->mixedCase()->numbers()->symbols(),
            ],
        ];
    }

    /**
     * Normalise the address so it matches the stored, lower-cased invitation.
     */
    protected function prepareForValidation(): void
    {
        if ($this->filled('email')) {
            $this->merge(['email' => strtolower(trim((string) $this->input('email')))]);
        }
    }
}
