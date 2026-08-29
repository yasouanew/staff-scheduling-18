<?php

namespace Database\Factories;

use App\Models\Plan;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Plan>
 */
class PlanFactory extends Factory
{
    protected $model = Plan::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->words(2, true);

        return [
            'name' => ucfirst($name),
            'slug' => Str::slug($name),
            'price_monthly' => fake()->randomFloat(2, 10, 99),
            'price_yearly' => fake()->randomFloat(2, 90, 990),
            'max_employees' => fake()->optional(0.8)->numberBetween(5, 100),
            'max_branches' => fake()->optional(0.8)->numberBetween(1, 10),
            'features' => [
                'attendance_tracking' => true,
                'leave_management' => true,
                'custom_reports' => fake()->boolean(),
                'api_access' => fake()->boolean(),
            ],
            'is_active' => true,
        ];
    }
}
