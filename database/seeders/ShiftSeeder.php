<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Employee;
use App\Models\Roster;
use App\Models\Shift;
use Illuminate\Database\Seeder;
use Carbon\Carbon;

class ShiftSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $company = Company::first();

        if (! $company) {
            return;
        }

        $rosters = Roster::where('company_id', $company->id)->get();

        foreach ($rosters as $roster) {
            $employees = Employee::where('company_id', $company->id)
                ->where('branch_id', $roster->branch_id)
                ->where('status', 'active')
                ->get();

            if ($employees->isEmpty()) {
                $employees = Employee::where('company_id', $company->id)
                    ->where('status', 'active')
                    ->take(5)
                    ->get();
            }

            $weekStart = Carbon::parse($roster->week_start);

            // Create shifts for 5 weekdays
            for ($dayOffset = 0; $dayOffset < 5; $dayOffset++) {
                $date = $weekStart->copy()->addDays($dayOffset);

                foreach ($employees->take(3) as $employee) {
                    $shiftType = fake()->randomElement(['morning', 'afternoon', 'full']);

                    [$startTime, $endTime] = match ($shiftType) {
                        'morning' => ['06:00:00', '14:00:00'],
                        'afternoon' => ['14:00:00', '22:00:00'],
                        'full' => ['09:00:00', '17:00:00'],
                    };

                    Shift::create([
                        'company_id' => $company->id,
                        'branch_id' => $roster->branch_id,
                        'roster_id' => $roster->id,
                        'employee_id' => $employee->id,
                        'position_id' => $employee->position_id,
                        'department_id' => $employee->department_id,
                        'date' => $date->toDateString(),
                        'start_time' => $startTime,
                        'end_time' => $endTime,
                        'break_minutes' => 30,
                        'paid_break' => false,
                        'status' => $roster->status === 'published' ? 'scheduled' : 'scheduled',
                        'notes' => fake()->optional(0.2)->sentence(),
                    ]);
                }
            }
        }
    }
}
