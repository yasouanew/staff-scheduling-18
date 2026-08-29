<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Department;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Department>
 */
class DepartmentFactory extends Factory
{
    protected $model = Department::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->jobTitle();

        return [
            'company_id' => Company::factory(),
            'name' => $name,
            'code' => strtoupper(substr($name, 0, 3)),
            'description' => fake()->sentence(),
            'color' => fake()->hexColor(),
            'status' => 'active',
            'created_by' => null,
            'updated_by' => null,
        ];
    }
}
