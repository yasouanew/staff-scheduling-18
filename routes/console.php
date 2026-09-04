<?php

use App\Console\Commands\EnforcePaymentLifecycle;
use App\Console\Commands\LockExpiredTrials;
use App\Console\Commands\ReconcileIncompleteSubscriptions;
use App\Console\Commands\SendSubscriptionRenewalReminders;
use App\Console\Commands\SendTrialEndingReminders;
use App\Console\Commands\TransitionExpiredTrials;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command(SendTrialEndingReminders::class)->dailyAt('08:00')->withoutOverlapping();
Schedule::command(SendSubscriptionRenewalReminders::class)->dailyAt('08:15')->withoutOverlapping();
Schedule::command(TransitionExpiredTrials::class)->dailyAt('08:20')->withoutOverlapping();
Schedule::command(LockExpiredTrials::class)->dailyAt('08:30')->withoutOverlapping();
Schedule::command(EnforcePaymentLifecycle::class)->dailyAt('08:45')->withoutOverlapping();
// Safety net: expire stale `incomplete` rows left behind by abandoned checkouts
// (the frontend confirms legitimate completions via checkout/confirm).
Schedule::command(ReconcileIncompleteSubscriptions::class)->dailyAt('08:50')->withoutOverlapping();
