<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Position;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Employee>
 */
class EmployeeFactory extends Factory
{
    protected $model = Employee::class;

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
            'department_id' => Department::factory(),
            'position_id' => Position::factory(),
            'branch_id' => Branch::factory(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'employee_number' => 'EMP-' . fake()->unique()->numberBetween(1000, 9999),
            'employment_type' => fake()->randomElement(['full_time', 'part_time', 'casual', 'contractor']),
            'dob' => fake()->dateTimeBetween('-60 years', '-18 years'),
            'gender' => fake()->randomElement(['male', 'female', 'other', 'prefer_not_to_say']),
            'address' => fake()->streetAddress() . ', ' . fake()->city() . ' ' . fake()->postcode(),
            'emergency_contact' => fake()->name(),
            'emergency_phone' => fake()->phoneNumber(),
            'hire_date' => fake()->dateTimeBetween('-2 years', 'now'),
            'termination_date' => null,
            'hourly_rate' => fake()->randomFloat(2, 25, 85),
            'photo' => null,
            'status' => 'active',
        ];
    }
}
