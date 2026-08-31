<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Models\WebhookEvent;
use App\Notifications\SubscriptionActivatedNotification;
use App\Services\BillingLifecycleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Webhook;

class StripeBillingWebhookController extends Controller
{
    public function __construct(
        private readonly BillingLifecycleService $lifecycle,
    ) {
    }

    /**
     * Handle a Stripe webhook delivery.
     *
     * Signature verification happens first; only genuinely signed Stripe events
     * are processed. Every processed event id is recorded in
     * `stripe_webhook_events` so duplicate deliveries are idempotent — a replay
     * can never create duplicate payments or duplicate state transitions.
     */
    public function handle(Request $request): JsonResponse
    {
        $secret = (string) config('services.stripe.webhook_secret');

        if ($secret === '') {
            return response()->json(['message' => 'Stripe webhook is not configured.'], 503);
        }

        $signature = $request->header('Stripe-Signature');

        if (! $signature) {
            return response()->json(['message' => 'Missing Stripe-Signature header.'], 400);
        }

        try {
            $event = Webhook::constructEvent($request->getContent(), $signature, $secret);
        } catch (\UnexpectedValueException|SignatureVerificationException) {
            return response()->json(['message' => 'Invalid Stripe webhook signature.'], 400);
        }

        $eventId = (string) ($event->id ?? '');

        // Global idempotency: skip this event if we already processed it.
        if ($eventId !== '' && WebhookEvent::query()->where('event_id', $eventId)->exists()) {
            return response()->json(['received' => true, 'duplicate' => true]);
        }

        DB::transaction(function () use ($event, $eventId): void {
            $object = $event->data->object;
            $subscription = $this->resolveSubscription($event, $object);

            $this->dispatchEvent($event->type, $object, $subscription, $eventId);
        });

        return response()->json(['received' => true]);
    }

    /**
     * Route an event to its handler. If the event id was recorded by a handler
     * (idempotency marker written inside the transaction) the event is skipped
     * on a subsequent delivery.
     */
    protected function dispatchEvent(string $type, object $object, ?Subscription $subscription, string $eventId): void
    {
        if ($this->wasProcessed($eventId)) {
            return;
        }

        match ($type) {
            'checkout.session.completed' => $this->handleCheckoutCompleted($object, $subscription),
            'invoice.paid' => $this->handleInvoicePaid($object, $subscription),
            'invoice.payment_failed', 'invoice.failed' => $this->handleInvoiceFailed($object, $subscription),
            'customer.subscription.created', 'customer.subscription.updated' => $this->handleSubscriptionUpdated($object, $subscription),
            'customer.subscription.deleted' => $this->handleSubscriptionDeleted($object, $subscription),
            default => null,
        };

        if ($eventId !== '') {
            WebhookEvent::create([
                'event_id' => $eventId,
                'type' => $type,
                'status' => 'processed',
                'payload' => json_decode(json_encode($object), true) ?: null,
                'processed_at' => now(),
            ]);

            if ($subscription) {
                $ids = $subscription->webhook_event_ids ?? [];
                $ids[] = $eventId;
                $subscription->forceFill(['webhook_event_ids' => array_values(array_unique($ids))])->save();
            }
        }
    }

    protected function wasProcessed(string $eventId): bool
    {
        return $eventId !== '' && WebhookEvent::query()->where('event_id', $eventId)->exists();
    }

    /**
     * Locate the local subscription for an event by Stripe subscription id, or
     * by the local id embedded in the metadata / client reference.
     */
    protected function resolveSubscription(object $event, object $object): ?Subscription
    {
        $stripeSubId = is_string($object->subscription ?? null) ? $object->subscription
            : (is_string($object->id ?? null) && str_starts_with((string) $object->id, 'sub_') ? $object->id : null);

        if ($stripeSubId) {
            $subscription = Subscription::query()->where('stripe_id', $stripeSubId)->first();
            if ($subscription) {
                return $subscription;
            }
        }

        $localId = $object->metadata->local_subscription_id
            ?? $object->client_reference_id
            ?? $event->data?->object?->metadata?->local_subscription_id
            ?? null;

        return $localId ? Subscription::find($localId) : null;
    }

    protected function handleCheckoutCompleted(object $object, ?Subscription $subscription): void
    {
        if (! $subscription) {
            return;
        }

        $subscription->update([
            'stripe_id' => is_string($object->subscription) ? $object->subscription : $subscription->stripe_id,
            'checkout_session_id' => is_string($object->id) ? $object->id : $subscription->checkout_session_id,
        ]);
    }

    protected function handleInvoicePaid(object $object, ?Subscription $subscription): void
    {
        if (! $subscription) {
            return;
        }

        $this->lifecycle->markPaid(
            $subscription,
            $this->invoiceArray($object),
            isset($object->period_start) ? (int) $object->period_start : null,
            isset($object->period_end) ? (int) $object->period_end : null,
        );

        $this->activateSubscription($subscription);
    }

    protected function handleInvoiceFailed(object $object, ?Subscription $subscription): void
    {
        if (! $subscription) {
            return;
        }

        $this->lifecycle->markPaymentFailed($subscription, $this->invoiceArray($object));
    }

    protected function handleSubscriptionUpdated(object $object, ?Subscription $subscription): void
    {
        if (! $subscription) {
            return;
        }

        $stripeStatus = (string) $object->status;
        $status = match ($stripeStatus) {
            'trialing' => 'trialing',
            'active' => 'active',
            'canceled', 'unpaid', 'incomplete_expired' => 'cancelled',
            'past_due' => 'past_due',
            'paused' => 'paused',
            default => 'past_due',
        };

        // Reconcile the local plan against the provider's actual price. The
        // provider is the source of truth for what the customer is being
        // charged, so a plan/billing-cycle change is only ever applied locally
        // once it is confirmed in the subscription object's line items. This
        // keeps the local row converged on the provider even if an upgrade or
        // downgrade request and its webhook arrive out of order.
        $this->reconcilePlanFromProvider($subscription, $object);

        if ($status === 'active') {
            $this->lifecycle->markPaid(
                $subscription,
                [],
                isset($object->current_period_start) ? (int) $object->current_period_start : null,
                isset($object->current_period_end) ? (int) $object->current_period_end : null,
            );
            $this->activateSubscription($subscription);

            return;
        }

        $subscription->update([
            'stripe_id' => is_string($object->id) ? $object->id : $subscription->stripe_id,
            'stripe_status' => $stripeStatus,
            'status' => $status,
            'starts_at' => isset($object->current_period_start) ? now()->setTimestamp((int) $object->current_period_start) : $subscription->starts_at,
            'ends_at' => isset($object->current_period_end) ? now()->setTimestamp((int) $object->current_period_end) : $subscription->ends_at,
            'cancelled_at' => $status === 'cancelled' ? now() : null,
            'past_due_since' => $status === 'past_due' ? ($subscription->past_due_since ?? now()) : null,
            'grace_ends_at' => null,
            'suspended_at' => null,
            'activation_notified_at' => null,
        ]);
    }

    protected function handleSubscriptionDeleted(object $object, ?Subscription $subscription): void
    {
        if (! $subscription) {
            return;
        }

        $subscription->update([
            'status' => 'cancelled',
            'stripe_status' => 'canceled',
            'cancelled_at' => now(),
        ]);
    }

    /**
     * Normalise a Stripe invoice object into the shape consumed by the
     * lifecycle service.
     *
     * @return array<string, mixed>
     */
    protected function invoiceArray(object $object): array
    {
        return [
            'id' => is_string($object->id ?? null) ? $object->id : null,
            'amount_due' => isset($object->amount_due) ? (int) $object->amount_due : null,
            'amount_paid' => isset($object->amount_paid) ? (int) $object->amount_paid : null,
            'currency' => is_string($object->currency ?? null) ? $object->currency : 'AUD',
            'payment_intent' => is_string($object->payment_intent ?? null) ? $object->payment_intent : null,
        ];
    }

    /**
     * Reconcile the local plan and billing cycle from the provider's price.
     *
     * The Stripe subscription object's first line item carries the price the
     * customer is actually being charged. We resolve that price back to a local
     * plan (by any of the three per-cycle price ids) and, when it differs from
     * the local row, converge the local state. This is what keeps the local
     * subscription in sync with Stripe for upgrades / downgrades / billing-cycle
     * changes — the provider is authoritative for what was actually charged.
     *
     * Unknown prices are ignored (a plan may have been retired); local state is
     * never guessed.
     */
    private function reconcilePlanFromProvider(Subscription $subscription, object $object): void
    {
        $priceId = $this->firstPriceId($object);

        if (! is_string($priceId) || $priceId === '') {
            return;
        }

        $plan = Plan::query()
            ->where('stripe_monthly_price_id', $priceId)
            ->orWhere('stripe_six_monthly_price_id', $priceId)
            ->orWhere('stripe_yearly_price_id', $priceId)
            ->first();

        if (! $plan) {
            return;
        }

        $cycle = match (true) {
            $plan->stripe_monthly_price_id === $priceId => 'monthly',
            $plan->stripe_six_monthly_price_id === $priceId => 'six_month',
            $plan->stripe_yearly_price_id === $priceId => 'yearly',
            default => $subscription->billing_cycle,
        };

        if ($subscription->plan_id === $plan->id && $subscription->billing_cycle === $cycle) {
            return;
        }

        $subscription->update([
            'plan_id' => $plan->id,
            'billing_cycle' => $cycle,
            'stripe_price' => $priceId,
        ]);
    }

    /**
     * Extract the price id from the subscription object's first line item.
     */
    private function firstPriceId(object $object): ?string
    {
        $items = $object->items ?? null;

        if (! is_object($items) || ! is_array($items->data ?? null) || count($items->data) === 0) {
            return null;
        }

        $price = $items->data[0]->price ?? null;

        return is_object($price) && is_string($price->id ?? null) ? $price->id : null;
    }

    /**
     * Apply a confirmed active payment state and unlock the company. The
     * notification timestamp makes duplicate Stripe deliveries idempotent.
     */
    private function activateSubscription(Subscription $subscription): void
    {
        $shouldNotify = $subscription->activation_notified_at === null;

        $subscription->update([
            'activation_notified_at' => $shouldNotify ? now() : $subscription->activation_notified_at,
        ]);

        $company = $subscription->company;

        if ($company) {
            $company->forceFill([
                'status' => 'active',
                'locked_at' => null,
            ])->save();
        }

        if (! $shouldNotify || ! $company) {
            return;
        }

        $notificationSubscription = $subscription->fresh('plan');

        DB::afterCommit(function () use ($company, $notificationSubscription): void {
            $company->users()
                ->where('role', 'company_admin')
                ->each(function (User $user) use ($notificationSubscription): void {
                    $user->notify(new SubscriptionActivatedNotification($notificationSubscription));
                });
        });
    }
}
