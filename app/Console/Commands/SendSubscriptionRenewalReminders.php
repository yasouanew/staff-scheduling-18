<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Models\User;
use App\Notifications\SubscriptionRenewalReminderNotification;
use Illuminate\Console\Command;

class SendSubscriptionRenewalReminders extends Command
{
    protected $signature = 'billing:send-renewal-reminders {--days=7 : Number of days before renewal to remind companies}';

    protected $description = 'Send company administrators an email and in-app reminder before an active subscription renews.';

    public function handle(): int
    {
        $reminderDays = max(1, min(60, (int) $this->option('days')));
        $today = now()->startOfDay();
        $lastReminderDay = now()->addDays($reminderDays)->endOfDay();

        $subscriptions = Subscription::query()
            ->with(['company', 'plan'])
            ->where('status', 'active')
            ->whereNull('cancelled_at')
            ->whereNull('renewal_reminded_at')
            ->whereNotNull('ends_at')
            ->whereBetween('ends_at', [$today->copy()->addDay(), $lastReminderDay])
            ->get();

        $sent = 0;

        foreach ($subscriptions as $subscription) {
            $daysRemaining = max(1, $today->diffInDays($subscription->ends_at->copy()->startOfDay()));
            $notification = new SubscriptionRenewalReminderNotification($subscription, $daysRemaining);

            $subscription->company?->users()
                ->where('role', 'company_admin')
                ->each(function (User $user) use ($notification, &$sent): void {
                    $user->notify($notification);
                    $sent++;
                });

            $subscription->forceFill(['renewal_reminded_at' => now()])->save();
        }

        $this->info("Sent {$sent} subscription renewal reminder notification(s).");

        return self::SUCCESS;
    }
}
