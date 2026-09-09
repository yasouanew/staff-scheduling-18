<?php

namespace Tests\Feature\Billing;

use App\Billing\BillingProvider;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Plan-change money orchestration (Task 6):
 *
 *  - an UPGRADE on an active, provider-backed subscription charges the
 *    prorated "rest of the money" immediately (`always_invoice`) and records
 *    a `proration` invoice row keyed on the provider invoice id;
 *  - an upgrade when the customer has no default payment method is deferred
 *    behind a hosted Checkout session (no local plan flip until paid);
 *  - a DOWNGRADE refunds the prorated difference in cash against the current
 *    period's succeeded PaymentIntent (capped at what was actually paid) and
 *    records a `refund` row;
 *  - every path preserves the renewal date (`ends_at`).
 */
class PlanChangePaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['subscription.view', 'subscription.manage'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['subscription.view', 'subscription.manage']);

        Role::findOrCreate('super_admin', 'web')->syncPermissions(Permission::all());
        Role::findOrCreate('employee', 'web');
    }

    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    /**
     * A recording fake provider: captures swap options + refunds and returns
     * a deterministic proration invoice for upgrades.
     */
    private function fakeBillingProvider(): object
    {
        $fake = new class implements BillingProvider
        {
            /** @var array<int, array{plan: Plan, cycle: string, options: array}> */
            public array $swaps = [];

            /** @var array<int, array{amount: float, currency: string, subscription_id: string, plan_id: string, cycle: string}> */
            public array $oneOffCheckouts = [];

            /** @var array<int, array{payment_intent: string, amount: float}> */
            public array $refunds = [];

            public ?array $nextSwapInvoice = [
                'id' => 'in_test_proration_1',
                'amount_paid' => 1500,
                'amount_due' => 1500,
                'currency' => 'aud',
                'payment_intent' => 'pi_test_proration_1',
                'billing_reason' => 'subscription_update',
            ];

            public function startCheckout(
                User $user,
                Plan $plan,
                string $cycle,
                string $subscriptionId,
                ?string $successUrl,
                ?string $cancelUrl,
                ?int $trialDays = null,
            ): array {
                return [
                    'url' => 'https://checkout.stripe.test/session/'.$subscriptionId,
                    'session_id' => 'cs_test_'.$subscriptionId,
                ];
            }

            public function createSubscription(
                User $user,
                Plan $plan,
                string $cycle,
                string $paymentMethod,
                ?int $trialDays = null,
            ): array {
                return [
                    'subscription_id' => 'sub_test_fake',
                    'status' => 'active',
                    'payment_intent_id' => null,
                    'invoice_reference' => null,
                ];
            }

            public function startOneOffCheckout(
                User $user,
                float $amount,
                string $currency,
                string $description,
                string $subscriptionId,
                string $planId,
                string $cycle,
                ?string $successUrl,
                ?string $cancelUrl,
            ): array {
                $this->oneOffCheckouts[] = [
                    'amount' => $amount,
                    'currency' => $currency,
                    'subscription_id' => $subscriptionId,
                    'plan_id' => $planId,
                    'cycle' => $cycle,
                ];

                return [
                    'url' => 'https://checkout.stripe.test/one-off/'.$subscriptionId,
                    'session_id' => 'cs_test_oneoff_'.$subscriptionId,
                ];
            }

            public function cancel(User $user, Subscription $subscription, bool $immediately = false): void
            {
            }

            public function resume(User $user, Subscription $subscription): void
            {
            }

            public function swap(User $user, Subscription $subscription, Plan $plan, string $cycle, array $options = []): ?array
            {
                $this->swaps[] = ['plan' => $plan, 'cycle' => $cycle, 'options' => $options];

                return $this->nextSwapInvoice;
            }

            public function billingPortal(User $user, ?string $returnUrl = null): string
            {
                return 'https://billing.stripe.test/portal/session';
            }

            public function refund(User $user, string $paymentIntentId, float $amount): array
            {
                $this->refunds[] = ['payment_intent' => $paymentIntentId, 'amount' => $amount];

                return ['refund_id' => 're_test_'.count($this->refunds), 'amount_refunded' => $amount];
            }
        };

        $this->app->instance(BillingProvider::class, $fake);

        return $fake;
    }

    /**
     * Bind a SubscriptionService into the container whose customer is treated
     * as having a default payment method, so upgrades that go through the API
     * endpoint take the immediate `always_invoice` charge branch instead of
     * being deferred behind a Checkout session.
     *
     * The helper-created user has no `stripe_id`, so the real
     * {@see SubscriptionService::hasDefaultPaymentMethod()} would return false
     * and (correctly) route upgrades to checkout. These immediate-charge tests
     * instead simulate a customer who can be charged in place.
     */
    private function bindServiceWithDefaultPaymentMethod(): void
    {
        $service = \Mockery::mock(\App\Services\SubscriptionService::class, [
            app(BillingProvider::class),
            app(\App\Services\EntitlementService::class),
            app(\App\Services\UsageService::class),
        ])->makePartial()->shouldAllowMockingProtectedMethods();

        $service->shouldReceive('hasDefaultPaymentMethod')->andReturnTrue();

        $this->app->instance(\App\Services\SubscriptionService::class, $service);
    }

    /**
     * A provider-backed active subscription with a succeeded initial payment
     * (the anchor any downgrade refund is issued against).
     */
    private function makeProviderBackedSubscription(array $planOverrides = []): array
    {
        $company = Company::factory()->create();
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');

        $plan = Plan::factory()->create(array_merge([
            'price_monthly' => 29.00,
            'price_six_monthly' => 159.00,
            'price_yearly' => 290.00,
            'stripe_monthly_price_id' => 'price_test_monthly_current',
        ], $planOverrides));

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'stripe_status' => 'active',
            'stripe_id' => 'sub_test_'.fake()->unique()->bothify('??????'),
            'billing_cycle' => 'monthly',
            'starts_at' => now()->subDays(10),
            'ends_at' => now()->addDays(20),
        ]);

        $subscription->payments()->create([
            'amount' => 29.00,
            'currency' => 'AUD',
            'payment_provider' => 'stripe',
            'provider_reference' => 'in_test_initial_1',
            'stripe_payment_intent_id' => 'pi_test_initial_1',
            'status' => 'succeeded',
            'type' => 'subscription',
            'paid_at' => now()->subDays(10),
        ]);

        return [$company, $user, $plan, $subscription];
    }

    // ---------------------------------------------------------------------
    // Upgrade: charge the rest of the money now
    // ---------------------------------------------------------------------

    public function test_upgrade_charges_proration_immediately_and_records_invoice(): void
    {
        $fake = $this->fakeBillingProvider();
        [$company, $user, $currentPlan, $subscription] = $this->makeProviderBackedSubscription();

        $target = Plan::factory()->create([
            'price_monthly' => 59.00,
            'stripe_monthly_price_id' => 'price_test_monthly_target',
        ]);

        // The customer has a default payment method, so the upgrade is charged
        // in place via an immediate proration invoice (always_invoice) rather
        // than deferred behind a Checkout session.
        $this->bindServiceWithDefaultPaymentMethod();

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/v1/subscription/upgrade', [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.plan_changed', true);

        // The swap must request an immediate proration invoice.
        $this->assertCount(1, $fake->swaps);
        $this->assertSame('always_invoice', $fake->swaps[0]['options']['proration_behavior']);

        // The plan is applied locally.
        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $target->id,
        ]);

        // Renewal date preserved.
        $this->assertTrue(
            $subscription->fresh()->ends_at->equalTo($subscription->ends_at),
            'The renewal date must be preserved across a plan change.'
        );

        // A proration invoice row is recorded, keyed on the provider invoice.
        $this->assertDatabaseHas('subscription_payments', [
            'subscription_id' => $subscription->id,
            'provider_reference' => 'in_test_proration_1',
            'type' => 'proration',
            'amount' => 15.00,
            'status' => 'succeeded',
        ]);

        $this->assertEqualsWithDelta(15.00, (float) $response->json('data.charge.amount'), 0.001);
    }

    public function test_upgrade_invoice_row_is_idempotent_with_the_webhook(): void
    {
        $this->fakeBillingProvider();
        [, $user, , $subscription] = $this->makeProviderBackedSubscription();

        $target = Plan::factory()->create([
            'price_monthly' => 59.00,
            'stripe_monthly_price_id' => 'price_test_monthly_target_2',
        ]);

        // Customer has a default payment method: charge the proration now.
        $this->bindServiceWithDefaultPaymentMethod();

        Sanctum::actingAs($user);
        $this->postJson('/api/v1/subscription/upgrade', ['plan_id' => $target->id])->assertOk();

        // The webhook redelivery of the same provider invoice converges onto
        // the existing row instead of duplicating it.
        $lifecycle = app(\App\Services\BillingLifecycleService::class);
        $lifecycle->markPaid($subscription->fresh(), [
            'id' => 'in_test_proration_1',
            'amount_paid' => 1500,
            'currency' => 'aud',
            'payment_intent' => 'pi_test_proration_1',
        ]);

        $this->assertSame(
            1,
            SubscriptionPayment::query()->where('provider_reference', 'in_test_proration_1')->count(),
        );
    }

    // ---------------------------------------------------------------------
    // Downgrade: refund the difference
    // ---------------------------------------------------------------------

    public function test_downgrade_refunds_prorated_difference_and_records_refund_row(): void
    {
        $fake = $this->fakeBillingProvider();
        [$company, $user, $currentPlan, $subscription] = $this->makeProviderBackedSubscription();

        $target = Plan::factory()->create([
            'price_monthly' => 19.00,
            'stripe_monthly_price_id' => 'price_test_monthly_smaller',
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.plan_changed', true);

        // Downgrade keeps provider prorations (the cash refund is issued here).
        $this->assertSame('create_prorations', $fake->swaps[0]['options']['proration_behavior']);

        // Refund issued against the initial period's PaymentIntent, capped at
        // what was actually paid (difference 10.00 < paid 29.00).
        $this->assertCount(1, $fake->refunds);
        $this->assertSame('pi_test_initial_1', $fake->refunds[0]['payment_intent']);
        $this->assertEqualsWithDelta(10.00, $fake->refunds[0]['amount'], 0.001);

        // The refund row is recorded and labeled.
        $this->assertDatabaseHas('subscription_payments', [
            'subscription_id' => $subscription->id,
            'type' => 'refund',
            'amount' => 10.00,
        ]);

        $this->assertEqualsWithDelta(10.00, (float) $response->json('data.refund.amount'), 0.001);

        // Renewal date preserved.
        $this->assertTrue($subscription->fresh()->ends_at->equalTo($subscription->ends_at));
    }

    public function test_downgrade_refund_never_exceeds_the_paid_amount(): void
    {
        $fake = $this->fakeBillingProvider();

        // Current plan is expensive but the business only ever paid 5.00 —
        // the refund must cap at the paid amount, not the price difference.
        [, $user, , $subscription] = $this->makeProviderBackedSubscription([
            'price_monthly' => 100.00,
        ]);

        $subscription->payments()->updateOrCreate(
            ['provider_reference' => 'in_test_initial_1'],
            ['amount' => 5.00]
        );

        $target = Plan::factory()->create([
            'price_monthly' => 20.00,
            'stripe_monthly_price_id' => 'price_test_monthly_smaller_cap',
        ]);

        Sanctum::actingAs($user);
        $this->postJson('/api/v1/subscription/downgrade', ['plan_id' => $target->id])->assertOk();

        $this->assertCount(1, $fake->refunds);
        $this->assertEqualsWithDelta(5.00, $fake->refunds[0]['amount'], 0.001);
    }

    public function test_downgrade_without_a_succeeded_payment_issues_no_refund(): void
    {
        $fake = $this->fakeBillingProvider();
        [$company, $user] = $this->makeProviderBackedSubscription();

        // Remove the initial payment: nothing to refund against.
        SubscriptionPayment::query()->delete();

        $target = Plan::factory()->create([
            'price_monthly' => 9.00,
            'stripe_monthly_price_id' => 'price_test_monthly_tiny',
        ]);

        Sanctum::actingAs($user);
        $this->postJson('/api/v1/subscription/downgrade', ['plan_id' => $target->id])->assertOk();

        $this->assertCount(0, $fake->refunds);
    }

    // ---------------------------------------------------------------------
    // Upgrade without a default payment method: hosted checkout fallback
    // ---------------------------------------------------------------------

    public function test_upgrade_without_default_payment_method_returns_checkout_url(): void
    {
        $fake = $this->fakeBillingProvider();
        [$company, $user, $currentPlan, $subscription] = $this->makeProviderBackedSubscription();

        $target = Plan::factory()->create([
            'price_monthly' => 59.00,
            'stripe_monthly_price_id' => 'price_test_monthly_target_nopm',
        ]);

        // The customer exists but has no default payment method, so the
        // provider cannot charge the proration invoice in place.
        $customer = new \stdClass();
        $customer->invoice_settings = (object) ['default_payment_method' => null];
        $stripeCustomerMock = \Mockery::mock();
        $stripeCustomerMock->shouldReceive('retrieve')
            ->with($user->stripe_id, [])
            ->andReturn($customer);

        $user->forceFill(['stripe_id' => 'cus_test_planchange'])->save();

        // Simulate the "no default payment method" branch by stubbing
        // hasDefaultPaymentMethod via a partial mock of the service, then drive
        // the deferred plan-change path. The money is NOT moved and the plan is
        // NOT flipped — a one-off Checkout session for ONLY the prorated
        // difference is opened instead.
        $service = \Mockery::mock(\App\Services\SubscriptionService::class, [
            app(BillingProvider::class),
            app(\App\Services\EntitlementService::class),
            app(\App\Services\UsageService::class),
        ])->makePartial()->shouldAllowMockingProtectedMethods();

        $service->shouldReceive('hasDefaultPaymentMethod')->andReturnFalse();

        $result = $service->changePlanWithPayment($subscription, $target, 'monthly', $user);

        // No provider swap was made for the upgrade (no money moved yet).
        $this->assertCount(0, $fake->swaps);

        // A hosted, ONE-OFF checkout URL is returned for the prorated
        // difference, and the plan is NOT flipped yet.
        $this->assertNotNull($result['checkout_url']);
        $this->assertStringContainsString('checkout.stripe.test', $result['checkout_url']);
        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $currentPlan->id,
        ]);

        // The one-off session is for the prorated "rest of the money" only —
        // NOT the full plan price (this is the whole point: never overcharge
        // a customer who already paid most of the period). Period = 30 days,
        // 10 elapsed => 1/3 of the $30 monthly difference = $10.00.
        $this->assertCount(1, $fake->oneOffCheckouts);
        $this->assertEqualsWithDelta(10.00, $fake->oneOffCheckouts[0]['amount'], 0.001);
        $this->assertSame((string) $subscription->id, $fake->oneOffCheckouts[0]['subscription_id']);
        $this->assertSame((string) $target->id, $fake->oneOffCheckouts[0]['plan_id']);
    }

    // ---------------------------------------------------------------------
    // Non-provider subscriptions keep working without any money movement
    // ---------------------------------------------------------------------

    public function test_local_plan_change_makes_no_provider_calls_and_no_charges(): void
    {
        $fake = $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');

        $plan = Plan::factory()->create(['price_monthly' => 29.00]);
        $target = Plan::factory()->create(['price_monthly' => 59.00]);

        Subscription::factory()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
        ]);

        Sanctum::actingAs($user);
        $this->postJson('/api/v1/subscription/upgrade', ['plan_id' => $target->id])->assertOk();

        $this->assertCount(0, $fake->swaps);
        $this->assertCount(0, $fake->refunds);
        $this->assertSame(0, SubscriptionPayment::query()->where('type', 'proration')->count());
    }

    // ---------------------------------------------------------------------
    // Deferred plan change: applying it once the one-off checkout is paid
    // (the shared path behind checkout.session.completed webhook and the
    // SPA-side POST subscription/checkout/confirm).
    // ---------------------------------------------------------------------

    public function test_deferred_plan_change_is_applied_after_one_off_payment(): void
    {
        [$company, $user, $currentPlan, $subscription] = $this->makeProviderBackedSubscription();

        $target = Plan::factory()->create([
            'price_monthly' => 59.00,
            'stripe_monthly_price_id' => 'price_test_monthly_deferred',
        ]);

        $service = app(\App\Services\SubscriptionService::class);

        // Simulate the webhook/confirm handler applying the deferred change.
        $updated = $service->completePlanChangeCheckout($subscription, (string) $target->id, 'monthly', [
            'id' => 'cs_test_oneoff_paid',
            'amount_paid' => 1000, // 10.00 AUD in cents
            'currency' => 'aud',
            'payment_intent' => 'pi_test_oneoff_paid',
        ]);

        // The plan is flipped, the cycle is preserved, and the renewal date is
        // NOT advanced (the one-off charge bought the rest of the current
        // period on the new plan).
        $this->assertSame($target->id, (int) $updated->plan_id);
        $this->assertSame('monthly', $updated->billing_cycle);
        $this->assertTrue($updated->ends_at->equalTo($subscription->ends_at), 'ends_at must be preserved.');

        // The collected money is recorded as a proration invoice row keyed on
        // the one-off session id.
        $this->assertDatabaseHas('subscription_payments', [
            'subscription_id' => $subscription->id,
            'provider_reference' => 'cs_test_oneoff_paid',
            'type' => 'proration',
            'amount' => 10.00,
            'status' => 'succeeded',
        ]);
    }

    public function test_deferred_plan_change_records_no_duplicate_row_when_already_applied(): void
    {
        [$company, $user, , $subscription] = $this->makeProviderBackedSubscription();

        $target = Plan::factory()->create([
            'price_monthly' => 59.00,
            'stripe_monthly_price_id' => 'price_test_monthly_deferred_idem',
        ]);

        $service = app(\App\Services\SubscriptionService::class);

        $service->completePlanChangeCheckout($subscription, (string) $target->id, 'monthly', [
            'id' => 'cs_test_oneoff_replay',
            'amount_paid' => 1000,
            'currency' => 'aud',
        ]);

        // A redelivered / re-confirmed session for the SAME plan must not flip
        // the plan twice or duplicate the invoice row.
        $service->completePlanChangeCheckout($subscription, (string) $target->id, 'monthly', [
            'id' => 'cs_test_oneoff_replay',
            'amount_paid' => 1000,
            'currency' => 'aud',
        ]);

        $this->assertSame(
            1,
            SubscriptionPayment::query()->where('provider_reference', 'cs_test_oneoff_replay')->count(),
        );

        $this->assertSame($target->id, (int) $subscription->fresh()->plan_id);
    }

    public function test_deferred_plan_change_is_rejected_when_business_outgrew_target_limits(): void
    {
        $this->expectException(\App\Exceptions\BillingLimitException::class);

        [$company, $user, $currentPlan, $subscription] = $this->makeProviderBackedSubscription();

        // The target plan allows fewer seats than the business now occupies.
        $target = Plan::factory()->create([
            'price_monthly' => 59.00,
            'max_branches' => 1,
            'max_employees' => 1,
            'stripe_monthly_price_id' => 'price_test_monthly_deferred_limit',
        ]);

        // Two active seats — beyond the target's allowance.
        $seats = \App\Models\User::factory()->count(2)->create([
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        $service = app(\App\Services\SubscriptionService::class);

        $service->completePlanChangeCheckout($subscription, (string) $target->id, 'monthly', [
            'id' => 'cs_test_oneoff_limit',
            'amount_paid' => 1000,
            'currency' => 'aud',
        ]);
    }
}
