<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use Illuminate\Support\Facades\DB;

/**
 * Drives the local subscription / payment-failure lifecycle.
 *
 * The provider (Stripe) is the source of truth for payments, but the local
 * database is the single source of truth for authorization. This service
 * reconciles provider events into the local state machine:
 *
 *   ACTIVE -> PAYMENT FAILED -> PAST DUE -> GRACE PERIOD -> SUSPENDED
 *
 * Rules (business-configurable via config/billing.php):
 *  - a failed payment immediately flags the subscription as past due and
 *    records a FAILED SubscriptionPayment row;
 *  - after `retry_days` the subscription enters a grace period where access is
 *    still granted but bounded by `grace_ends_at`;
 *  - after `suspend_after_days` from the initial failure, if the payment has
 *    not been made, the company is suspended (access revoked). No business data
 *    is deleted — the account can be reactivated on a successful payment.
 */
class BillingLifecycleService
{
    /**
     * Record a failed payment and mark the subscription past due.
     */
    public function markPaymentFailed(Subscription $subscription, array $invoice): void
    {
        DB::transaction(function () use ($subscription, $invoice): void {
            $this->upsertPayment($subscription, $invoice, 'failed');

            $subscription->forceFill([
                'status' => 'past_due',
                'past_due_since' => $subscription->past_due_since ?? now(),
                'grace_ends_at' => null,
                'suspended_at' => null,
                'stripe_status' => 'past_due',
            ])->save();
        });
    }

    /**
     * Move a past-due subscription into its grace period (access retained).
     */
    public function moveToGracePeriod(Subscription $subscription): void
    {
        $subscription->forceFill([
            'status' => 'grace_period',
            'grace_ends_at' => now()->addDays((int) config('billing.payment_failure.grace_period_days', 7)),
            'suspended_at' => null,
        ])->save();
    }

    /**
     * Suspend a subscription that never resolved its overdue payment.
     */
    public function suspend(Subscription $subscription): void
    {
        DB::transaction(function () use ($subscription): void {
            $subscription->forceFill([
                'status' => 'suspended',
                'suspended_at' => now(),
            ])->save();

            $company = $subscription->company;

            if ($company) {
                $company->forceFill([
                    'status' => 'locked',
                    'locked_at' => now(),
                ])->save();
            }
        });
    }

    /**
     * Reconcile a successful payment: record it, reactivate access and clear
     * all past-due / grace / suspension state.
     */
    public function markPaid(Subscription $subscription, array $invoice, ?int $periodStart = null, ?int $periodEnd = null): void
    {
        DB::transaction(function () use ($subscription, $invoice, $periodStart, $periodEnd): void {
            $this->upsertPayment($subscription, $invoice, 'succeeded');

            $subscription->forceFill([
                'status' => 'active',
                'stripe_status' => 'active',
                'starts_at' => $periodStart ? now()->setTimestamp($periodStart) : $subscription->starts_at,
                'ends_at' => $periodEnd ? now()->setTimestamp($periodEnd) : $subscription->ends_at,
                'cancelled_at' => null,
                'past_due_since' => null,
                'grace_ends_at' => null,
                'suspended_at' => null,
            ])->save();

            $company = $subscription->company;

            if ($company) {
                $company->forceFill([
                    'status' => 'active',
                    'locked_at' => null,
                ])->save();
            }
        });
    }

    /**
     * Whether a past-due subscription should transition into the grace period.
     */
    public function shouldMoveToGracePeriod(Subscription $subscription): bool
    {
        if ($subscription->status !== 'past_due' || ! $subscription->past_due_since) {
            return false;
        }

        return $subscription->past_due_since->copy()
            ->addDays((int) config('billing.payment_failure.retry_days', 3))
            ->isPast();
    }

    /**
     * Whether a past-due / grace subscription should be suspended.
     */
    public function shouldSuspend(Subscription $subscription): bool
    {
        if ($subscription->status === 'grace_period' && $subscription->grace_ends_at) {
            return $subscription->grace_ends_at->isPast();
        }

        if ($subscription->status === 'past_due' && $subscription->past_due_since) {
            return $subscription->past_due_since->copy()
                ->addDays((int) config('billing.payment_failure.suspend_after_days', 7))
                ->isPast();
        }

        return false;
    }

    /**
     * Upsert a SubscriptionPayment row from an invoice event. Idempotent per
     * provider invoice reference so duplicate webhook deliveries never create
     * duplicate payment records.
     */
    protected function upsertPayment(Subscription $subscription, array $invoice, string $status): void
    {
        $reference = $invoice['id'] ?? null;

        // Without a provider reference there is no way to make this idempotent,
        // and no payment actually occurred. Skip silently (e.g. the synthetic
        // "active" reconciliation from a subscription.updated event).
        if (! $reference) {
            return;
        }

        $existing = $subscription->payments()->where('provider_reference', $reference)->first();

        if ($existing) {
            $existing->update([
                'status' => $status,
                'paid_at' => $status === 'succeeded' ? now() : null,
            ]);

            return;
        }

        $subscription->payments()->create([
            'amount' => $this->amountFromInvoice($invoice, $subscription),
            'currency' => strtoupper($invoice['currency'] ?? 'AUD'),
            'payment_provider' => 'stripe',
            'provider_reference' => $reference,
            'stripe_payment_intent_id' => $invoice['payment_intent'] ?? null,
            'status' => $status,
            'paid_at' => $status === 'succeeded' ? now() : null,
        ]);
    }

    /**
     * Resolve the invoice amount, falling back to the subscription's plan.
     */
    protected function amountFromInvoice(array $invoice, Subscription $subscription): float
    {
        if (isset($invoice['amount_paid']) && $invoice['amount_paid'] > 0) {
            return (float) ($invoice['amount_paid'] / 100);
        }

        if (isset($invoice['amount_due']) && $invoice['amount_due'] > 0) {
            return (float) ($invoice['amount_due'] / 100);
        }

        $plan = $subscription->plan;

        if ($plan) {
            return (float) match ($subscription->billing_cycle) {
                'monthly' => $plan->price_monthly,
                'six_month' => $plan->price_six_monthly,
                'yearly' => $plan->price_yearly,
                default => 0.0,
            };
        }

        return 0.0;
    }
}
