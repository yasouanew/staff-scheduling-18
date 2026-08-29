<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\LeaveType;
use Illuminate\Database\Seeder;

class LeaveTypeSeeder extends Seeder
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

        $leaveTypes = [
            [
                'name' => 'Annual Leave',
                'code' => 'AL',
                'description' => 'Paid annual leave entitlement',
                'is_paid' => true,
                'requires_approval' => true,
                'allow_half_day' => true,
                'max_days_per_request' => 20,
                'color' => '#3B82F6',
            ],
            [
                'name' => 'Sick Leave',
                'code' => 'SL',
                'description' => 'Personal/carer\'s leave',
                'is_paid' => true,
                'requires_approval' => true,
                'allow_half_day' => true,
                'max_days_per_request' => 10,
                'color' => '#EF4444',
            ],
            [
                'name' => 'Unpaid Leave',
                'code' => 'UL',
                'description' => 'Leave without pay',
                'is_paid' => false,
                'requires_approval' => true,
                'allow_half_day' => false,
                'max_days_per_request' => 30,
                'color' => '#6B7280',
            ],
            [
                'name' => 'Compassionate Leave',
                'code' => 'CL',
                'description' => 'Bereavement / compassionate leave',
                'is_paid' => true,
                'requires_approval' => true,
                'allow_half_day' => false,
                'max_days_per_request' => 3,
                'color' => '#8B5CF6',
            ],
            [
                'name' => 'Long Service Leave',
                'code' => 'LSL',
                'description' => 'Long service leave entitlement',
                'is_paid' => true,
                'requires_approval' => true,
                'allow_half_day' => false,
                'max_days_per_request' => 60,
                'color' => '#10B981',
            ],
        ];

        foreach ($leaveTypes as $typeData) {
            LeaveType::updateOrCreate(
                ['company_id' => $company->id, 'code' => $typeData['code']],
                array_merge($typeData, [
                    'company_id' => $company->id,
                    'status' => 'active',
                ])
            );
        }
    }
}
