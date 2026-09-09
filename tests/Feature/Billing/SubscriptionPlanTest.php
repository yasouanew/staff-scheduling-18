<?php

namespace Tests\Feature\Billing;

use App\Enums\Feature;
use App\Models\Branch;
use App\Models\BranchSubscription;
use App\Models\Company;
use App\Models\Employee;
use App\Models\Plan;
use App\Models\PlanFeature;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * End-to-end coverage for the authenticated business's own subscription
 * management surface (`/api/v1/subscription*`):
 *
 *   GET   subscription           current plan / status / trial / usage / features
 *   GET   subscription/plans     active plan catalogue (database pricing)
 *   GET   subscription/usage     branch + per-branch employee usage
 *   GET   subscription/features  feature access for the current plan
 *   POST  subscription/upgrade   switch to a larger / equal plan
 *   POST  subscription/downgrade switch to a smaller plan (usage-validated)
 *   POST  subscription/cancel    cancel the subscription
 *
 * Plus the Task 4 branch lifecycle endpoints that ship alongside them
 * (activate / deactivate / capacity), all exercised through the API.
 */
class SubscriptionPlanTest extends TestCase
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

    protected function makeCompanyWithActiveSubscription(array $planOverrides = []): array
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create(array_merge([
            'max_branches' => 3,
            'max_employees' => 25,
            'description' => 'Test plan',
            'currency' => 'AUD',
            'price_monthly' => 29.00,
            'price_yearly' => 290.00,
            'price_six_monthly' => 159.00,
        ], $planOverrides));

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'ends_at' => now()->addMonth(),
        ]);

        return [$company, $plan, $subscription];
    }

    protected function planWithFeatures(Plan $plan, array $features): Plan
    {
        foreach ($features as $feature) {
            $featureModel = \App\Models\Feature::create([
                'key' => $feature->value,
                'label' => $feature->label(),
                'is_active' => true,
            ]);

            PlanFeature::create([
                'plan_id' => $plan->id,
                'feature_id' => $featureModel->id,
                'is_enabled' => true,
            ]);
        }

        return $plan;
    }

    protected function activateBranchViaApi(Branch $branch): void
    {
        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();
    }

    /**
     * Creates active member accounts (each consuming a seat) assigned to a
     * branch, plus their employee rows. Every linked user must have the
     * company's `company_id` set so it is counted by the seat-based downgrade
     * guard — `Employee::factory()` alone would create users with
     * `company_id = null`, which are not active seats.
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
    | GET /api/v1/subscription
    |--------------------------------------------------------------------------
    */

    public function test_guest_cannot_access_subscription(): void
    {
        $this->getJson('/api/v1/subscription')->assertUnauthorized();
    }

    public function test_company_admin_can_view_their_subscription_summary(): void
    {
        [$company, $plan, $subscription] = $this->makeCompanyWithActiveSubscription();

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.plan.name', $plan->name)
            ->assertJsonPath('data.plan.slug', $plan->slug)
            ->assertJsonPath('data.plan.description', $plan->description)
            ->assertJsonPath('data.plan.currency', 'AUD')
            ->assertJsonPath('data.plan.max_branches', 3)
            ->assertJsonPath('data.plan.max_employees', 25)
            ->assertJsonPath('data.subscription.id', $subscription->id)
            ->assertJsonPath('data.subscription.status', 'active')
            ->assertJsonPath('data.subscription.billing_cycle', 'monthly')
            ->assertJsonPath('data.subscription.is_active', true)
            ->assertJsonPath('data.entitled', true)
            ->assertJsonMissingPath('data.plan.stripe_product_id')
            ->assertJsonMissingPath('data.subscription.stripe_id');
    }

    public function test_subscription_summary_reports_no_plan_when_unsubscribed(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription')
            ->assertOk()
            ->assertJsonPath('data.plan', null)
            ->assertJsonPath('data.subscription', null)
            ->assertJsonPath('data.entitled', false);
    }

    public function test_subscription_summary_still_loads_after_expiry(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $plan = Plan::factory()->create([
            'name' => 'Growth',
            'currency' => 'AUD',
            'price_monthly' => 29.00,
            'price_yearly' => 290.00,
            'price_six_monthly' => 159.00,
        ]);
        $expired = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'expired',
            'billing_cycle' => 'monthly',
            'starts_at' => now()->subMonths(2),
            'ends_at' => now()->subMonth(),
        ]);

        $this->getJson('/api/v1/subscription')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.subscription.id', $expired->id)
            ->assertJsonPath('data.subscription.status', 'expired')
            ->assertJsonPath('data.subscription.starts_at', $expired->starts_at->toIso8601String())
            ->assertJsonPath('data.subscription.ends_at', $expired->ends_at->toIso8601String())
            ->assertJsonPath('data.plan.name', 'Growth')
            ->assertJsonPath('data.entitled', false)
            ->assertJsonPath('data.subscription_history.0.id', $expired->id)
            ->assertJsonPath('data.subscription_history.0.status', 'expired')
            ->assertJsonPath('data.subscription_history.0.plan_name', 'Growth')
            ->assertJsonPath('data.subscription_history.0.is_current', true);
    }

    public function test_subscription_summary_includes_trial_information(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'trialing',
            'trial_ends_at' => now()->addDays(10),
        ]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription')
            ->assertOk()
            ->assertJsonPath('data.subscription.on_trial', true)
            ->assertJsonPath('data.subscription.status', 'trialing')
            ->assertJsonPath('data.trial.active', true);
    }

    /*
    |--------------------------------------------------------------------------
    | GET /api/v1/subscription/plans
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_list_active_plans(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $active = Plan::factory()->create([
            'name' => 'Starter',
            'slug' => 'starter',
            'description' => 'For growing teams',
            'currency' => 'AUD',
            'price_monthly' => 29.00,
            'price_yearly' => 290.00,
            'price_six_monthly' => 159.00,
            'max_branches' => 3,
            'max_employees' => 25,
            'is_active' => true,
        ]);

        Plan::factory()->create(['is_active' => false]);

        $this->getJson('/api/v1/subscription/plans')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', $active->name)
            ->assertJsonPath('data.0.slug', 'starter')
            ->assertJsonPath('data.0.description', 'For growing teams')
            ->assertJsonPath('data.0.currency', 'AUD')
            ->assertJsonPath('data.0.max_branches', 3)
            ->assertJsonPath('data.0.max_employees', 25)
            ->assertJsonMissingPath('data.0.stripe_monthly_price_id');
    }

    /*
    |--------------------------------------------------------------------------
    | GET /api/v1/subscription/usage
    |--------------------------------------------------------------------------
    */

    public function test_subscription_usage_reports_branch_and_capacity(): void
    {
        [$company, $plan] = $this->makeCompanyWithActiveSubscription([
            'max_branches' => 3,
            'max_employees' => 25,
        ]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);
        $this->activateBranchViaApi($branch);

        $this->createActiveMemberSeats($company, $branch, 5);

        $this->getJson('/api/v1/subscription/usage')
            ->assertOk()
            ->assertJsonPath('data.branches.used', 1)
            ->assertJsonPath('data.branches.limit', 3)
            ->assertJsonCount(1, 'data.branches_usage')
            ->assertJsonPath('data.branches_usage.0.id', $branch->id)
            ->assertJsonPath('data.branches_usage.0.name', $branch->name)
            ->assertJsonPath('data.branches_usage.0.active', true)
            ->assertJsonPath('data.branches_usage.0.employees_used', 5)
            ->assertJsonPath('data.branches_usage.0.employee_capacity', 25)
            ->assertJsonPath('data.branches_usage.0.remaining', 20);
    }

    /*
    |--------------------------------------------------------------------------
    | GET /api/v1/subscription/features
    |--------------------------------------------------------------------------
    */

    public function test_subscription_features_reports_plan_access(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures(
            Plan::factory()->create(),
            [Feature::Roster, Feature::AdvancedReporting]
        );

        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription/features')
            ->assertOk()
            ->assertJsonPath('data.entitled', true)
            ->assertJsonPath('data.plan.slug', $plan->slug)
            ->assertJsonPath('data.features.0.key', 'roster')
            ->assertJsonPath('data.features.0.enabled', true)
            ->assertJsonPath('data.features.0.branch_scoped', true);
    }

    public function test_subscription_features_reports_unavailable_when_unsubscribed(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription/features')
            ->assertOk()
            ->assertJsonPath('data.entitled', false)
            ->assertJsonPath('data.plan', null);
    }

    /*
    |--------------------------------------------------------------------------
    | Permissions: billing access
    |--------------------------------------------------------------------------
    */

    public function test_employee_cannot_view_subscription(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsEmployee($company);

        $this->getJson('/api/v1/subscription')->assertForbidden();
    }

    public function test_employee_cannot_upgrade_subscription(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsEmployee($company);

        $target = Plan::factory()->create(['max_branches' => 10, 'max_employees' => 100]);

        $this->postJson('/api/v1/subscription/upgrade', [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ])->assertForbidden();

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $subscription->plan_id,
        ]);
    }

    public function test_employee_cannot_cancel_subscription(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsEmployee($company);

        $this->postJson('/api/v1/subscription/cancel')->assertForbidden();
    }

    public function test_employee_cannot_view_plans_or_features(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsEmployee($company);

        $this->getJson('/api/v1/subscription/plans')->assertForbidden();
        $this->getJson('/api/v1/subscription/features')->assertForbidden();
    }

    /*
    |--------------------------------------------------------------------------
    | POST /api/v1/subscription/upgrade
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_upgrade_to_a_larger_plan(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription([
            'max_branches' => 3,
            'max_employees' => 25,
        ]);

        $target = Plan::factory()->create([
            'max_branches' => 10,
            'max_employees' => 100,
            'description' => 'Bigger plan',
        ]);

        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/upgrade', [
            'plan_id' => $target->id,
            'billing_cycle' => 'yearly',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.subscription.plan.id', $target->id)
            ->assertJsonPath('data.subscription.plan.name', $target->name)
            ->assertJsonPath('data.subscription.subscription.billing_cycle', 'yearly');

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $target->id,
            'billing_cycle' => 'yearly',
        ]);
    }

    public function test_upgrade_requires_a_valid_plan(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/upgrade', [
            'plan_id' => 999999,
        ])->assertUnprocessable()->assertJsonValidationErrors('plan_id');
    }

    public function test_upgrade_requires_an_active_subscription(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $target = Plan::factory()->create();

        $this->postJson('/api/v1/subscription/upgrade', [
            'plan_id' => $target->id,
        ])->assertNotFound();
    }

    /*
    |--------------------------------------------------------------------------
    | POST /api/v1/subscription/downgrade
    |--------------------------------------------------------------------------
    */

    public function test_downgrade_is_rejected_when_active_branches_exceed_new_limit(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription([
            'max_branches' => 6,
            'max_employees' => 40,
        ]);

        $target = Plan::factory()->create(['max_branches' => 3, 'max_employees' => 25]);

        $this->actingAsCompanyAdmin($company);

        // Activate 6 branches so the business exceeds the target's 3-branch cap.
        for ($i = 0; $i < 6; $i++) {
            $branch = Branch::factory()->create(['company_id' => $company->id]);
            $this->activateBranchViaApi($branch);
        }

        $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $target->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'DOWNGRADE_BRANCH_LIMIT_EXCEEDED')
            ->assertJsonPath('errors.used', 6)
            ->assertJsonPath('errors.limit', 3);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $subscription->plan_id,
        ]);
    }

    public function test_downgrade_is_rejected_when_active_employees_exceed_new_capacity(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription([
            'max_branches' => 10,
            'max_employees' => 40,
        ]);

        $target = Plan::factory()->create(['max_branches' => 10, 'max_employees' => 25]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);
        $this->activateBranchViaApi($branch);

        // 40 active members with linked company accounts (each consumes a seat)
        // => 41 active seats > 25 capacity on the target plan.
        $this->createActiveMemberSeats($company, $branch, 40);

        $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $target->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED')
            ->assertJsonPath('errors.used', 41)
            ->assertJsonPath('errors.capacity', 25);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $subscription->plan_id,
        ]);
    }

    public function test_downgrade_succeeds_when_usage_fits_within_new_limits(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription([
            'max_branches' => 5,
            'max_employees' => 30,
        ]);

        $target = Plan::factory()->create(['max_branches' => 3, 'max_employees' => 25]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);
        $this->activateBranchViaApi($branch);

        // Only 1 active branch and 5 member accounts — 6 active seats fit
        // within the 3-branch / 25-seat target.
        $this->createActiveMemberSeats($company, $branch, 5);

        $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $target->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.subscription.plan.id', $target->id)
            ->assertJsonPath('data.subscription.plan.max_branches', 3)
            ->assertJsonPath('data.subscription.plan.max_employees', 25);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $target->id,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | POST /api/v1/subscription/billing-period
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_change_billing_period_without_changing_plan(): void
    {
        [$company, $plan, $subscription] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/billing-period', [
            'billing_cycle' => 'yearly',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.subscription.billing_cycle', 'yearly');

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $plan->id,
            'billing_cycle' => 'yearly',
        ]);
    }

    public function test_billing_period_requires_a_valid_cycle(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/billing-period', [
            'billing_cycle' => 'fortnightly',
        ])->assertUnprocessable()->assertJsonValidationErrors('billing_cycle');
    }

    public function test_employee_cannot_change_billing_period(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsEmployee($company);

        $this->postJson('/api/v1/subscription/billing-period', [
            'billing_cycle' => 'yearly',
        ])->assertForbidden();
    }

    /*
    |--------------------------------------------------------------------------
    | POST /api/v1/subscription/cancel
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_cancel_the_subscription(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/cancel')
            ->assertOk()
            ->assertJsonPath('data.subscription.is_cancelled', true)
            ->assertJsonPath('data.subscription.cancelled_at', fn ($value) => is_string($value));

        $this->assertNotNull($subscription->fresh()->cancelled_at);
    }

    public function test_cancel_requires_an_active_subscription(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/cancel')->assertNotFound();
    }

    /*
    |--------------------------------------------------------------------------
    | Cross-business access
    |--------------------------------------------------------------------------
    */

    public function test_user_cannot_act_on_another_company_subscription_state(): void
    {
        $ownCompany = Company::factory()->create();
        $this->actingAsCompanyAdmin($ownCompany);

        $otherCompany = Company::factory()->create();
        $otherPlan = Plan::factory()->create();

        Subscription::factory()->create([
            'company_id' => $otherCompany->id,
            'plan_id' => $otherPlan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        // The "my subscription" surface is always scoped to the caller's own
        // company, so it can never report or mutate another business's state.
        $this->getJson('/api/v1/subscription')
            ->assertOk()
            ->assertJsonPath('data.plan', null)
            ->assertJsonPath('data.entitled', false);

        $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $otherPlan->id,
        ])->assertNotFound();
    }

    /*
    |--------------------------------------------------------------------------
    | Branch lifecycle (Task 4 endpoints shipped alongside subscription APIs)
    |--------------------------------------------------------------------------
    */

    public function test_branch_can_be_activated_and_deactivated(): void
    {
        [$company, $plan] = $this->makeCompanyWithActiveSubscription([
            'max_branches' => 3,
            'max_employees' => 25,
        ]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->postJson("/api/v1/branches/{$branch->id}/activate")
            ->assertOk()
            ->assertJsonPath('data.branch_subscription.status', 'active')
            ->assertJsonPath('data.branch_subscription.employee_capacity', 25)
            ->assertJsonPath('data.usage.branches.used', 1);

        $this->assertDatabaseHas('branch_subscriptions', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'status' => 'active',
        ]);

        $this->postJson("/api/v1/branches/{$branch->id}/deactivate")
            ->assertOk()
            ->assertJsonPath('data.branch_subscription.status', 'cancelled')
            ->assertJsonPath('data.usage.branches.used', 0);

        $this->assertDatabaseHas('branch_subscriptions', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'status' => 'cancelled',
        ]);
    }

    public function test_branch_capacity_can_be_updated(): void
    {
        [$company, $plan] = $this->makeCompanyWithActiveSubscription([
            'max_branches' => 3,
            'max_employees' => 25,
        ]);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);
        $this->activateBranchViaApi($branch);

        $this->putJson("/api/v1/branches/{$branch->id}/capacity", [
            'employee_capacity' => 50,
        ])
            ->assertOk()
            ->assertJsonPath('data.branch_subscription.employee_capacity', 50)
            ->assertJsonPath('data.usage.branches.used', 1);
    }

    public function test_branch_activation_is_rejected_for_another_company(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($company);

        $otherCompany = Company::factory()->create();
        $otherBranch = Branch::factory()->create(['company_id' => $otherCompany->id]);

        $this->postJson("/api/v1/branches/{$otherBranch->id}/activate")
            ->assertForbidden();

        $this->assertDatabaseMissing('branch_subscriptions', [
            'branch_id' => $otherBranch->id,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | GET /api/v1/subscription/plan-change
    |--------------------------------------------------------------------------
    */

    /**
     * The estimate is computed against the SELECTED target plan (not the
     * current one), so an upgrade must produce a positive prorated charge
     * equal to (newPrice - oldPrice) * elapsed, and the renewal date must
     * stay exactly the same as the subscription's `ends_at`.
     */
    public function test_company_admin_can_fetch_plan_change_estimate_for_upgrade(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-01-16 00:00:00'));

        [$company, $currentPlan, $subscription] = $this->makeCompanyWithActiveSubscription([
            'price_monthly' => 29.00,
            'price_yearly' => 290.00,
        ]);

        // 30-day period, 15 days elapsed => elapsed fraction = 0.5.
        $subscription->update([
            'starts_at' => Carbon::parse('2026-01-01 00:00:00'),
            'ends_at' => Carbon::parse('2026-01-31 00:00:00'),
        ]);

        $target = Plan::factory()->create([
            'price_monthly' => 49.00,
            'price_yearly' => 490.00,
            'currency' => 'AUD',
        ]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription/plan-change?'.http_build_query([
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ]))
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.amount_due', 10)
            ->assertJsonPath('data.currency', 'AUD')
            ->assertJsonPath('data.elapsed', 0.5)
            ->assertJsonPath('data.renews_at', $subscription->ends_at->toIso8601String());

        // The current plan is untouched — this is a read-only estimate.
        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $currentPlan->id,
        ]);
    }

    /**
     * A downgrade produces a negative amount (a credit toward the next
     * renewal), still preserving the renewal date.
     */
    public function test_plan_change_estimate_reports_downgrade_credit(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-01-16 00:00:00'));

        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription([
            'price_monthly' => 49.00,
            'price_yearly' => 490.00,
        ]);

        $subscription->update([
            'starts_at' => Carbon::parse('2026-01-01 00:00:00'),
            'ends_at' => Carbon::parse('2026-01-31 00:00:00'),
        ]);

        $target = Plan::factory()->create([
            'price_monthly' => 29.00,
            'price_yearly' => 290.00,
            'currency' => 'AUD',
        ]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription/plan-change?'.http_build_query([
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ]))
            ->assertOk()
            ->assertJsonPath('data.amount_due', -10)
            ->assertJsonPath('data.elapsed', 0.5)
            ->assertJsonPath('data.renews_at', $subscription->ends_at->toIso8601String());
    }

    /**
     * Switching to the same plan (or a plan priced identically for the cycle)
     * yields a zero amount due — nothing to pay, expiry unchanged.
     */
    public function test_plan_change_estimate_is_zero_for_same_plan(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-01-16 00:00:00'));

        [$company, $currentPlan, $subscription] = $this->makeCompanyWithActiveSubscription([
            'price_monthly' => 29.00,
        ]);

        $subscription->update([
            'starts_at' => Carbon::parse('2026-01-01 00:00:00'),
            'ends_at' => Carbon::parse('2026-01-31 00:00:00'),
        ]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription/plan-change?'.http_build_query([
            'plan_id' => $currentPlan->id,
            'billing_cycle' => 'monthly',
        ]))
            ->assertOk()
            ->assertJsonPath('data.amount_due', 0)
            ->assertJsonPath('data.elapsed', 0.5)
            ->assertJsonPath('data.renews_at', $subscription->ends_at->toIso8601String());
    }

    public function test_plan_change_estimate_requires_a_valid_plan(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription/plan-change?plan_id=999999')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('plan_id');
    }

    public function test_plan_change_estimate_requires_an_active_subscription(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $target = Plan::factory()->create();

        $this->getJson('/api/v1/subscription/plan-change?'.http_build_query([
            'plan_id' => $target->id,
        ]))->assertNotFound();
    }

    public function test_employee_cannot_fetch_plan_change_estimate(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $target = Plan::factory()->create();
        $this->actingAsEmployee($company);

        $this->getJson('/api/v1/subscription/plan-change?'.http_build_query([
            'plan_id' => $target->id,
        ]))->assertForbidden();
    }
}
