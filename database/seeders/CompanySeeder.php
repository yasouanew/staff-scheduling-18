<?php

namespace Database\Seeders;

use App\Models\Company;
use Illuminate\Database\Seeder;

class CompanySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $company = Company::updateOrCreate(
            ['email' => 'admin@demo-corp.com'],
            [
                'name' => 'Demo Corporation',
                'abn' => '51 824 753 556',
                'phone' => '+61 2 9000 0000',
                'logo' => null,
                'timezone' => 'Australia/Sydney',
                'country' => 'Australia',
                'state' => 'NSW',
                'business_type' => 'hospitality',
                'status' => 'active',
                'subscription_id' => null,
                // Keep the demo company inside an active trial window so the
                // CheckCompanyAccess middleware does not immediately lock it.
                'trial_ends_at' => now()->addDays(14),
                'locked_at' => null,
            ]
        );


        $company->settings()->updateOrCreate(
            ['company_id' => $company->id],
            [
                'timezone' => 'Australia/Sydney',
                'date_format' => 'Y-m-d',
                'time_format' => '24h',
                'week_start_day' => 'Monday',
                'default_shift_duration' => 480,
                'default_break_minutes' => 30,
                'currency' => 'AUD',
                'language' => 'en',
                'allow_shift_swap' => true,
                'allow_employee_availability' => true,
                'allow_leave_requests' => true,
                'allow_push_notifications' => true,
                'primary_color' => '#4F46E5',
                'secondary_color' => '#06B6D4',
            ]
        );
    }
}
