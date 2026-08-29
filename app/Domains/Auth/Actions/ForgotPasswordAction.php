<?php

namespace App\Domains\Auth\Actions;

use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class ForgotPasswordAction
{
    /**
     * Send a password reset link to the given email.
     *
     * @param  array<string, mixed>  $data
     * @return string The password broker status key.
     *
     * @throws ValidationException
     */
    public function execute(array $data): string
    {
        $status = Password::sendResetLink([
            'email' => $data['email'],
        ]);

        if ($status !== Password::RESET_LINK_SENT) {
            throw ValidationException::withMessages([
                'email' => [__($status)],
            ]);
        }

        return $status;
    }
}
