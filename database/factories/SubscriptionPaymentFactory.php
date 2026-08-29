<?php

namespace Database\Factories;

use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\SubscriptionPayment>
 */
class SubscriptionPaymentFactory extends Factory
{
    protected $model = SubscriptionPayment::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'subscription_id' => Subscription::factory(),
            'amount' => fake()->randomFloat(2, 9.99, 299.99),
            'currency' => 'AUD',
            'payment_provider' => fake()->randomElement(['stripe', 'paypal']),
            'provider_reference' => 'pay_' . fake()->unique()->regexify('[A-Za-z0-9]{24}'),
            'status' => 'succeeded',
            'paid_at' => fake()->dateTimeBetween('-6 months', 'now'),
        ];
    }

    /**
     * Indicate that the payment is pending.
     */
    public function pending(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'pending',
            'paid_at' => null,
        ]);
    }

    /**
     * Indicate that the payment has failed.
     */
    public function failed(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'failed',
            'paid_at' => null,
        ]);
    }

    /**
     * Indicate that the payment has been refunded.
     */
    public function refunded(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'refunded',
        ]);
    }
}
