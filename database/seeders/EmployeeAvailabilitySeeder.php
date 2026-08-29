<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\EmployeeAvailability;
use Illuminate\Database\Seeder;

class EmployeeAvailabilitySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $employees = Employee::where('status', 'active')->get();

        foreach ($employees as $employee) {
            // Create availability for each day of the week (0=Sun to 6=Sat)
            for ($day = 0; $day <= 6; $day++) {
                EmployeeAvailability::updateOrCreate(
                    ['employee_id' => $employee->id, 'day_of_week' => $day],
                    [
                        'start_time' => '08:00:00',
                        'end_time' => '22:00:00',
                        'is_available' => ! in_array($day, [0, 6]) || fake()->boolean(50),
                    ]
                );
            }
        }
    }
}
