<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\User;
use App\Notifications\TrialEndingNotification;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

class SendTrialEndingReminders extends Command
{
    protected $signature = 'billing:send-trial-ending-reminders {--days=null : Legacy single-bucket window; ignored when config buckets are set.}';

    protected $description = 'Send company administrators staggered, configurable trial-ending reminders (e.g. 7 / 3 / 1 days remaining).';

    public function handle(): int
    {
        $today = now()->startOfDay();

        // Configurable reminder buckets, e.g. [7, 3, 1] means "remind with 7,
        // 3 and 1 day(s) remaining". Sorted descending, de-duplicated.
        $buckets = collect(config('billing.trial.reminder_days', [7, 3, 1]))
            ->map(fn (mixed $days): int => max(1, (int) $days))
            ->unique()
            ->sortDesc()
            ->values();

        if ($buckets->isEmpty()) {
            $this->warn('No trial reminder buckets configured (billing.trial.reminder_days).');

            return self::SUCCESS;
        }

        $companies = Company::query()
            ->whereNotNull('trial_ends_at')
            ->where('trial_ends_at', '>', $today)
            ->whereDoesntHave('subscriptions', function (Builder $query): void {
                $query->where('status', 'active')
                    ->where(function (Builder $endDateQuery): void {
                        $endDateQuery->whereNull('ends_at')->orWhere('ends_at', '>', now());
                    });
            })
            ->get();

        $sent = 0;

        foreach ($companies as $company) {
            $daysRemaining = $today->diffInDays($company->trial_ends_at->copy()->startOfDay());
            $alreadySent = $company->trial_reminders_sent ?? [];

            $dueBuckets = $buckets->filter(function (int $bucket) use ($daysRemaining, $alreadySent): bool {
                if (in_array($bucket, $alreadySent, true)) {
                    return false;
                }

                // Send each bucket exactly once when the trial is within that
                // many days, without re-sending an earlier bucket once a closer
                // threshold has already passed.
                return $daysRemaining <= $bucket;
            });

            if ($dueBuckets->isEmpty()) {
                continue;
            }

            // Only the closest due bucket is dispatched per run to avoid
            // flooding admins when the scheduler was offline for several days.
            $bucket = $dueBuckets->first();
            $notification = new TrialEndingNotification($company, $bucket);

            $company->users()
                ->where('role', 'company_admin')
                ->each(function (User $user) use ($notification, &$sent): void {
                    $user->notify($notification);
                    $sent++;
                });

            $company->forceFill([
                'trial_reminders_sent' => array_values(array_unique([...$alreadySent, $bucket])),
                'trial_ending_reminded_at' => now(),
            ])->save();
        }

        $this->info("Sent {$sent} trial-ending reminder notification(s).");

        return self::SUCCESS;
    }
}
