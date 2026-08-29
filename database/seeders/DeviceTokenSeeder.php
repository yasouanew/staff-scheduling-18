<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\DeviceToken;
use App\Models\User;
use Illuminate\Database\Seeder;

class DeviceTokenSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $company = Company::first();

        if (! $company) {
            return;
        }

        $users = User::where('company_id', $company->id)->take(5)->get();

        foreach ($users as $user) {
            DeviceToken::create([
                'company_id' => $company->id,
                'user_id' => $user->id,
                'device_name' => fake()->randomElement(['iPhone 15 Pro', 'Samsung Galaxy S24', 'Google Pixel 8']),
                'platform' => fake()->randomElement(['ios', 'android']),
                'token' => fake()->sha256(),
                'app_version' => '1.0.0',
                'os_version' => fake()->numerify('##.#'),
                'is_active' => true,
                'last_used_at' => now()->subHours(fake()->numberBetween(1, 48)),
            ]);
        }
    }
}
