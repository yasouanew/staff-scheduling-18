<?php

namespace Database\Factories;

use App\Models\Feature;
use App\Models\Plan;
use App\Models\PlanFeature;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\PlanFeature>
 */
class PlanFeatureFactory extends Factory
{
    protected $model = PlanFeature::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'plan_id' => Plan::factory(),
            'feature_id' => Feature::factory(),
            'is_enabled' => true,
            'limit_value' => null,
            'configuration' => null,
        ];
    }

    /**
     * Attach the feature with a numeric limit.
     */
    public function withLimit(int $limit): static
    {
        return $this->state(fn (array $attributes) => [
            'limit_value' => $limit,
        ]);
    }
}
