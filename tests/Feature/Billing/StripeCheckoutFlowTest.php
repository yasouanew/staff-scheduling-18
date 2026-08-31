<?php

namespace Tests\Feature\Billing;

use App\Billing\BillingProvider;
use App\Models\Branch;
use App\Models\Company;
use App\Models\Employee;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Task 14 — Stripe Billing as the Canonical Commercial Payment Flow.
 *
 * Exercises the hosted-checkout and billing-portal surfaces without touching
 * the real Stripe API. A fake {@see BillingProvider} is bound in the container
 * so the provider boundary is exercised (the controllers / service only ever
 * depend on the contract) while every call is answered locally.
 *
 *  - checkout: company admin starts a checkout -> incomplete local row +
 *    checkout_url/checkout_session_id returned
 *  - checkout pre-flight: opening a checkout that would replace an entitled
 *    subscription is validated like an upgrade/downgrade — a checkout can never
 *    bypass the branch/employee allowance rules
 *  - billing portal: company admin with an entitled subscription gets a portal
 *    session url; employees are forbidden; unsubscribed businesses get 404
 */
class StripeCheckoutFlowTest extends TestCase
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

            public function cancel(User $user, Subscription $subscription, bool $immediately = false): void
            {
                // no-op
            }

            public function resume(User $user, Subscription $subscription): void
            {
                // no-op
            }

            public function swap(User $user, Subscription $subscription, Plan $plan, string $cycle): void
            {
                // no-op
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

    /*
    |--------------------------------------------------------------------------
    | Checkout — POST /api/v1/companies/{company}/subscriptions {checkout: true}
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_start_a_checkout(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create([
            'stripe_monthly_price_id' => 'price_checkout_monthly',
        ]);

        $response = $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
            'checkout' => true,
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

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
            'checkout' => true,
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_checkout_requires_a_valid_plan(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => 999999,
            'billing_cycle' => 'monthly',
            'checkout' => true,
        ])->assertUnprocessable()->assertJsonValidationErrors('plan_id');
    }

    public function test_checkout_cannot_bypass_downgrade_branch_allowance(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $current = Plan::factory()->create([
            'max_branches' => 6,
            'max_employees' => 40,
            'stripe_monthly_price_id' => 'price_current_monthly',
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
            'stripe_monthly_price_id' => 'price_target_monthly',
        ]);

        $this->actingAsCompanyAdmin($company);

        // 6 active branches exceed the target's 3-branch allowance.
        for ($i = 0; $i < 6; $i++) {
            $branch = Branch::factory()->create(['company_id' => $company->id]);
            $this->activateBranchViaApi($branch);
        }

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
            'checkout' => true,
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'DOWNGRADE_BRANCH_LIMIT_EXCEEDED')
            ->assertJsonPath('errors.used', 6)
            ->assertJsonPath('errors.limit', 3);

        // No checkout session may have been created for the blocked change.
        $this->assertDatabaseMissing('subscriptions', [
            'company_id' => $company->id,
            'plan_id' => $target->id,
        ]);
    }

    public function test_checkout_cannot_bypass_downgrade_employee_capacity(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $current = Plan::factory()->create([
            'max_branches' => 10,
            'max_employees' => 40,
            'stripe_monthly_price_id' => 'price_current_capacity_monthly',
        ]);
        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $current->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'ends_at' => now()->addMonth(),
        ]);

        $target = Plan::factory()->create([
            'max_branches' => 10,
            'max_employees' => 25,
            'stripe_monthly_price_id' => 'price_target_capacity_monthly',
        ]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);
        $this->activateBranchViaApi($branch);

        // 40 active employees exceed the target's 25 capacity.
        Employee::factory()->count(40)->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
        ]);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
            'checkout' => true,
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED')
            ->assertJsonPath('errors.used', 40)
            ->assertJsonPath('errors.capacity', 25);

        $this->assertDatabaseMissing('subscriptions', [
            'company_id' => $company->id,
            'plan_id' => $target->id,
        ]);
    }

    public function test_checkout_allows_upgrade_when_usage_fits_target_limits(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $current = Plan::factory()->create([
            'max_branches' => 3,
            'max_employees' => 25,
            'stripe_monthly_price_id' => 'price_small_monthly',
        ]);
        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $current->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'ends_at' => now()->addMonth(),
        ]);

        $target = Plan::factory()->create([
            'max_branches' => 10,
            'max_employees' => 100,
            'stripe_monthly_price_id' => 'price_large_monthly',
        ]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);
        $this->activateBranchViaApi($branch);
        Employee::factory()->count(5)->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
        ]);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
            'checkout' => true,
        ])->assertCreated()->assertJsonPath('success', true);
    }

    /*
    |--------------------------------------------------------------------------
    | Billing portal — POST /api/v1/subscription/billing-portal
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_open_the_billing_portal(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        Subscription::factory()->create([
            'company_id' => $company->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $this->postJson('/api/v1/subscription/billing-portal')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.url', 'https://billing.stripe.test/portal/session');
    }

    public function test_employee_cannot_open_the_billing_portal(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsEmployee($company);
        Subscription::factory()->create([
            'company_id' => $company->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $this->postJson('/api/v1/subscription/billing-portal')
            ->assertForbidden();
    }

    public function test_billing_portal_requires_an_entitled_subscription(): void
    {
        $this->fakeBillingProvider();

        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/billing-portal')
            ->assertNotFound();
    }
}
