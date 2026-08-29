<?php

namespace App\Domains\Auth\Actions;

use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ResetPasswordAction
{
    /**
     * Reset the user's password using a valid reset token.
     *
     * @param  array<string, mixed>  $data
     * @return string The password broker status key.
     *
     * @throws ValidationException
     */
    public function execute(array $data): string
    {
        $status = Password::reset(
            [
                'email' => $data['email'],
                'password' => $data['password'],
                'password_confirmation' => $data['password_confirmation'] ?? $data['password'],
                'token' => $data['token'],
            ],
            function (User $user, string $password) {
                $attributes = [
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                ];

                // Invited users are created with `status = 'invited'` and a random
                // password, and this same broker powers the "set your password"
                // link in the invitation email. Choosing a password is the moment
                // the invitation is accepted, so activate the account here —
                // otherwise LoginAction would keep rejecting them as inactive and
                // an invited admin/scheduler could never sign in at all.
                if ($user->status === 'invited') {
                    $attributes['status'] = 'active';

                    if ($user->email_verified_at === null) {
                        // Reaching the emailed link proves the address works.
                        $attributes['email_verified_at'] = now();
                    }
                }

                $user->forceFill($attributes)->save();


                // Revoke all existing access tokens so old sessions can't be reused.
                $user->tokens()->delete();

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => [__($status)],
            ]);
        }

        return $status;
    }
}
