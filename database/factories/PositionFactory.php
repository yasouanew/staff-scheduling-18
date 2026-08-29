<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Department;
use App\Models\Position;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Position>
 */
class PositionFactory extends Factory
{
    protected $model = Position::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $title = fake()->unique()->jobTitle();

        return [
            'company_id' => Company::factory(),
            'department_id' => Department::factory(),
            'name' => $title,
            'code' => strtoupper(substr($title, 0, 3)),
            'description' => fake()->sentence(),
            'default_hourly_rate' => fake()->randomFloat(2, 25, 120),
            'color' => fake()->hexColor(),
            'status' => 'active',
            'created_by' => null,
            'updated_by' => null,
        ];
    }
}
