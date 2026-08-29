<?php

namespace App\Http\Requests\Invitation;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Validates the web "set your password" submission.
 *
 * The token itself is the credential, so the route is public; the token's
 * validity is checked by {@see \App\Services\InvitationService}.
 */
class AcceptInvitationRequest extends FormRequest
{
    /** Public route — the emailed token is the authorisation. */
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
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
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
