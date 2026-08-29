<?php

namespace Tests\Feature\Billing;

use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\User;
use App\Models\WebhookEvent;
use App\Services\BillingLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Task 7 — Billing Provider Integration.
 *
 * Exercises the Stripe webhook contract and the local payment-failure
 * lifecycle without touching the Stripe API:
 *
 *  - signature verification (valid payloads accepted, forged/invalid rejected)
 *  - global webhook idempotency (a duplicate delivery never duplicates a
 *    payment record or a state transition)
 *  - invoice.paid  -> SubscriptionPayment(succeeded) + subscription active + company unlocked
 *  - invoice.payment_failed -> SubscriptionPayment(failed) + subscription past due
 *  - the scheduled lifecycle command: past due -> grace period -> suspended
 *  - subscription state synchronisation via customer.subscription.updated
 */
class BillingProviderWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const WEBHOOK_SECRET = 'whsec_test_secret_for_billing_provider_tests';

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.stripe.webhook_secret' => self::WEBHOOK_SECRET]);
        config(['billing.payment_failure.retry_days' => 3]);
        config(['billing.payment_failure.grace_period_days' => 7]);
        config(['billing.payment_failure.suspend_after_days' => 7]);
    }

    /**
     * Build a signed Stripe webhook payload and return the JSON string plus
     * the corresponding Stripe-Signature header value.
     *
     * The signature is computed the same way Stripe does (HMAC-SHA256 over
     * `timestamp.payload` using the webhook secret), so the controller's
     * `Webhook::constructEvent` verification succeeds.
     *
     * @return array{payload: string, signature: string}
     */
    private function signedWebhook(array $event, ?string $secret = null): array
    {
        $payload = json_encode($event, JSON_THROW_ON_ERROR);
        $timestamp = time();
        $signature = hash_hmac(
            'sha256',
            $timestamp.'.'.$payload,
            $secret ?? self::WEBHOOK_SECRET,
        );

        return [
            'payload' => $payload,
            'signature' => 't='.$timestamp.',v1='.$signature.',v0=placeholder',
        ];
    }

    /**
     * Deliver a signed webhook event through the real HTTP route using the raw
     * signed body so signature verification operates on byte-identical input.
     */
    private function postWebhook(array $event, ?string $signature = null): \Illuminate\Testing\TestResponse
    {
        $signed = $this->signedWebhook($event);

        return $this->call(
            'POST',
            '/api/v1/webhooks/stripe/billing',
            [],
            [],
            [],
            ['HTTP_STRIPE_SIGNATURE' => $signature ?? $signed['signature'], 'CONTENT_TYPE' => 'application/json'],
            $signed['payload'],
        );
    }

    private function makeSubscription(array $overrides = []): Subscription
    {
        $company = Company::factory()->create(['status' => 'active', 'locked_at' => null]);
        $plan = Plan::factory()->create([
            'price_monthly' => 49.99,
            'stripe_monthly_price_id' => 'price_test_monthly_123',
        ]);

        /** @var Subscription $subscription */
        $subscription = Subscription::factory()->create(array_merge([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'stripe_id' => 'sub_test_'.fake()->unique()->bothify('??????'),
            'stripe_status' => 'active',
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'user_id' => User::factory()->create(['company_id' => $company->id])->id,
        ], $overrides));

        return $subscription;
    }

    // ---------------------------------------------------------------------
    // Signature verification & not-configured behaviour
    // ---------------------------------------------------------------------

    public function test_webhook_returns_503_when_not_configured(): void
    {
        config(['services.stripe.webhook_secret' => '']);

        $this->postJson('/api/v1/webhooks/stripe/billing', [], [
            'Stripe-Signature' => 't=1,v1=whatever',
        ])->assertStatus(503);
    }

    public function test_webhook_rejects_missing_signature_header(): void
    {
        $this->postJson('/api/v1/webhooks/stripe/billing', ['type' => 'invoice.paid'])
            ->assertStatus(400);
    }

    public function test_webhook_rejects_a_forged_signature(): void
    {
        $event = [
            'id' => 'evt_forged_1',
            'type' => 'invoice.paid',
            'data' => ['object' => ['id' => 'in_test_forged']],
        ];

        $signed = $this->signedWebhook($event);
        // Tamper with the payload so the signature no longer matches.
        $tampered = json_decode($signed['payload'], true, 512, JSON_THROW_ON_ERROR);
        $tampered['data']['object']['id'] = 'in_test_forged_TAMPERED';

        $this->postJson(
            '/api/v1/webhooks/stripe/billing',
            $tampered,
            ['Stripe-Signature' => $signed['signature']],
        )->assertStatus(400);
    }

    // ---------------------------------------------------------------------
    // invoice.paid — successful payment reconciliation
    // ---------------------------------------------------------------------

    public function test_invoice_paid_records_successful_payment_and_reactivates(): void
    {
        $subscription = $this->makeSubscription([
            'status' => 'past_due',
            'stripe_status' => 'past_due',
            'past_due_since' => now()->subDays(2),
        ]);
        $company = $subscription->company;
        $company->forceFill(['status' => 'locked', 'locked_at' => now()])->save();

        $event = [
            'id' => 'evt_paid_1',
            'type' => 'invoice.paid',
            'data' => [
                'object' => [
                    'id' => 'in_test_paid_1',
                    'amount_due' => 4999,
                    'amount_paid' => 4999,
                    'currency' => 'aud',
                    'payment_intent' => 'pi_test_paid_1',
                    'subscription' => $subscription->stripe_id,
                    'period_start' => now()->subMonth()->getTimestamp(),
                    'period_end' => now()->addMonth()->getTimestamp(),
                ],
            ],
        ];

        $this->postWebhook($event)->assertOk()->assertJson(['received' => true]);

        $this->assertDatabaseHas('subscription_payments', [
            'subscription_id' => $subscription->id,
            'provider_reference' => 'in_test_paid_1',
            'status' => 'succeeded',
            'stripe_payment_intent_id' => 'pi_test_paid_1',
        ]);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => 'active',
            'stripe_status' => 'active',
            'past_due_since' => null,
            'grace_ends_at' => null,
            'suspended_at' => null,
        ]);

        $this->assertDatabaseHas('companies', [
            'id' => $company->id,
            'status' => 'active',
            'locked_at' => null,
        ]);

        $this->assertDatabaseHas('stripe_webhook_events', [
            'event_id' => 'evt_paid_1',
            'status' => 'processed',
        ]);
    }

    // ---------------------------------------------------------------------
    // invoice.payment_failed — failed payment + past due
    // ---------------------------------------------------------------------

    public function test_invoice_payment_failed_marks_subscription_past_due(): void
    {
        $subscription = $this->makeSubscription();

        $event = [
            'id' => 'evt_failed_1',
            'type' => 'invoice.payment_failed',
            'data' => [
                'object' => [
                    'id' => 'in_test_failed_1',
                    'amount_due' => 4999,
                    'amount_paid' => 0,
                    'currency' => 'aud',
                    'payment_intent' => null,
                    'subscription' => $subscription->stripe_id,
                ],
            ],
        ];

        $this->postWebhook($event)->assertOk();

        $this->assertDatabaseHas('subscription_payments', [
            'subscription_id' => $subscription->id,
            'provider_reference' => 'in_test_failed_1',
            'status' => 'failed',
        ]);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => 'past_due',
            'stripe_status' => 'past_due',
        ]);

        $this->assertNotNull($subscription->fresh()->past_due_since);
    }

    // ---------------------------------------------------------------------
    // Idempotency — a duplicate delivery must be a no-op
    // ---------------------------------------------------------------------

    public function test_duplicate_webhook_delivery_is_idempotent(): void
    {
        $subscription = $this->makeSubscription();

        $event = [
            'id' => 'evt_dupe_1',
            'type' => 'invoice.paid',
            'data' => [
                'object' => [
                    'id' => 'in_test_dupe_1',
                    'amount_due' => 4999,
                    'amount_paid' => 4999,
                    'currency' => 'aud',
                    'payment_intent' => 'pi_test_dupe_1',
                    'subscription' => $subscription->stripe_id,
                ],
            ],
        ];

        $this->postWebhook($event)->assertOk()->assertJson(['received' => true]);

        // Second identical delivery must not create a second payment row.
        $this->postWebhook($event)
            ->assertOk()
            ->assertJson(['received' => true, 'duplicate' => true]);

        $this->assertSame(
            1,
            SubscriptionPayment::query()
                ->where('subscription_id', $subscription->id)
                ->where('provider_reference', 'in_test_dupe_1')
                ->count(),
        );

        $this->assertSame(1, WebhookEvent::query()->where('event_id', 'evt_dupe_1')->count());
    }

    // ---------------------------------------------------------------------
    // Lifecycle — past due -> grace period -> suspended
    // ---------------------------------------------------------------------

    public function test_past_due_subscription_moves_to_grace_period(): void
    {
        $subscription = $this->makeSubscription([
            'status' => 'past_due',
            'stripe_status' => 'past_due',
            'past_due_since' => now()->subDays(4),
        ]);

        $lifecycle = app(BillingLifecycleService::class);

        $this->assertTrue($lifecycle->shouldMoveToGracePeriod($subscription));

        $lifecycle->moveToGracePeriod($subscription);

        $subscription->refresh();

        $this->assertSame('grace_period', $subscription->status);
        $this->assertNotNull($subscription->grace_ends_at);
        $this->assertTrue($subscription->grace_ends_at->isFuture());
    }

    public function test_past_due_subscription_within_retry_window_stays_past_due(): void
    {
        $subscription = $this->makeSubscription([
            'status' => 'past_due',
            'stripe_status' => 'past_due',
            'past_due_since' => now(),
        ]);

        $lifecycle = app(BillingLifecycleService::class);

        $this->assertFalse($lifecycle->shouldMoveToGracePeriod($subscription));
        $this->assertFalse($lifecycle->shouldSuspend($subscription));
    }

    public function test_grace_period_expiry_suspends_subscription_and_locks_company(): void
    {
        $subscription = $this->makeSubscription([
            'status' => 'grace_period',
            'stripe_status' => 'past_due',
            'past_due_since' => now()->subDays(6),
            'grace_ends_at' => now()->subDay(),
        ]);
        $company = $subscription->company;

        $lifecycle = app(BillingLifecycleService::class);

        $this->assertTrue($lifecycle->shouldSuspend($subscription));

        $lifecycle->suspend($subscription);

        $subscription->refresh();
        $company->refresh();

        $this->assertSame('suspended', $subscription->status);
        $this->assertNotNull($subscription->suspended_at);
        $this->assertSame('locked', $company->status);
        $this->assertNotNull($company->locked_at);
    }

    public function test_scheduled_command_advances_expired_past_due_subscription_to_suspended(): void
    {
        $subscription = $this->makeSubscription([
            'status' => 'past_due',
            'stripe_status' => 'past_due',
            'past_due_since' => now()->subDays(10),
        ]);
        $company = $subscription->company;

        $this->artisan('billing:enforce-payment-lifecycle')->assertSuccessful();

        $subscription->refresh();
        $company->refresh();

        $this->assertSame('suspended', $subscription->status);
        $this->assertSame('locked', $company->status);
    }

    public function test_scheduled_command_moves_past_due_subscription_to_grace_within_window(): void
    {
        $subscription = $this->makeSubscription([
            'status' => 'past_due',
            'stripe_status' => 'past_due',
            'past_due_since' => now()->subDays(4),
        ]);

        $this->artisan('billing:enforce-payment-lifecycle')->assertSuccessful();

        $subscription->refresh();

        $this->assertSame('grace_period', $subscription->status);
        $this->assertNotNull($subscription->grace_ends_at);
    }

    // ---------------------------------------------------------------------
    // Subscription state synchronisation
    // ---------------------------------------------------------------------

    public function test_subscription_updated_active_reconciles_state(): void
    {
        $subscription = $this->makeSubscription([
            'status' => 'past_due',
            'stripe_status' => 'past_due',
            'past_due_since' => now()->subDay(),
        ]);

        $event = [
            'id' => 'evt_sub_updated_active',
            'type' => 'customer.subscription.updated',
            'data' => [
                'object' => [
                    'id' => $subscription->stripe_id,
                    'status' => 'active',
                    'current_period_start' => now()->getTimestamp(),
                    'current_period_end' => now()->addMonth()->getTimestamp(),
                ],
            ],
        ];

        $this->postWebhook($event)->assertOk();

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => 'active',
            'stripe_status' => 'active',
            'past_due_since' => null,
        ]);
    }

    public function test_subscription_updated_past_due_syncs_status(): void
    {
        $subscription = $this->makeSubscription();

        $event = [
            'id' => 'evt_sub_updated_past_due',
            'type' => 'customer.subscription.updated',
            'data' => [
                'object' => [
                    'id' => $subscription->stripe_id,
                    'status' => 'past_due',
                ],
            ],
        ];

        $this->postWebhook($event)->assertOk();

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => 'past_due',
            'stripe_status' => 'past_due',
        ]);
    }

    public function test_subscription_deleted_marks_subscription_cancelled(): void
    {
        $subscription = $this->makeSubscription();

        $event = [
            'id' => 'evt_sub_deleted',
            'type' => 'customer.subscription.deleted',
            'data' => ['object' => ['id' => $subscription->stripe_id]],
        ];

        $this->postWebhook($event)->assertOk();

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => 'cancelled',
            'stripe_status' => 'canceled',
        ]);
        $this->assertNotNull($subscription->fresh()->cancelled_at);
    }
}
