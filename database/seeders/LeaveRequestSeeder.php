<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use Illuminate\Database\Seeder;

class LeaveRequestSeeder extends Seeder
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

        $employees = Employee::where('company_id', $company->id)
            ->where('status', 'active')
            ->get();
        $leaveTypes = LeaveType::where('company_id', $company->id)->get();
        $admin = User::where('company_id', $company->id)
            ->where('role', 'company_admin')
            ->first();

        foreach ($employees->take(5) as $employee) {
            $leaveType = $leaveTypes->random();
            $startDate = fake()->dateTimeBetween('now', '+2 months');
            $totalDays = fake()->numberBetween(1, 5);

            // Approved leave
            LeaveRequest::create([
                'company_id' => $company->id,
                'employee_id' => $employee->id,
                'leave_type_id' => $leaveType->id,
                'start_date' => $startDate,
                'end_date' => (clone $startDate)->modify("+{$totalDays} days"),
                'start_session' => 'full_day',
                'end_session' => 'full_day',
                'total_days' => $totalDays,
                'reason' => fake()->sentence(),
                'attachment' => null,
                'status' => 'approved',
                'approved_by' => $admin?->id,
                'approved_at' => now()->subDays(fake()->numberBetween(1, 7)),
            ]);

            // Pending leave
            $leaveType2 = $leaveTypes->random();
            $startDate2 = fake()->dateTimeBetween('+1 month', '+3 months');
            $totalDays2 = fake()->numberBetween(1, 3);

            LeaveRequest::create([
                'company_id' => $company->id,
                'employee_id' => $employee->id,
                'leave_type_id' => $leaveType2->id,
                'start_date' => $startDate2,
                'end_date' => (clone $startDate2)->modify("+{$totalDays2} days"),
                'start_session' => 'full_day',
                'end_session' => 'full_day',
                'total_days' => $totalDays2,
                'reason' => fake()->sentence(),
                'attachment' => null,
                'status' => 'pending',
            ]);
        }
    }
}
