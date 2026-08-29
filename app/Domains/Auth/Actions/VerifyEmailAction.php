<?php

namespace App\Domains\Auth\Actions;

use App\Models\User;
use Illuminate\Auth\Events\Verified;

class VerifyEmailAction
{
    /** The link was valid and the email is now verified. */
    public const RESULT_VERIFIED = 'verified';

    /** The link was valid but the email was already verified. */
    public const RESULT_ALREADY_VERIFIED = 'already-verified';

    /** The link was invalid (unknown user or mismatched hash). */
    public const RESULT_INVALID = 'invalid';

    /**
     * Verify a user's email from a signed link's `{id}` and `{hash}` params.
     *
     * The hash is Laravel's standard sha1 of the user's email, so we can
     * validate the link without an authenticated session — the URL signature
     * (checked by the `signed` middleware) is the proof of authenticity.
     *
     * @return self::RESULT_*
     */
    public function execute(int|string $userId, string $hash): string
    {
        $user = User::find($userId);

        if (! $user || ! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return self::RESULT_INVALID;
        }

        if ($user->hasVerifiedEmail()) {
            return self::RESULT_ALREADY_VERIFIED;
        }

        $user->markEmailAsVerified();

        event(new Verified($user));

        return self::RESULT_VERIFIED;
    }
}
