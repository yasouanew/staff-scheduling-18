<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\DeviceToken;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\DeviceToken>
 */
class DeviceTokenFactory extends Factory
{
    protected $model = DeviceToken::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'user_id' => User::factory(),
            'device_name' => fake()->randomElement(['iPhone 15 Pro', 'Samsung Galaxy S24', 'Google Pixel 8', 'iPad Air', 'OnePlus 12']),
            'platform' => fake()->randomElement(['ios', 'android', 'web']),
            'token' => fake()->sha256(),
            'app_version' => fake()->semver(),
            'os_version' => fake()->numerify('##.#.#'),
            'is_active' => true,
            'last_used_at' => fake()->dateTimeBetween('-30 days', 'now'),
        ];
    }

    /**
     * Indicate that the device token is inactive.
     */
    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_active' => false,
        ]);
    }
}
