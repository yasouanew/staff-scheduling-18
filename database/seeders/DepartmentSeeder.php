<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Department;
use Illuminate\Database\Seeder;

class DepartmentSeeder extends Seeder
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

        $departments = [
            ['name' => 'Front of House', 'code' => 'FOH', 'description' => 'Customer-facing operations', 'color' => '#3B82F6'],
            ['name' => 'Back of House', 'code' => 'BOH', 'description' => 'Kitchen and preparation', 'color' => '#EF4444'],
            ['name' => 'Management', 'code' => 'MGT', 'description' => 'Management and administration', 'color' => '#8B5CF6'],
            ['name' => 'Operations', 'code' => 'OPS', 'description' => 'General operations', 'color' => '#10B981'],
        ];

        foreach ($departments as $deptData) {
            Department::updateOrCreate(
                ['company_id' => $company->id, 'code' => $deptData['code']],
                array_merge($deptData, [
                    'company_id' => $company->id,
                    'status' => 'active',
                ])
            );
        }
    }
}
