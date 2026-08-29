<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Services\BillingLifecycleService;
use Illuminate\Console\Command;

/**
 * Enforce the payment-failure lifecycle.
 *
 * Provider webhooks flag a failed payment immediately (status -> past_due).
 * This scheduled job advances subscriptions through the remaining states using
 * the business-configurable rules in config/billing.php:
 *
 *   PAST DUE -> GRACE PERIOD -> SUSPENDED
 *
 * It never deletes business data; it only transitions the local state and
 * locks the company when a subscription is ultimately suspended.
 */
class EnforcePaymentLifecycle extends Command
{
    protected $signature = 'billing:enforce-payment-lifecycle';

    protected $description = 'Advance past-due subscriptions through the grace period to suspension.';

    public function handle(BillingLifecycleService $lifecycle): int
    {
        $candidates = Subscription::query()
            ->whereIn('status', ['past_due', 'grace_period'])
            ->get();

        $moved = 0;
        $suspended = 0;

        foreach ($candidates as $subscription) {
            // A past-due subscription whose suspend window has elapsed goes
            // straight to suspension (it is already too far gone for grace).
            if ($subscription->status === 'past_due' && $lifecycle->shouldSuspend($subscription)) {
                $lifecycle->suspend($subscription);
                $suspended++;

                continue;
            }

            if ($subscription->status === 'past_due' && $lifecycle->shouldMoveToGracePeriod($subscription)) {
                $lifecycle->moveToGracePeriod($subscription);
                $moved++;
            }

            if ($lifecycle->shouldSuspend($subscription)) {
                $lifecycle->suspend($subscription);
                $suspended++;
            }
        }

        $this->info("Moved {$moved} subscription(s) into grace period; suspended {$suspended} subscription(s).");

        return self::SUCCESS;
    }
}
