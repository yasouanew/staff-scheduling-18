<?php

namespace App\Http\Requests\Invitation;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the app's "email me a code" request (mobile onboarding step 1).
 */
class RequestMobileCodeRequest extends FormRequest
{
    /** Public route — the mailbox is what gets proven. */
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
