<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Position;
use App\Models\Roster;
use App\Models\Shift;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Shift>
 */
class ShiftFactory extends Factory
{
    protected $model = Shift::class;

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
            'roster_id' => Roster::factory(),
            'employee_id' => Employee::factory(),
            'position_id' => Position::factory(),
            'department_id' => Department::factory(),
            'date' => fake()->dateTimeBetween('now', '+1 week')->format('Y-m-d'),
            'start_time' => '09:00:00',
            'end_time' => '17:00:00',
            'break_minutes' => 30,
            'paid_break' => false,
            'status' => 'scheduled',
            'notes' => fake()->optional()->sentence(),
        ];
    }
}
