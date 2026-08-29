<?php

namespace App\Providers;

use App\Billing\BillingProvider;
use App\Billing\StripeBillingProvider;
use App\Notifications\Channels\FcmChannel;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Bind the billing-provider abstraction. Provider-specific logic is
        // isolated behind the contract; swap this binding to change providers.
        $this->app->singleton(BillingProvider::class, function ($app) {
            return match ($app['config']->get('billing.provider', 'stripe')) {
                'stripe' => new StripeBillingProvider(),
                default => new StripeBillingProvider(),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Vite::prefetch(concurrency: 3);

        // Register the "fcm" notification channel for mobile push notifications.
        Notification::extend('fcm', fn ($app) => $app->make(FcmChannel::class));
    }
}

