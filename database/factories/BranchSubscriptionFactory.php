<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\BranchSubscription;
use App\Models\Company;
use App\Models\Subscription;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\BranchSubscription>
 */
class BranchSubscriptionFactory extends Factory
{
    protected $model = BranchSubscription::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        return [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'subscription_id' => $subscription->id,
            'status' => 'active',
            'employee_capacity' => fake()->randomElement([10, 25, 50, 100]),
            'started_at' => now(),
            'ended_at' => null,
            'cancelled_at' => null,
            'metadata' => null,
        ];
    }

    /**
     * Indicate that the branch subscription is on trial.
     */
    public function trialing(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'trialing',
            'employee_capacity' => null,
        ]);
    }

    /**
     * Indicate that the branch subscription has ended.
     */
    public function ended(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'expired',
            'ended_at' => now()->subDay(),
        ]);
    }
}
