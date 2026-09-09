<?php

namespace App\Domains\Auth\Actions;

use App\Models\User;
use App\Services\SeatCapacityService;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ResetPasswordAction
{
    public function __construct(
        private SeatCapacityService $seats,
    ) {}

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
                    // Promoting an invited account to `active` consumes a seat,
                    // so it must pass the per-seat capacity guard first. The user
                    // is excluded so a re-set password cannot self-block.
                    $company = $user->company;

                    if ($company !== null) {
                        $this->seats->assertCanActivateUser($company, $user);
                    }

                    $attributes['status'] = 'active';

                    if ($user->email_verified_at === null) {
                        // Reaching the emailed link proves the address works.
                        $attributes['email_verified_at'] = now();
                    }
                }

                $user->forceFill($attributes)->save();

                // When an account created `invited` activates (the invite was
                // accepted by choosing a password) any linked directory row that
                // was held as `pending` because the plan was full at invite time
                // must now become `active` — the account is sign-in ready and a
                // seat was just consumed, so leaving it pending would keep the
                // person unschedulable forever. Rows created through other
                // journeys (already active/inactive) are left untouched.
                if ($user->status === 'active' && $user->employee !== null && $user->employee->status === 'pending') {
                    $user->employee->update(['status' => 'active']);
                }

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
