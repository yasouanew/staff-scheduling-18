<?php

namespace Database\Seeders;

use App\Models\Plan;
use Illuminate\Database\Seeder;

class PlanSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $plans = [
            [
                'name' => 'Free',
                'slug' => 'free',
                'price_monthly' => 0.00,
                'price_yearly' => 0.00,
                'max_employees' => 5,
                'max_branches' => 1,
                // `features` is a list of display strings: both StorePlanRequest
                // and UpdatePlanRequest validate `features.*` as a string, and the
                // UI renders each entry directly.
                'features' => [
                    'Attendance tracking',
                    'Leave management',
                ],

                'is_active' => true,
            ],
            [
                'name' => 'Starter',
                'slug' => 'starter',
                'price_monthly' => 29.00,
                'price_yearly' => 290.00,
                'max_employees' => 25,
                'max_branches' => 3,
                'features' => [
                    'Attendance tracking',
                    'Leave management',
                    'Payroll export',
                ],

                'is_active' => true,
            ],
            [
                'name' => 'Professional',
                'slug' => 'professional',
                'price_monthly' => 79.00,
                'price_yearly' => 790.00,
                'max_employees' => 100,
                'max_branches' => 10,
                'features' => [
                    'Attendance tracking',
                    'Leave management',
                    'Payroll export',
                    'Custom reports',
                    'Priority support',
                ],

                'is_active' => true,
            ],
            [
                'name' => 'Enterprise',
                'slug' => 'enterprise',
                'price_monthly' => 199.00,
                'price_yearly' => 1990.00,
                'max_employees' => null, // Unlimited
                'max_branches' => null,  // Unlimited
                'features' => [
                    'Attendance tracking',
                    'Leave management',
                    'Payroll export',
                    'Custom reports',
                    'Priority support',
                    'Dedicated account manager',
                    'Custom integrations',
                ],

                'is_active' => true,
            ],
        ];

        foreach ($plans as $planData) {
            Plan::updateOrCreate(
                ['slug' => $planData['slug']],
                $planData
            );
        }
    }
}
