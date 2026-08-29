<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use Illuminate\Database\Seeder;

class SubscriptionSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $company = Company::first();
        $plan = Plan::where('slug', 'professional')->first();

        if (! $company || ! $plan) {
            return;
        }

        $subscription = Subscription::updateOrCreate(
            ['company_id' => $company->id],
            [
                'plan_id' => $plan->id,
                'status' => 'active',
                'billing_cycle' => 'monthly',
                'starts_at' => now()->subMonths(3),
                'ends_at' => now()->addMonths(9),
                'trial_ends_at' => null,
                'cancelled_at' => null,
            ]
        );

        // Update company's subscription_id
        $company->update(['subscription_id' => $subscription->id]);
    }
}
