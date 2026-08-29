<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Position;
use App\Models\User;
use Illuminate\Database\Seeder;

class EmployeeSeeder extends Seeder
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

        $users = User::where('company_id', $company->id)
            ->where('role', 'employee')
            ->get();

        $branches = Branch::where('company_id', $company->id)->get();
        $departments = Department::where('company_id', $company->id)->get();
        $positions = Position::where('company_id', $company->id)->get();

        foreach ($users as $user) {
            $branch = $branches->random();
            $department = $departments->random();
            $position = $positions->where('department_id', $department->id)->first()
                ?? $positions->random();

            Employee::updateOrCreate(
                ['company_id' => $company->id, 'user_id' => $user->id],
                [
                    'company_id' => $company->id,
                    'user_id' => $user->id,
                    'department_id' => $department->id,
                    'position_id' => $position->id,
                    'branch_id' => $branch->id,
                    'first_name' => fake()->firstName(),
                    'last_name' => fake()->lastName(),
                    'employee_number' => 'EMP-' . fake()->unique()->numberBetween(1000, 9999),
                    'employment_type' => fake()->randomElement(['full_time', 'part_time', 'casual']),
                    'dob' => fake()->dateTimeBetween('-55 years', '-18 years'),
                    'gender' => fake()->randomElement(['male', 'female', 'other']),
                    'address' => fake()->streetAddress() . ', ' . fake()->city() . ' ' . fake()->postcode(),
                    'emergency_contact' => fake()->name(),
                    'emergency_phone' => fake()->phoneNumber(),
                    'hire_date' => fake()->dateTimeBetween('-2 years', 'now'),
                    'termination_date' => null,
                    'hourly_rate' => fake()->randomFloat(2, 25, 55),
                    'photo' => null,
                    'status' => 'active',
                ]
            );
        }
    }
}
