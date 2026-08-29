<?php

namespace Database\Seeders;

use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use Illuminate\Database\Seeder;

class SubscriptionPaymentSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $subscription = Subscription::first();

        if (! $subscription) {
            return;
        }

        // Create 3 past monthly payments
        for ($i = 2; $i >= 0; $i--) {
            SubscriptionPayment::create([
                'subscription_id' => $subscription->id,
                'amount' => $subscription->plan->price_monthly,
                'currency' => 'AUD',
                'payment_provider' => 'stripe',
                'provider_reference' => 'pay_' . fake()->regexify('[A-Za-z0-9]{24}'),
                'status' => 'succeeded',
                'paid_at' => now()->subMonths($i),
            ]);
        }
    }
}
