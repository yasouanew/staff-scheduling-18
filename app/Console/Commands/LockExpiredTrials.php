<?php

namespace App\Console\Commands;

use App\Models\Company;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

class LockExpiredTrials extends Command
{
    protected $signature = 'billing:lock-expired-trials';

    protected $description = 'Lock companies whose trial has expired and that have no active subscription.';

    public function handle(): int
    {
        $companies = Company::query()
            ->whereNull('locked_at')
            ->whereNotNull('trial_ends_at')
            ->where('trial_ends_at', '<=', now())
            ->whereDoesntHave('subscriptions', function (Builder $query): void {
                $query->where('status', 'active')
                    ->where(function (Builder $endDateQuery): void {
                        $endDateQuery->whereNull('ends_at')->orWhere('ends_at', '>', now());
                    });
            })
            ->get();

        foreach ($companies as $company) {
            $company->forceFill(['locked_at' => now()])->save();
        }

        $count = $companies->count();
        $this->info("Locked {$count} expired trial company account(s).");

        return self::SUCCESS;
    }
}
