<?php

namespace App\Domains\Auth\Actions;

use App\Models\Company;
use App\Models\PlatformSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class RegisterAction
{
    /**
     * Register a new company (tenant) and its first company_admin user.
     *
     * A self-service sign-up creates the whole tenant scaffold in one atomic
     * transaction: the company, its default settings, the owning admin user
     * (with the `company_admin` role), and a fresh Sanctum token so the client
     * can be logged straight in after registering.
     *
     * @param  array<string, mixed>  $data
     * @return array{user: User, token: string}
     */
    public function execute(array $data, string $deviceName): array
    {
        return DB::transaction(function () use ($data, $deviceName): array {
            $trialDays = PlatformSetting::current()->trial_period_days;

            $company = Company::create([
                'name' => $data['company_name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'abn' => $data['abn'] ?? null,
                'business_type' => $data['business_type'] ?? null,
                'country' => $data['country'] ?? 'Australia',
                'state' => $data['state'] ?? null,
                'timezone' => $data['timezone'] ?? 'Australia/Sydney',
                'status' => 'active',
                'trial_ends_at' => now()->addDays($trialDays),
                'locked_at' => null,
            ]);

            // Seed sensible Australian defaults for the new tenant.
            $company->settings()->create([
                'timezone' => $data['timezone'] ?? 'Australia/Sydney',
                'currency' => 'AUD',
            ]);

            /** @var User $user */
            $user = $company->users()->create([
                'name' => $data['name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'password' => Hash::make($data['password']),
                'role' => 'company_admin',
                'status' => 'active',
            ]);

            // Grant the tenant owner the full company_admin permission set.
            $user->syncRoles('company_admin');

            $token = $user->createToken($deviceName)->plainTextToken;

            $user->forceFill(['last_login_at' => now()])->save();

            return [
                'user' => $user,
                'token' => $token,
            ];
        });
    }
}
