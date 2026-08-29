<?php

namespace App\Domains\Auth\Actions;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

class LogoutAction
{
    /**
     * Revoke the current access token (and optionally deactivate its device token).
     *
     * @param  array<string, mixed>  $data
     */
    public function execute(User $user, array $data = []): void
    {
        /** @var PersonalAccessToken|null $currentToken */
        $currentToken = $user->currentAccessToken();

        if ($currentToken) {
            $currentToken->delete();
        }

        // Deactivate the device token used on this device, if provided.
        if (! empty($data['fcm_token'])) {
            $user->deviceTokens()
                ->where('token', $data['fcm_token'])
                ->update(['is_active' => false]);
        }
    }

    /**
     * Revoke all of the user's access tokens across every device.
     */
    public function executeAll(User $user): void
    {
        $user->tokens()->delete();
        $user->deviceTokens()->update(['is_active' => false]);
    }
}
