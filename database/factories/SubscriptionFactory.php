<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Subscription>
 */
class SubscriptionFactory extends Factory
{
    protected $model = Subscription::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $startsAt = fake()->dateTimeBetween('-6 months', 'now');

        return [
            'company_id' => Company::factory(),
            'plan_id' => Plan::factory(),
            'status' => 'active',
            'billing_cycle' => fake()->randomElement(['monthly', 'yearly']),
            'starts_at' => $startsAt,
            'ends_at' => fake()->dateTimeBetween($startsAt, '+1 year'),
            'trial_ends_at' => null,
            'cancelled_at' => null,
        ];
    }

    /**
     * Indicate that the subscription is trialing.
     */
    public function trialing(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'trialing',
            'trial_ends_at' => now()->addDays(14),
        ]);
    }

    /**
     * Indicate that the subscription is cancelled.
     */
    public function cancelled(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'cancelled',
            'cancelled_at' => now(),
        ]);
    }

    /**
     * Indicate that the subscription is in its payment-failure grace period
     * (access retained for a bounded window).
     */
    public function gracePeriod(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'grace_period',
            'grace_ends_at' => now()->addDays(7),
            'past_due_since' => now()->subDay(),
            'suspended_at' => null,
        ]);
    }

    /**
     * Indicate that the subscription is past due (payment failed).
     */
    public function pastDue(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'past_due',
            'past_due_since' => now(),
            'grace_ends_at' => null,
            'suspended_at' => null,
        ]);
    }

    /**
     * Indicate that the subscription is expired.
     */
    public function expired(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'expired',
            'ends_at' => now()->subDay(),
        ]);
    }
}
