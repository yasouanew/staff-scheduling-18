<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\EmployeeInvitation;
use App\Models\User;
use App\Notifications\MobileInvitationNotification;
use App\Notifications\MobileVerificationCodeNotification;
use App\Notifications\WebInvitationNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Onboarding invitations for existing employee records.
 *
 * Two distinct journeys share one ledger row:
 *
 *  - Web  (company_admin / scheduler): the email carries a single-use token that
 *    opens the SPA's set-password screen bound to the invited address.
 *  - Mobile (employee): the email guides them to install the app. In the app they
 *    type their email, we mail a one-time code, they verify it to obtain a
 *    short-lived setup token, and that token authorises choosing a password.
 *
 * Every secret is stored as a SHA-256 hash so a database leak cannot be replayed;
 * the plain values only ever exist in the outbound email.
 */
class InvitationService
{
    /** Roles an administrator may invite someone as. */
    public const ASSIGNABLE_ROLES = ['company_admin', 'scheduler', 'employee'];

    /**
     * Create (or refresh) an invitation for an employee and email it.
     *
     * Re-sending is deliberately idempotent on the user: the same ledger row is
     * reused with freshly rotated secrets, so an older link stops working the
     * moment a new invite goes out.
     *
     * @param  array{role: string, email?: string|null}  $data
     *
     * @throws ValidationException
     */
    public function invite(Employee $employee, array $data, ?User $invitedBy = null): EmployeeInvitation
    {
        $role = $data['role'];
        $email = isset($data['email']) ? strtolower(trim((string) $data['email'])) : null;

        $user = $employee->user;

        if ($user === null && $email === null) {
            throw ValidationException::withMessages([
                'email' => ['This employee has no email address yet. Provide one to send an invitation.'],
            ]);
        }

        // Guard the address against every *other* account before we touch anything.
        if ($email !== null) {
            $this->assertEmailAvailable($email, $user?->id);
        }

        $channel = EmployeeInvitation::channelForRole($role);

        return DB::transaction(function () use ($employee, $user, $email, $role, $channel, $invitedBy) {
            $user = $user === null
                ? $this->createInvitedUser($employee, (string) $email, $role)
                : $this->refreshInvitedUser($user, $email, $role);

            // Keep the employee row pointed at the account it onboards.
            if ((int) $employee->user_id !== (int) $user->id) {
                $employee->forceFill(['user_id' => $user->id])->save();
            }

            $invitation = EmployeeInvitation::firstOrNew(['user_id' => $user->id]);

            $invitation->fill([
                'company_id' => $employee->company_id,
                'employee_id' => $employee->id,
                'invited_by' => $invitedBy?->id,
                'email' => $user->email,
                'role' => $role,
                'channel' => $channel,
                'accepted_at' => null,
                // Rotating every secret invalidates any previously emailed link.
                'token_hash' => null,
                'expires_at' => null,
                'code_hash' => null,
                'code_expires_at' => null,
                'code_attempts' => 0,
                'setup_token_hash' => null,
                'setup_token_expires_at' => null,
                'send_count' => (int) ($invitation->send_count ?? 0) + 1,
                'last_sent_at' => now(),
            ]);

            $plainToken = null;

            if ($channel === EmployeeInvitation::CHANNEL_WEB) {
                $plainToken = Str::random(64);
                $invitation->token_hash = hash('sha256', $plainToken);
                $invitation->expires_at = now()->addMinutes(
                    (int) config('invitations.web_expires_in_minutes', 2880)
                );
            }

            $invitation->save();

            $this->sendInvitationEmail($user, $invitation, $plainToken, $invitedBy);

            return $invitation->fresh();
        });
    }

    /**
     * Resolve a web invitation from its emailed token + address.
     *
     * @throws ValidationException
     */
    public function resolveWebInvitation(string $token, string $email): EmployeeInvitation
    {
        $invitation = EmployeeInvitation::query()
            ->with(['user', 'company'])
            ->where('channel', EmployeeInvitation::CHANNEL_WEB)
            ->where('email', strtolower(trim($email)))
            ->where('token_hash', hash('sha256', $token))
            ->first();

        if ($invitation === null || $invitation->isAccepted() || $invitation->isExpired()) {
            throw ValidationException::withMessages([
                'token' => ['This invitation link is invalid or has expired. Please ask your administrator to send a new one.'],
            ]);
        }

        return $invitation;
    }

    /**
     * Accept a web invitation by setting the account's first password.
     *
     * @throws ValidationException
     */
    public function acceptWebInvitation(string $token, string $email, string $password): User
    {
        $invitation = $this->resolveWebInvitation($token, $email);

        return DB::transaction(function () use ($invitation, $password) {
            $user = $this->activate($invitation->user, $password);

            $invitation->forceFill([
                'accepted_at' => now(),
                'token_hash' => null,
                'expires_at' => null,
            ])->save();

            return $user;
        });
    }

    /**
     * Step 1 of the mobile flow: email a one-time code for the given address.
     *
     * Always resolves silently — never reveal whether an address is registered.
     *
     * @return bool Whether a code was actually dispatched.
     */
    public function sendMobileCode(string $email): bool
    {
        $invitation = EmployeeInvitation::query()
            ->with('user')
            ->pending()
            ->where('channel', EmployeeInvitation::CHANNEL_MOBILE)
            ->where('email', strtolower(trim($email)))
            ->first();

        if ($invitation === null || $invitation->user === null) {
            return false;
        }

        $length = (int) config('invitations.code_length', 6);
        $expiresInMinutes = (int) config('invitations.code_expires_in_minutes', 15);

        // Zero-padded so a leading zero is never silently dropped.
        $code = str_pad((string) random_int(0, (10 ** $length) - 1), $length, '0', STR_PAD_LEFT);

        $invitation->forceFill([
            'code_hash' => hash('sha256', $code),
            'code_expires_at' => now()->addMinutes($expiresInMinutes),
            'code_attempts' => 0,
            // A new code supersedes any setup token issued by an earlier one.
            'setup_token_hash' => null,
            'setup_token_expires_at' => null,
        ])->save();

        $invitation->user->notify(
            new MobileVerificationCodeNotification($code, $expiresInMinutes)
        );

        return true;
    }

    /**
     * Step 2 of the mobile flow: verify the emailed code.
     *
     * @return string The plain setup token that authorises choosing a password.
     *
     * @throws ValidationException
     */
    public function verifyMobileCode(string $email, string $code): string
    {
        $invitation = EmployeeInvitation::query()
            ->pending()
            ->where('channel', EmployeeInvitation::CHANNEL_MOBILE)
            ->where('email', strtolower(trim($email)))
            ->first();

        $invalid = ValidationException::withMessages([
            'code' => ['That code is invalid or has expired. Please request a new one.'],
        ]);

        if ($invitation === null || $invitation->code_hash === null) {
            throw $invalid;
        }

        if ($invitation->code_expires_at === null || $invitation->code_expires_at->isPast()) {
            throw $invalid;
        }

        // Burn the code once the attempt budget is spent so guessing cannot continue.
        if ($invitation->code_attempts >= (int) config('invitations.code_max_attempts', 5)) {
            $invitation->forceFill(['code_hash' => null, 'code_expires_at' => null])->save();

            throw ValidationException::withMessages([
                'code' => ['Too many incorrect attempts. Please request a new code.'],
            ]);
        }

        if (! hash_equals($invitation->code_hash, hash('sha256', trim($code)))) {
            $invitation->increment('code_attempts');

            throw $invalid;
        }

        $setupToken = Str::random(64);

        $invitation->forceFill([
            // The code is single-use: consumed the moment it succeeds.
            'code_hash' => null,
            'code_expires_at' => null,
            'code_attempts' => 0,
            'setup_token_hash' => hash('sha256', $setupToken),
            'setup_token_expires_at' => now()->addMinutes(
                (int) config('invitations.setup_token_expires_in_minutes', 30)
            ),
        ])->save();

        return $setupToken;
    }

    /**
     * Step 3 of the mobile flow: set the password using a verified setup token.
     *
     * @throws ValidationException
     */
    public function completeMobileSetup(string $email, string $setupToken, string $password): User
    {
        $invitation = EmployeeInvitation::query()
            ->with('user')
            ->pending()
            ->where('channel', EmployeeInvitation::CHANNEL_MOBILE)
            ->where('email', strtolower(trim($email)))
            ->whereNotNull('setup_token_hash')
            ->first();

        if (
            $invitation === null
            || $invitation->user === null
            || $invitation->setup_token_expires_at === null
            || $invitation->setup_token_expires_at->isPast()
            || ! hash_equals($invitation->setup_token_hash, hash('sha256', $setupToken))
        ) {
            throw ValidationException::withMessages([
                'setup_token' => ['Your verification has expired. Please enter your email again to get a new code.'],
            ]);
        }

        return DB::transaction(function () use ($invitation, $password) {
            $user = $this->activate($invitation->user, $password);

            $invitation->forceFill([
                'accepted_at' => now(),
                'setup_token_hash' => null,
                'setup_token_expires_at' => null,
            ])->save();

            return $user;
        });
    }

    /**
     * Revoke an outstanding invitation, making its link/code unusable.
     */
    public function revoke(EmployeeInvitation $invitation): void
    {
        $invitation->forceFill([
            'token_hash' => null,
            'expires_at' => null,
            'code_hash' => null,
            'code_expires_at' => null,
            'code_attempts' => 0,
            'setup_token_hash' => null,
            'setup_token_expires_at' => null,
        ])->save();
    }

    /**
     * Activate an invited account with its chosen password.
     *
     * Reaching this point proves control of the mailbox, so the address is
     * marked verified and the account flipped to `active` — without which
     * `LoginAction` would keep rejecting the brand-new sign-in as inactive.
     */
    protected function activate(User $user, string $password): User
    {
        $user->forceFill([
            'password' => Hash::make($password),
            'status' => 'active',
            'email_verified_at' => $user->email_verified_at ?? now(),
            'remember_token' => Str::random(60),
        ])->save();

        // Invalidate any sessions issued before the password existed.
        $user->tokens()->delete();

        return $user;
    }

    /**
     * Create the login account backing a brand-new invitation.
     */
    protected function createInvitedUser(Employee $employee, string $email, string $role): User
    {
        $user = User::create([
            'company_id' => $employee->company_id,
            'branch_id' => $employee->branch_id,
            'name' => trim("{$employee->first_name} {$employee->last_name}"),
            'email' => $email,
            // Unusable placeholder: replaced when the invitation is accepted.
            'password' => Str::random(40),
            'role' => $role,
            'status' => 'invited',
        ]);

        $user->syncRoles([$role]);

        return $user;
    }

    /**
     * Point an existing account at the (possibly new) address and role.
     *
     * An account that has already set a password keeps its `active` status —
     * re-inviting a colleague to a different role must not lock them out.
     */
    protected function refreshInvitedUser(User $user, ?string $email, string $role): User
    {
        $attributes = ['role' => $role];

        if ($email !== null && $email !== $user->email) {
            $attributes['email'] = $email;
            // The new address is unproven until the invitation is accepted.
            $attributes['email_verified_at'] = null;
        }

        if ($user->status !== 'active') {
            $attributes['status'] = 'invited';
        }

        $user->forceFill($attributes)->save();
        $user->syncRoles([$role]);

        return $user;
    }

    /**
     * Ensure an address is not already taken by another account.
     *
     * @throws ValidationException
     */
    protected function assertEmailAvailable(string $email, ?int $ignoreUserId): void
    {
        $exists = User::where('email', $email)
            ->when($ignoreUserId !== null, fn ($query) => $query->whereKeyNot($ignoreUserId))
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'email' => ['This email address is already in use by another account.'],
            ]);
        }
    }

    /**
     * Dispatch the invitation email matching the invitation's channel.
     */
    protected function sendInvitationEmail(
        User $user,
        EmployeeInvitation $invitation,
        ?string $plainToken,
        ?User $invitedBy,
    ): void {
        $companyName = $invitation->company?->name ?? $user->company?->name;
        $inviterName = $invitedBy?->name;

        if ($invitation->channel === EmployeeInvitation::CHANNEL_WEB && $plainToken !== null) {
            $user->notify(new WebInvitationNotification(
                $plainToken,
                $this->roleLabel($invitation->role),
                $companyName,
                $inviterName,
            ));

            return;
        }

        $user->notify(new MobileInvitationNotification($companyName, $inviterName));
    }

    /**
     * Human-readable label for a role key, e.g. `company_admin` → "Company Admin".
     */
    protected function roleLabel(string $role): string
    {
        return Str::of($role)->replace('_', ' ')->title()->toString();
    }
}
