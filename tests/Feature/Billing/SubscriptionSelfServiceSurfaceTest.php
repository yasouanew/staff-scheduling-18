<?php

namespace Tests\Feature\Billing;

use App\Billing\BillingProvider;
use App\Models\Branch;
use App\Models\Company;
use App\Models\Employee;
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
 * Task 17 — Finalize and clean the versioned API.
 *
 * The company self-service billing surface (`/api/v1/subscription*`) must
 * expose the full lifecycle a business needs to subscribe, reactivate, resume
 * and review its billing — while remaining scoped to the caller's own company.
 *
 *  - POST /subscription/checkout   — hosted Stripe Checkout (also the locked-
 *                                    company reactivation path, so the route is
 *                                    OUTSIDE `company.access`)
 *  - POST /subscription/resume     — resume the most recent cancelled subscription
 *  - GET  /subscription/payments   — the business's payment history
 *  - GET  /subscription/invoices   — the same local payment rows as invoices
 *  - a locked company can still reach the billing surface (SUBSCRIPTION_REQUIRED
 *    is returned by operational endpoints, not by billing ones)
 */
class SubscriptionSelfServiceSurfaceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach ([
            'subscription.view', 'subscription.manage', 'subscription.refund',
            'branch.view', 'branch.create', 'branch.edit', 'branch.delete',
            'employee.view', 'employee.create', 'employee.edit', 'employee.delete',
        ] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions([
            'subscription.view', 'subscription.manage', 'subscription.refund',
            'branch.view', 'branch.create', 'branch.edit', 'branch.delete',
            'employee.view', 'employee.create', 'employee.edit', 'employee.delete',
        ]);

        Role::findOrCreate('scheduler', 'web');
        Role::findOrCreate('employee', 'web');
    }

    /**
     * Bind a fake provider so no real Stripe API call is ever made.
     */
    private function fakeBillingProvider(): void
    {
        $fake = new class implements BillingProvider
        {
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
                    'url' => 'https://checkout.stripe.test/session/'. $subscriptionId,
                    'session_id' => 'cs_test_'. $subscriptionId,
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
                return [
                    'url' => 'https://checkout.stripe.test/one-off/'.$subscriptionId,
                    'session_id' => 'cs_test_oneoff_'.$subscriptionId,
                ];
            }

            public function cancel(User $user, Subscription $subscription, bool $immediately = false): void
            {
                // no-op
            }

            public function resume(User $user, Subscription $subscription): void
            {
                // no-op
            }

            public function swap(User $user, Subscription $subscription, Plan $plan, string $cycle, array $options = []): ?array
            {
                // no-op
                return null;
            }

            public function billingPortal(User $user, ?string $returnUrl = null): string
            {
                return 'https://billing.stripe.test/portal/session';
            }

            public function refund(User $user, string $paymentIntentId, float $amount): array
            {
                return ['refund_id' => 're_test_fake', 'amount_refunded' => $amount];
            }
        };

        $this->app->instance(BillingProvider::class, $fake);
    }

    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    protected function actingAsEmployee(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        return $user;
    }

    protected function activateBranchViaApi(Branch $branch): void
    {
        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();
    }

    /**
     * Creates active member accounts (each consuming a seat) assigned to a
     * branch, plus their employee rows. Every linked user must have the
     * company's `company_id` set so it is counted by the seat-based guard —
     * `Employee::factory()` alone would create users with `company_id = null`,
     * which are not active seats.
     */
    protected function createActiveMemberSeats(Company $company, Branch $branch, int $count): void
    {
        $users = User::factory()->count($count)->create([
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        foreach ($users as $user) {
            $user->assignRole('employee');

            Employee::factory()->create([
                'company_id' => $company->id,
                'user_id' => $user->id,
                'branch_id' => $branch->id,
                'status' => 'active',
            ]);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | POST /api/v1/subscription/checkout
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_start_a_self_service_checkout(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create([
            'stripe_monthly_price_id' => 'price_self_checkout_monthly',
        ]);

        $response = $this->postJson('/api/v1/subscription/checkout', [
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.checkout_url', 'https://checkout.stripe.test/session/'. $response->json('data.subscription.id'))
            ->assertJsonPath('data.checkout_session_id', 'cs_test_'. $response->json('data.subscription.id'));

        // A hosted checkout must create an incomplete local row awaiting the
        // verified webhook — never a fake "active" record.
        $this->assertDatabaseHas('subscriptions', [
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'incomplete',
            'billing_cycle' => 'monthly',
        ]);
    }

    public function test_checkout_returns_422_when_plan_has_no_stripe_price(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create([
            'stripe_monthly_price_id' => null,
            'stripe_yearly_price_id' => null,
            'stripe_six_monthly_price_id' => null,
        ]);

        $this->postJson('/api/v1/subscription/checkout', [
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_checkout_cannot_bypass_downgrade_branch_allowance(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $current = Plan::factory()->create([
            'max_branches' => 6,
            'max_employees' => 40,
            'stripe_monthly_price_id' => 'price_self_current_monthly',
        ]);
        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $current->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'ends_at' => now()->addMonth(),
        ]);

        $target = Plan::factory()->create([
            'max_branches' => 3,
            'max_employees' => 25,
            'stripe_monthly_price_id' => 'price_self_target_monthly',
        ]);

        $this->actingAsCompanyAdmin($company);

        // 6 active branches exceed the target's 3-branch allowance.
        for ($i = 0; $i < 6; $i++) {
            $branch = Branch::factory()->create(['company_id' => $company->id]);
            $this->activateBranchViaApi($branch);
        }

        $this->postJson('/api/v1/subscription/checkout', [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'DOWNGRADE_BRANCH_LIMIT_EXCEEDED');

        // No checkout session may have been created for the blocked change.
        $this->assertDatabaseMissing('subscriptions', [
            'company_id' => $company->id,
            'plan_id' => $target->id,
        ]);
    }

    public function test_employee_cannot_start_a_checkout(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsEmployee($company);
        $plan = Plan::factory()->create();

        $this->postJson('/api/v1/subscription/checkout', [
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ])->assertForbidden();
    }

    /*
    |--------------------------------------------------------------------------
    | POST /api/v1/subscription/resume
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_resume_a_cancelled_subscription(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $subscription = Subscription::factory()->cancelled()->create([
            'company_id' => $company->id,
        ]);

        $this->postJson('/api/v1/subscription/resume')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.subscription.status', 'active')
            ->assertJsonPath('data.subscription.is_cancelled', false);
    }

    public function test_resume_returns_404_when_no_cancelled_subscription_exists(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/resume')->assertNotFound();
    }

    public function test_employee_cannot_resume_a_subscription(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $subscription = Subscription::factory()->cancelled()->create([
            'company_id' => $company->id,
        ]);

        $this->actingAsEmployee($company);

        $this->postJson('/api/v1/subscription/resume')
            ->assertForbidden();
    }

    /*
    |--------------------------------------------------------------------------
    | GET /api/v1/subscription/payments + GET /api/v1/subscription/invoices
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_list_self_service_payments(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'ends_at' => now()->addMonth(),
        ]);
        SubscriptionPayment::factory()->count(3)->create(['subscription_id' => $subscription->id]);

        $this->getJson('/api/v1/subscription/payments')
            ->assertOk()
            ->assertJsonCount(3, 'data.data')
            ->assertJsonPath('data.data.0.subscription_id', $subscription->id);
    }

    public function test_self_service_invoices_surface_the_same_payment_rows(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'ends_at' => now()->addMonth(),
        ]);
        SubscriptionPayment::factory()->count(2)->create(['subscription_id' => $subscription->id]);

        $this->getJson('/api/v1/subscription/invoices')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_self_service_payments_requires_an_entitled_subscription(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription/payments')->assertNotFound();
    }

    public function test_self_service_payments_still_load_after_expiry(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'status' => 'expired',
            'starts_at' => now()->subMonths(2),
            'ends_at' => now()->subMonth(),
        ]);
        SubscriptionPayment::factory()->count(2)->create(['subscription_id' => $subscription->id]);

        $this->getJson('/api/v1/subscription/payments')
            ->assertOk()
            ->assertJsonCount(2, 'data.data')
            ->assertJsonPath('data.data.0.subscription.status', 'expired')
            ->assertJsonPath('data.data.0.subscription.starts_at', $subscription->starts_at->toIso8601String())
            ->assertJsonPath('data.data.0.subscription.ends_at', $subscription->ends_at->toIso8601String());
    }

    public function test_self_service_payments_span_previous_subscriptions(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $expired = Subscription::factory()->create([
            'company_id' => $company->id,
            'status' => 'expired',
            'starts_at' => now()->subMonths(3),
            'ends_at' => now()->subMonths(2),
        ]);
        $current = Subscription::factory()->create([
            'company_id' => $company->id,
            'status' => 'active',
            'starts_at' => now()->subMonth(),
            'ends_at' => now()->addMonth(),
        ]);
        SubscriptionPayment::factory()->create(['subscription_id' => $expired->id]);
        SubscriptionPayment::factory()->create(['subscription_id' => $current->id]);

        $this->getJson('/api/v1/subscription/payments')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_employee_cannot_list_self_service_payments(): void
    {
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'ends_at' => now()->addMonth(),
        ]);
        SubscriptionPayment::factory()->create(['subscription_id' => $subscription->id]);

        $this->actingAsEmployee($company);

        $this->getJson('/api/v1/subscription/payments')->assertForbidden();
    }

    /*
    |--------------------------------------------------------------------------
    | Task 3 — subscribing below current active users is blocked
    |--------------------------------------------------------------------------
    |
    | A company that is still on trial (or locked after an expired trial) has
    | no entitled subscription, so the old pre-flight only validated plan
    | changes when an entitled subscription existed. The shared
    | `assertCanSubscribeToPlan` guard now applies the same branch / seat
    | allowance rules to every subscription entry point — including a trial
    | company subscribing to a plan with fewer seats than its active users.
    */

    public function test_trial_company_cannot_checkout_plan_below_active_users(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create(); // active trial by default
        $this->actingAsCompanyAdmin($company);

        $target = Plan::factory()->create([
            'max_branches' => 10,
            'max_employees' => 2,
            'stripe_monthly_price_id' => 'price_trial_target_monthly',
        ]);

        // The acting admin + 3 active member accounts = 4 active seats, which
        // exceeds the target plan's 2-seat allowance. The branch only needs to
        // exist (as a foreign key for the employee rows) — activation requires
        // an entitled subscription a trial company does not have yet.
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->createActiveMemberSeats($company, $branch, 3);

        $this->postJson('/api/v1/subscription/checkout', [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED')
            ->assertJsonPath('errors.used', 4)
            ->assertJsonPath('errors.capacity', 2);

        // No checkout session may have been created for the blocked plan.
        $this->assertDatabaseMissing('subscriptions', [
            'company_id' => $company->id,
            'plan_id' => $target->id,
        ]);
    }

    public function test_locked_company_cannot_checkout_plan_below_active_users(): void
    {
        $this->fakeBillingProvider();

        // An expired trial locks the company; the billing surface stays
        // reachable, but the reactivation plan must still fit current usage.
        $company = Company::factory()->trialExpired()->locked()->create();
        $this->actingAsCompanyAdmin($company);

        $target = Plan::factory()->create([
            'max_branches' => 10,
            'max_employees' => 1,
            'stripe_monthly_price_id' => 'price_locked_target_monthly',
        ]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->createActiveMemberSeats($company, $branch, 2);

        // 3 active seats (admin + 2 members) > 1 seat on the target plan.
        $this->postJson('/api/v1/subscription/checkout', [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED')
            ->assertJsonPath('errors.used', 3)
            ->assertJsonPath('errors.capacity', 1);
    }

    public function test_trial_company_can_checkout_plan_that_fits_active_users(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $target = Plan::factory()->create([
            'max_branches' => 10,
            'max_employees' => 10,
            'stripe_monthly_price_id' => 'price_trial_fit_monthly',
        ]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->createActiveMemberSeats($company, $branch, 3);

        // 4 active seats fit within the 10-seat target — checkout proceeds.
        $response = $this->postJson('/api/v1/subscription/checkout', [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ])
            ->assertCreated()
            ->assertJsonPath('success', true);

        $response->assertJsonPath(
            'data.checkout_session_id',
            'cs_test_'. $response->json('data.subscription.id')
        );
    }

    public function test_direct_subscribe_is_blocked_when_plan_below_active_users(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $target = Plan::factory()->create([
            'max_branches' => 10,
            'max_employees' => 2,
        ]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->createActiveMemberSeats($company, $branch, 3);

        // The explicit-company platform surface must apply the same guard.
        $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED')
            ->assertJsonPath('errors.used', 4)
            ->assertJsonPath('errors.capacity', 2);

        $this->assertDatabaseMissing('subscriptions', [
            'company_id' => $company->id,
            'plan_id' => $target->id,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Locked-company accessibility of the billing surface
    |--------------------------------------------------------------------------
    */

    public function test_locked_company_can_still_reach_the_self_service_billing_surface(): void
    {
        $this->fakeBillingProvider();

        // An expired trial locks the company (operational routes return 423
        // with SUBSCRIPTION_REQUIRED), but the billing surface must stay
        // reachable so the business can reactivate.
        $company = Company::factory()->trialExpired()->locked()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create([
            'stripe_monthly_price_id' => 'price_reactivate_monthly',
        ]);

        $this->postJson('/api/v1/subscription/checkout', [
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ])->assertCreated();

        $this->getJson('/api/v1/subscription/plans')->assertOk();
    }

    public function test_locked_company_operational_route_returns_subscription_required(): void
    {
        $company = Company::factory()->trialExpired()->locked()->create();
        $this->actingAsCompanyAdmin($company);

        // The standardized lock error code for operational endpoints.
        $this->getJson('/api/v1/dashboard/overview')
            ->assertStatus(423)
            ->assertJsonPath('code', 'SUBSCRIPTION_REQUIRED')
            ->assertJsonPath('data.is_locked', true);
    }

    public function test_locked_company_can_still_reach_the_billing_portal(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->trialExpired()->locked()->create();
        $this->actingAsCompanyAdmin($company);
        Subscription::factory()->create([
            'company_id' => $company->id,
            'status' => 'expired',
            'starts_at' => now()->subMonths(2),
            'ends_at' => now()->subMonth(),
        ]);

        $this->postJson('/api/v1/subscription/billing-portal')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.url', 'https://billing.stripe.test/portal/session');
    }

    public function test_expired_company_can_renew_the_same_plan_via_checkout(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create([
            'stripe_monthly_price_id' => 'price_renew_monthly',
        ]);
        $expired = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'expired',
            'billing_cycle' => 'monthly',
            'starts_at' => now()->subMonths(2),
            'ends_at' => now()->subMonth(),
        ]);

        // The renewal of the previously-subscribed (now expired) plan is a
        // fresh checkout — it must be accepted, not blocked as a "current plan".
        $response = $this->postJson('/api/v1/subscription/checkout', [
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ])->assertCreated();

        $newSubscriptionId = $response->json('data.subscription.id');
        $this->assertNotSame((string) $expired->id, (string) $newSubscriptionId);
        $this->assertDatabaseHas('subscriptions', [
            'id' => $newSubscriptionId,
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'incomplete',
        ]);
    }

    public function test_company_admin_can_retry_an_incomplete_checkout(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create([
            'stripe_monthly_price_id' => 'price_retry_monthly',
        ]);
        $pending = Subscription::factory()->incomplete()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ]);

        $response = $this->postJson('/api/v1/subscription/checkout/retry')->assertCreated();

        // The stale attempt is closed and a brand-new incomplete row (with a
        // fresh Stripe session) is opened for the SAME plan and cycle.
        $this->assertDatabaseHas('subscriptions', [
            'id' => $pending->id,
            'status' => 'expired',
        ]);

        $newSubscriptionId = $response->json('data.subscription.id');
        $this->assertNotSame((string) $pending->id, (string) $newSubscriptionId);
        $this->assertDatabaseHas('subscriptions', [
            'id' => $newSubscriptionId,
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'incomplete',
            'billing_cycle' => 'monthly',
        ]);
        $this->assertSame(
            'https://checkout.stripe.test/session/'.$newSubscriptionId,
            $response->json('data.checkout_url'),
        );
    }

    public function test_retry_returns_422_when_no_incomplete_checkout_exists(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/checkout/retry')
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_company_admin_can_discard_an_incomplete_checkout(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create([
            'stripe_monthly_price_id' => 'price_discard_monthly',
        ]);
        $pending = Subscription::factory()->incomplete()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ]);

        $this->postJson('/api/v1/subscription/checkout/discard')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.subscription.status', 'expired');

        $this->assertDatabaseHas('subscriptions', [
            'id' => $pending->id,
            'status' => 'expired',
        ]);
    }

    public function test_employee_cannot_retry_or_discard_a_checkout(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsEmployee($company);
        $plan = Plan::factory()->create([
            'stripe_monthly_price_id' => 'price_employee_monthly',
        ]);
        Subscription::factory()->incomplete()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
        ]);

        $this->postJson('/api/v1/subscription/checkout/retry')->assertForbidden();
        $this->postJson('/api/v1/subscription/checkout/discard')->assertForbidden();
    }
}
