<?php

namespace Tests\Feature\Billing;

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

class SubscriptionManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['subscription.view', 'subscription.manage', 'subscription.refund'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['subscription.view', 'subscription.manage', 'subscription.refund']);

        Role::findOrCreate('employee', 'web');
    }

    /**
     * Create a company admin bound to a company, authenticated via Sanctum.
     */
    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_guest_cannot_list_subscriptions(): void
    {
        $company = Company::factory()->create();

        $this->getJson("/api/v1/companies/{$company->id}/subscriptions")
            ->assertUnauthorized();
    }

    public function test_company_admin_can_list_own_company_subscriptions(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        Subscription::factory()->count(2)->create(['company_id' => $company->id]);

        $this->getJson("/api/v1/companies/{$company->id}/subscriptions")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_cannot_list_other_company_subscriptions(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/companies/{$otherCompany->id}/subscriptions")
            ->assertForbidden();
    }

    public function test_company_admin_can_subscribe_to_a_plan(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create();

        $response = $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.billing_cycle', 'monthly');

        $this->assertDatabaseHas('subscriptions', [
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
        ]);
    }

    public function test_subscribing_with_a_trial_sets_trialing_status(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create();

        $response = $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => $plan->id,
            'billing_cycle' => 'yearly',
            'trial_days' => 14,
        ]);

        $response->assertCreated()->assertJsonPath('data.status', 'trialing');
    }

    public function test_subscribe_requires_a_valid_plan(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => 999999,
            'billing_cycle' => 'monthly',
        ])->assertUnprocessable()->assertJsonValidationErrors('plan_id');
    }

    public function test_company_admin_can_cancel_a_subscription(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/cancel", [
            'immediately' => true,
        ])->assertOk()->assertJsonPath('data.status', 'cancelled');

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => 'cancelled',
        ]);
    }

    public function test_company_admin_can_resume_a_cancelled_subscription(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $subscription = Subscription::factory()->cancelled()->create(['company_id' => $company->id]);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/resume")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
    }

    public function test_resuming_an_active_subscription_is_rejected(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/resume")
            ->assertStatus(422);
    }

    public function test_company_admin_can_swap_plans(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $oldPlan = Plan::factory()->create();
        $newPlan = Plan::factory()->create();
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $oldPlan->id,
        ]);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/swap", [
            'plan_id' => $newPlan->id,
            'billing_cycle' => 'yearly',
        ])->assertOk()->assertJsonPath('data.billing_cycle', 'yearly');

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $newPlan->id,
        ]);
    }

    public function test_company_admin_can_list_subscription_payments(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);
        SubscriptionPayment::factory()->count(3)->create(['subscription_id' => $subscription->id]);

        $this->getJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/payments")
            ->assertOk()
            ->assertJsonCount(3, 'data.data');
    }

    public function test_refunding_a_non_refundable_payment_is_rejected(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);

        // Pending payment without a Stripe intent is not refundable.
        $payment = SubscriptionPayment::factory()->pending()->create([
            'subscription_id' => $subscription->id,
        ]);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/payments/{$payment->id}/refund")
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_employee_cannot_manage_subscriptions(): void
    {
        $company = Company::factory()->create();
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $plan = Plan::factory()->create();

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions", [
            'plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ])->assertForbidden();
    }
}
