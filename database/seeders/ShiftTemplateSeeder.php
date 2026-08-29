<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Department;
use App\Models\Position;
use App\Models\ShiftTemplate;
use Illuminate\Database\Seeder;

class ShiftTemplateSeeder extends Seeder
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

        $branch = Branch::where('company_id', $company->id)->first();
        $foh = Department::where('company_id', $company->id)->where('code', 'FOH')->first();
        $boh = Department::where('company_id', $company->id)->where('code', 'BOH')->first();

        $templates = [
            [
                'name' => 'Morning Shift',
                'description' => 'Standard morning shift',
                'start_time' => '06:00:00',
                'end_time' => '14:00:00',
                'break_minutes' => 30,
                'color' => '#F59E0B',
                'is_paid_break' => false,
                'department_id' => $foh?->id,
            ],
            [
                'name' => 'Afternoon Shift',
                'description' => 'Standard afternoon shift',
                'start_time' => '14:00:00',
                'end_time' => '22:00:00',
                'break_minutes' => 30,
                'color' => '#3B82F6',
                'is_paid_break' => false,
                'department_id' => $foh?->id,
            ],
            [
                'name' => 'Full Day',
                'description' => 'Full day shift',
                'start_time' => '09:00:00',
                'end_time' => '17:00:00',
                'break_minutes' => 60,
                'color' => '#10B981',
                'is_paid_break' => false,
                'department_id' => null,
            ],
            [
                'name' => 'Kitchen Morning',
                'description' => 'Kitchen morning prep shift',
                'start_time' => '05:00:00',
                'end_time' => '13:00:00',
                'break_minutes' => 30,
                'color' => '#EF4444',
                'is_paid_break' => true,
                'department_id' => $boh?->id,
            ],
        ];

        foreach ($templates as $templateData) {
            ShiftTemplate::updateOrCreate(
                ['company_id' => $company->id, 'name' => $templateData['name']],
                array_merge($templateData, [
                    'company_id' => $company->id,
                    'branch_id' => $branch?->id,
                    'position_id' => null,
                    'status' => 'active',
                ])
            );
        }
    }
}
