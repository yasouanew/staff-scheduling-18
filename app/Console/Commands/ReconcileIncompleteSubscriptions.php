<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Services\BillingLifecycleService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Laravel\Cashier\Cashier;

/**
 * Reconcile subscription rows that are stuck in `incomplete` status.
 *
 * When a business starts a Stripe Checkout session but the completion webhook
 * never lands (e.g. the webhook secret is not configured), the local
 * subscription row stays `incomplete` forever even though Stripe may have
 * charged the customer.  This command reconciles those stale rows:
 *
 *  1. Looks up each stale `incomplete` row that has a `checkout_session_id`
 *     and was created more than `stale-hours` ago.
 *  2. If the Stripe Checkout session is PAID → records the invoice payment
 *     (`BillingLifecycleService::markPaid`), stores the `stripe_id` and
 *     activates the subscription + unlocks the company — the same outcome the
 *     `confirmCheckout` controller endpoint produces for live completions.
 *  3. If the session is unpaid / open / expired / unknown → marks the local
 *     row `expired` so abandoned checkouts stop cluttering the super-admin
 *     subscription list.
 *  4. Rows with no `checkout_session_id` (abandoned before the Stripe
 *     redirect) are marked `expired` immediately.
 *
 * This is both a one-time data cleanup and a nightly safety net for future
 * abandoned / unconfirmed checkouts.
 */
class ReconcileIncompleteSubscriptions extends Command
{
    protected $signature = 'billing:reconcile-incomplete
        {--stale-hours=24 : Minimum age (hours) for an incomplete row to be reconciled.}';

    protected $description = 'Reconcile stale incomplete subscriptions (abandoned or unconfirmed checkouts).';

    public function __construct(
        private readonly BillingLifecycleService $lifecycle,
    ) {
        parent::__construct();
    }

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $staleThreshold = max(0, (int) $this->option('stale-hours'));
        $cutoff = Carbon::now()->subHours($staleThreshold);

        $candidates = Subscription::query()
            ->where('status', 'incomplete')
            ->where('created_at', '<', $cutoff)
            ->get();

        if ($candidates->isEmpty()) {
            $this->info('No stale incomplete subscriptions found.');

            return self::SUCCESS;
        }

        $this->info("Found {$candidates->count()} incomplete subscription(s) older than {$staleThreshold}h.");

        $activated = 0;
        $expired = 0;
        $errored = 0;

        foreach ($candidates as $subscription) {
            // Rows without a checkout_session_id were abandoned before the
            // redirect to Stripe — there is no Stripe state to inspect.
            if (! $subscription->checkout_session_id) {
                $this->expire($subscription);
                $expired++;

                continue;
            }

            try {
                $session = Cashier::stripe()->checkout->sessions->retrieve(
                    $subscription->checkout_session_id,
                    ['expand' => ['subscription', 'subscription.latest_invoice.payment_intent']],
                );
            } catch (\Exception $e) {
                $this->warn("Stripe API error for session {$subscription->checkout_session_id}: {$e->getMessage()}");
                $this->expire($subscription);
                $errored++;

                continue;
            }

            $paid = ($session->payment_status ?? 'unpaid') === 'paid';
            $stripeSubId = $session->subscription->id ?? null;

            if ($paid && is_string($stripeSubId)) {
                $this->activate($subscription, $session);
                $activated++;
            } else {
                $this->expire($subscription);
                $expired++;
            }
        }

        $this->newLine();
        $this->table(
            ['Outcome', 'Count'],
            [
                ['Activated (paid checkout)', $activated],
                ['Expired (abandoned / unconfirmed)', $expired],
                ['Errored', $errored],
            ],
        );

        return self::SUCCESS;
    }

    /**
     * Activate a subscription whose Stripe Checkout session was actually paid.
     *
     * Mirrors `PlanSubscriptionController::confirmCheckout()`: store the
     * provider subscription id, drive the same lifecycle transition as
     * `invoice.paid` (`markPaid` records a SubscriptionPayment, sets the status
     * to active and unlocks the company), and set the activation-notified flag
     * so a later webhook delivery does not notify twice.
     */
    private function activate(Subscription $subscription, object $session): void
    {
        $subscription->stripe_id = $session->subscription->id ?? $subscription->stripe_id;
        $subscription->checkout_session_id = $session->id;
        $subscription->save();

        $invoice = $session->subscription->latest_invoice ?? null;
        $invoiceArray = $invoice ? [
            'id' => $invoice->id ?? null,
            'amount_due' => $invoice->amount_due ?? null,
            'amount_paid' => $invoice->amount_paid ?? null,
            'currency' => $invoice->currency ?? 'AUD',
            'payment_intent' => $invoice->payment_intent->id ?? null,
        ] : [];

        $periodStart = isset($session->subscription->current_period_start)
            ? (int) $session->subscription->current_period_start
            : null;
        $periodEnd = isset($session->subscription->current_period_end)
            ? (int) $session->subscription->current_period_end
            : null;

        $this->lifecycle->markPaid($subscription, $invoiceArray, $periodStart, $periodEnd);

        if ($subscription->activation_notified_at === null) {
            $subscription->update(['activation_notified_at' => now()]);
        }

        $this->info("Activated subscription #{$subscription->id} (session {$session->id} was paid).");
    }

    /**
     * Mark a subscription as expired (terminal state for abandoned checkouts).
     */
    private function expire(Subscription $subscription): void
    {
        $subscription->forceFill([
            'status' => 'expired',
            'stripe_status' => null,
            'cancelled_at' => $subscription->cancelled_at ?? now(),
            'ends_at' => $subscription->ends_at ?? now(),
        ])->save();

        $this->line("Expired subscription #{$subscription->id}.");
    }
}