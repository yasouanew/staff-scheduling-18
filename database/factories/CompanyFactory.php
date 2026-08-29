<?php

namespace Database\Factories;

use App\Models\Company;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Company>
 */
class CompanyFactory extends Factory
{
    protected $model = Company::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->company(),
            'abn' => fake()->numerify('## ### ### ###'),
            'email' => fake()->companyEmail(),
            'phone' => fake()->phoneNumber(),
            'logo' => null,
            'timezone' => 'Australia/Sydney',
            'country' => 'Australia',
            'state' => fake()->randomElement(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS']),
            'business_type' => fake()->randomElement(['hospitality', 'retail', 'healthcare', 'construction', 'education', 'technology']),
            'status' => 'active',
            'subscription_id' => null,
            // Newly registered companies always start on a trial (see
            // RegisterAction), so mirror that here. Without it every factory
            // company would be treated as expired and locked out by the
            // CheckCompanyAccess middleware.
            'trial_ends_at' => now()->addDays(14),
            'locked_at' => null,
        ];
    }

    /**
     * A company whose trial has lapsed without a paid subscription.
     */
    public function trialExpired(): static
    {
        return $this->state(fn (array $attributes): array => [
            'trial_ends_at' => now()->subDay(),
        ]);
    }

    /**
     * A company that has already been locked out for non-payment.
     */
    public function locked(): static
    {
        return $this->state(fn (array $attributes): array => [
            'trial_ends_at' => now()->subDay(),
            'locked_at' => now(),
        ]);
    }
}

