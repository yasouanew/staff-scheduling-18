<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Department;
use App\Models\Position;
use Illuminate\Database\Seeder;

class PositionSeeder extends Seeder
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

        $foh = Department::where('company_id', $company->id)->where('code', 'FOH')->first();
        $boh = Department::where('company_id', $company->id)->where('code', 'BOH')->first();
        $mgt = Department::where('company_id', $company->id)->where('code', 'MGT')->first();
        $ops = Department::where('company_id', $company->id)->where('code', 'OPS')->first();

        $positions = [
            ['department_id' => $foh?->id, 'name' => 'Barista', 'code' => 'BAR', 'default_hourly_rate' => 30.00, 'color' => '#3B82F6'],
            ['department_id' => $foh?->id, 'name' => 'Waiter', 'code' => 'WAI', 'default_hourly_rate' => 28.00, 'color' => '#60A5FA'],
            ['department_id' => $boh?->id, 'name' => 'Chef', 'code' => 'CHF', 'default_hourly_rate' => 40.00, 'color' => '#EF4444'],
            ['department_id' => $boh?->id, 'name' => 'Kitchen Hand', 'code' => 'KIT', 'default_hourly_rate' => 26.00, 'color' => '#F87171'],
            ['department_id' => $mgt?->id, 'name' => 'Store Manager', 'code' => 'MGR', 'default_hourly_rate' => 50.00, 'color' => '#8B5CF6'],
            ['department_id' => $ops?->id, 'name' => 'Cleaner', 'code' => 'CLN', 'default_hourly_rate' => 25.00, 'color' => '#10B981'],
        ];

        foreach ($positions as $posData) {
            Position::updateOrCreate(
                ['company_id' => $company->id, 'code' => $posData['code']],
                array_merge($posData, [
                    'company_id' => $company->id,
                    'status' => 'active',
                ])
            );
        }
    }
}
