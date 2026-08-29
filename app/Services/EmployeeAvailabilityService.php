<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\EmployeeAvailability;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class EmployeeAvailabilityService
{
    /**
     * Get an employee's weekly availability, ordered by day and start time.
     */
    public function forEmployee(Employee $employee): Collection
    {
        return $employee->availabilities()
            ->orderBy('day_of_week')
            ->orderBy('start_time')
            ->get();
    }

    /**
     * Create a single availability slot for an employee.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(Employee $employee, array $data): EmployeeAvailability
    {
        return DB::transaction(function () use ($employee, $data) {
            return $employee->availabilities()->create([
                'day_of_week' => $data['day_of_week'],
                'start_time' => $data['start_time'] ?? null,
                'end_time' => $data['end_time'] ?? null,
                'is_available' => $data['is_available'] ?? true,
            ]);
        });
    }

    /**
     * Update an existing availability slot.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(EmployeeAvailability $availability, array $data): EmployeeAvailability
    {
        return DB::transaction(function () use ($availability, $data) {
            $availability->update($data);

            return $availability->refresh();
        });
    }

    /**
     * Delete an availability slot.
     */
    public function delete(EmployeeAvailability $availability): bool
    {
        return (bool) $availability->delete();
    }

    /**
     * Replace an employee's entire weekly availability with the given slots.
     *
     * @param  array<int, array<string, mixed>>  $slots
     */
    public function syncWeekly(Employee $employee, array $slots): Collection
    {
        return DB::transaction(function () use ($employee, $slots) {
            $employee->availabilities()->delete();

            foreach ($slots as $slot) {
                $employee->availabilities()->create([
                    'day_of_week' => $slot['day_of_week'],
                    'start_time' => $slot['start_time'] ?? null,
                    'end_time' => $slot['end_time'] ?? null,
                    'is_available' => $slot['is_available'] ?? true,
                ]);
            }

            return $this->forEmployee($employee);
        });
    }
}
