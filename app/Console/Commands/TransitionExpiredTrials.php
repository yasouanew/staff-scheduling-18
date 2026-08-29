<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\User;
use App\Notifications\TrialExpiredNotification;
use Illuminate\Console\Command;

/**
 * Scheduled TRIAL -> ACTIVE / TRIAL -> EXPIRED transition for plan-level
 * trials (subscriptions created with a `trial_days` value).
 *
 * When a trialing subscription's `trial_ends_at` passes:
 *  - if billing is attached (Stripe subscription exists) the trial simply
 *    rolls into an active period — the first provider payment continues to be
 *    reconciled by the webhook, but access is immediately restored locally;
 *  - otherwise the trial has expired: the subscription is marked `expired`,
 *    the company is locked, and company admins are notified. No business data
 *    is ever deleted.
 *
 * This complements (but does not replace) `billing:lock-expired-trials`, which
 * handles the company-level registration trial.
 */
class TransitionExpiredTrials extends Command
{
    protected $signature = 'billing:transition-expired-trials';

    protected $description = 'Transition subscriptions whose trial has ended: to active when billing is attached, otherwise to expired (locking the company).';

    public function handle(): int
    {
        $now = now();

        $subscriptions = Subscription::query()
            ->where('status', 'trialing')
            ->whereNotNull('trial_ends_at')
            ->where('trial_ends_at', '<=', $now)
            ->with('company')
            ->get();

        $activated = 0;
        $expired = 0;

        foreach ($subscriptions as $subscription) {
            if ($subscription->stripe_id) {
                // Billing is attached — the trial rolls into an active period.
                $subscription->forceFill([
                    'status' => 'active',
                    'activation_notified_at' => $subscription->activation_notified_at ?? $now,
                ])->save();

                $activated++;
                continue;
            }

            // No payment method attached — the trial has expired.
            $subscription->forceFill([
                'status' => 'expired',
                'ends_at' => $subscription->ends_at ?? $now,
                'suspended_at' => $subscription->suspended_at ?? $now,
            ])->save();

            $company = $subscription->company;

            if ($company) {
                $company->forceFill(['locked_at' => $company->locked_at ?? $now])->save();

                $notification = new TrialExpiredNotification($company);
                $company->users()
                    ->where('role', 'company_admin')
                    ->each(function (User $user) use ($notification): void {
                        $user->notify($notification);
                    });
            }

            $expired++;
        }

        $this->info("Transitioned {$activated} trial subscription(s) to active and {$expired} to expired.");

        return self::SUCCESS;
    }
}
