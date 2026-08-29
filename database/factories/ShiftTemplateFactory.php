<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Department;
use App\Models\Position;
use App\Models\ShiftTemplate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\ShiftTemplate>
 */
class ShiftTemplateFactory extends Factory
{
    protected $model = ShiftTemplate::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'branch_id' => Branch::factory(),
            'department_id' => Department::factory(),
            'position_id' => Position::factory(),
            'name' => fake()->word() . ' Shift',
            'description' => fake()->sentence(),
            'start_time' => '09:00:00',
            'end_time' => '17:00:00',
            'break_minutes' => 30,
            'color' => fake()->hexColor(),
            'is_paid_break' => false,
            'status' => 'active',
            'created_by' => null,
        ];
    }
}
