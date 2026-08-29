<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\LeaveType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\LeaveType>
 */
class LeaveTypeFactory extends Factory
{
    protected $model = LeaveType::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->randomElement(['Annual Leave', 'Sick Leave', 'Maternity Leave', 'Paternity Leave', 'Unpaid Leave', 'Compassionate Leave']);

        return [
            'company_id' => Company::factory(),
            'name' => $name,
            'code' => strtoupper(substr(str_replace(' ', '', $name), 0, 3)),
            'description' => fake()->sentence(),
            'is_paid' => true,
            'requires_approval' => true,
            'allow_half_day' => true,
            'max_days_per_request' => 14,
            'color' => fake()->hexColor(),
            'status' => 'active',
            'created_by' => null,
            'updated_by' => null,
        ];
    }
}
