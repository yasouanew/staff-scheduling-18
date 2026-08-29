<?php

namespace App\Domains\Auth\Actions;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ConfirmPasswordAction
{
    /**
     * Verify that the supplied password matches the authenticated user's.
     *
     * Used to re-authenticate before a sensitive action ("confirm password"
     * screen). Throws a validation exception on mismatch so the controller can
     * return a 422 with a field-level error.
     *
     * @throws ValidationException
     */
    public function execute(User $user, string $password): void
    {
        if (! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages([
                'password' => [__('The provided password is incorrect.')],
            ]);
        }
    }
}
