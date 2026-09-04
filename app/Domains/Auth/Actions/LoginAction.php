<?php

namespace App\Domains\Auth\Actions;

use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Support\Facades\Hash;

class LoginAction
{
    /**
     * Attempt to authenticate a user and issue a Sanctum token.
     *
     * @param  array<string, mixed>  $data
     * @return array{user: User, token: string}
     *
     * @throws AuthenticationException
     */
    public function execute(array $data, string $deviceName): array
    {
        /** @var User|null $user */
        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw new AuthenticationException('The provided credentials are incorrect.');
        }

        if ($user->status !== 'active') {
            throw new AuthenticationException('Your account is inactive. Please contact your administrator.');
        }

        // Issue a fresh personal access token for this device.
        // The explicit expires_at is computed on the server (never trusted from
        // the client) so a device with a manipulated clock cannot keep the
        // session alive past its server-authoritative lifetime.
        $token = $user->createToken(
            $deviceName,
            ['*'],
            now()->addMinutes((int) config('sanctum.expiration', 1440))
        )->plainTextToken;

        // Track last login timestamp.
        $user->forceFill(['last_login_at' => now()])->save();

        // Register/refresh device token for push notifications when provided.
        $this->syncDeviceToken($user, $data);

        return [
            'user' => $user,
            'token' => $token,
        ];
    }

    /**
     * Store or update the device token used for push notifications.
     *
     * @param  array<string, mixed>  $data
     */
    protected function syncDeviceToken(User $user, array $data): void
    {
        if (empty($data['fcm_token'])) {
            return;
        }

        $user->deviceTokens()->updateOrCreate(
            ['token' => $data['fcm_token']],
            [
                'company_id' => $user->company_id,
                'device_name' => $data['device_name'] ?? null,
                'platform' => $data['platform'] ?? 'web',
                'app_version' => $data['app_version'] ?? null,
                'os_version' => $data['os_version'] ?? null,
                'is_active' => true,
                'last_used_at' => now(),
            ]
        );
    }
}
