<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Billing Provider
    |--------------------------------------------------------------------------
    |
    | The payment provider integration currently in use. This value drives the
    | provider abstraction in `App\Billing\BillingProvider` so provider-specific
    | code never leaks into application controllers.
    |
    */

    'provider' => env('BILLING_PROVIDER', 'stripe'),

    /*
    |--------------------------------------------------------------------------
    | Payment Failure Lifecycle
    |--------------------------------------------------------------------------
    |
    | When a payment fails the subscription moves through a configurable
    | lifecycle instead of being revoked immediately:
    |
    |   ACTIVE -> PAYMENT FAILED -> PAST DUE -> GRACE PERIOD -> SUSPENDED
    |
    |  - `retry_days`       : window (after the first failure) during which the
    |                         provider may automatically retry the payment
    |                         before we move the subscription into a grace period.
    |  - `grace_period_days`: how long the company keeps access after the
    |                         subscription becomes past due. During this window
    |                         access is still granted.
    |  - `suspend_after_days`: how long after the past-due state begins we
    |                         suspend the account if the payment is never made.
    |
    | These are business rules, not technical constants, so they are overridable
    | via environment variables and stored in a single configuration source.
    |
    */

    'payment_failure' => [
        'retry_days' => (int) env('BILLING_PAYMENT_FAILURE_RETRY_DAYS', 3),
        'grace_period_days' => (int) env('BILLING_PAYMENT_FAILURE_GRACE_PERIOD_DAYS', 7),
        'suspend_after_days' => (int) env('BILLING_PAYMENT_FAILURE_SUSPEND_AFTER_DAYS', 7),
    ],

    /*
    |--------------------------------------------------------------------------
    | Trial Lifecycle
    |--------------------------------------------------------------------------
    |
    |  - `reminder_days`: the number of days remaining before the trial ends at
    |    which company administrators are reminded. One reminder is sent per
    |    configured value (e.g. 7, 3, 1 => "7 days remaining", "3 days
    |    remaining", "1 day remaining"). Overridable as a comma-separated list
    |    via the `BILLING_TRIAL_REMINDER_DAYS` environment variable.
    |
    */

    'trial' => [
        'reminder_days' => array_values(array_unique(array_filter(array_map(
            'intval',
            explode(',', (string) env('BILLING_TRIAL_REMINDER_DAYS', '7,3,1'))
        ), fn (int $days): bool => $days > 0))),
    ],

];
