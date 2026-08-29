<?php

namespace Database\Factories;

use App\Models\Employee;
use App\Models\EmployeeAvailability;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\EmployeeAvailability>
 */
class EmployeeAvailabilityFactory extends Factory
{
    protected $model = EmployeeAvailability::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        // Randomised start time keeps the (employee_id, day_of_week, start_time)
        // unique constraint from colliding when multiple slots are generated.
        $startHour = fake()->numberBetween(6, 12);

        return [
            'employee_id' => Employee::factory(),
            'day_of_week' => fake()->numberBetween(1, 5), // Monday to Friday
            'start_time' => sprintf('%02d:00:00', $startHour),
            'end_time' => sprintf('%02d:00:00', $startHour + 6),
            'is_available' => true,
        ];

    }
}
