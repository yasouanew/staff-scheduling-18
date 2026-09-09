<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\User;
use App\Notifications\TrialExpiredNotification;
use Illuminate\Console\Command;

/**
 * Scheduled ACTIVE -> EXPIRED transition for paid subscriptions.
 *
 * Stripe webhooks keep the local state in sync while a subscription is live,
 * but nothing reconciles the local row when a period lapses without a renewal
 * (e.g. the customer cancelled in the portal, the webhook was missed, or the
 * provider subscription ended). This command is the safety net:
 *
 *  - every `active` / `past_due` / `grace_period` subscription whose
 *    `ends_at` has passed is marked `expired`;
 *  - the company is locked (access revoked — no business data is deleted);
 *  - company admins are notified so they can renew from `/subscription`.
 *
 * Provider-backed subscriptions (a `stripe_id` is present) are reconciled
 * against Stripe first: if the provider still reports the subscription as
 * active/trialing/past_due, the local `ends_at` is refreshed from the
 * provider's current period instead of expiring the row.
 */
class ExpireSubscriptions extends Command
{
    protected $signature = 'billing:expire-subscriptions';

    protected $description = 'Expire paid subscriptions whose billing period has ended, lock the company and notify admins.';

    public function handle(): int
    {
        $now = now();

        $subscriptions = Subscription::query()
            ->whereIn('status', ['active', 'past_due', 'grace_period'])
            ->whereNotNull('ends_at')
            ->where('ends_at', '<', $now)
            ->with(['company', 'company.users'])
            ->get();

        $expired = 0;
        $reconciled = 0;
        $errored = 0;

        foreach ($subscriptions as $subscription) {
            // Provider-backed rows are reconciled against Stripe before expiring:
            // if the provider still has a live subscription the local period was
            // simply never refreshed (missed webhook), so adopt the provider's
            // current period instead of cutting access.
            if ($subscription->stripe_id) {
                try {
                    if ($this->reconcileWithStripe($subscription)) {
                        $reconciled++;
                        continue;
                    }
                } catch (\Throwable $e) {
                    // Provider unreachable — skip this row this run; the next
                    // scheduled run will retry. Never expire on an API error.
                    $errored++;
                    continue;
                }
            }

            $subscription->forceFill([
                'status' => 'expired',
                'ends_at' => $subscription->ends_at ?? $now,
                'suspended_at' => $subscription->suspended_at ?? $now,
                'grace_ends_at' => null,
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

        $this->info("Expired {$expired} subscription(s); reconciled {$reconciled} against Stripe; errored {$errored}.");

        return self::SUCCESS;
    }

    /**
     * Re-check a provider-backed subscription against Stripe.
     *
     * Returns true when the local row was reconciled (period refreshed) and the
     * subscription must NOT be expired. Returns false when the provider
     * confirms the subscription is really over (or cannot be found), so the
     * caller should proceed with the local expiry.
     */
    protected function reconcileWithStripe(Subscription $subscription): bool
    {
        $user = $subscription->user;

        if (! $user || ! $user->stripe_id) {
            return false;
        }

        $stripeSub = \Laravel\Cashier\Cashier::stripe()->subscriptions->retrieve($subscription->stripe_id, []);

        $liveStatuses = ['active', 'trialing', 'past_due'];

        if (! in_array($stripeSub->status, $liveStatuses, true)) {
            // canceled / unpaid / incomplete_expired — the provider agrees the
            // subscription is over.
            return false;
        }

        // The provider still considers the subscription live: refresh the local
        // period from the provider's current period and restore access.
        $periodEnd = isset($stripeSub->current_period_end)
            ? now()->setTimestamp((int) $stripeSub->current_period_end)
            : null;

        $subscription->forceFill([
            'status' => $stripeSub->status === 'past_due' ? 'past_due' : 'active',
            'stripe_status' => $stripeSub->status,
            'ends_at' => $periodEnd ?? $subscription->ends_at,
            'suspended_at' => null,
        ])->save();

        $company = $subscription->company;

        if ($company && $company->status === 'locked') {
            $company->forceFill(['status' => 'active', 'locked_at' => null])->save();
        }

        return true;
    }
}
