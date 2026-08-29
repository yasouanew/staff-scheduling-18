<?php

namespace App\Services;

use App\Models\DeviceToken;
use App\Models\User;

class DeviceTokenService
{
    /**
     * Register (create or refresh) a device token for the given user.
     *
     * FCM tokens are globally unique per device, so if the token already
     * exists we simply re-point it at the current user and reactivate it.
     * This keeps a device from receiving notifications for a previous user.
     *
     * @param  array<string, mixed>  $data
     */
    public function register(User $user, array $data): DeviceToken
    {
        return DeviceToken::updateOrCreate(
            ['token' => $data['token']],
            [
                'company_id' => $user->company_id,
                'user_id' => $user->id,
                'platform' => $data['platform'],
                'device_name' => $data['device_name'] ?? null,
                'app_version' => $data['app_version'] ?? null,
                'os_version' => $data['os_version'] ?? null,
                'is_active' => true,
                'last_used_at' => now(),
            ]
        );
    }

    /**
     * Remove a device token belonging to the user (e.g. on logout).
     */
    public function unregister(User $user, string $token): bool
    {
        return (bool) $user->deviceTokens()
            ->where('token', $token)
            ->delete();
    }
}
