<?php

namespace Tests\Feature\Security;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Employee;
use App\Models\Plan;
use App\Models\Roster;
use App\Models\Shift;
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
 * Three-role security audit.
 *
 * This suite mirrors the ACTUAL Phase 1 role matrix from
 * {@see \Database\Seeders\RoleAndPermissionSeeder} — the same roles and the
 * same permission grants (including the SUPERADMIN-ONLY `subscription.refund`):
 *
 *   - super_admin  → every permission
 *   - company_admin→ every permission EXCEPT company.create, company.delete
 *                    and subscription.refund (refunds are platform-only)
 *   - scheduler    → view on branch/employee/department/position; full roster
 *                    and shift management + publish; leave view/approve/reject;
 *                    report.view — NO subscription, billing, plan or branch
 *                    activation/capacity permissions
 *   - employee     → shift.view, roster.view, leave_request.view/create
 *
 * Coverage maps to the audit sections:
 *   1. Tenant isolation — a company admin can never touch another company's
 *      subscription, payments, branches, employees, rosters or shifts.
 *   2. Schedular restrictions — no plan upgrade/downgrade, no billing cancel,
 *      no billing portal/period, no refund, no paid branch activation, no
 *      billable capacity change.
 *   3. Billing/payment permissions — company admins manage their own billing
 *      but CANNOT refund; only super admins can refund.
 *   4. Plan administration — super-admin only; tenants are view-only.
 *   5. Superadmin scoping — the platform bypass is scoped to platform routes;
 *      it never grants a tenant the same reach.
 */
class RoleAccessControlTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // The exact permission set defined by the seeder.
        $permissions = [
            'company.view', 'company.create', 'company.edit', 'company.delete',
            'branch.view', 'branch.create', 'branch.edit', 'branch.delete',
            'user.view', 'user.create', 'user.edit', 'user.delete',
            'employee.view', 'employee.create', 'employee.edit', 'employee.delete',
            'department.view', 'department.create', 'department.edit', 'department.delete',
            'position.view', 'position.create', 'position.edit', 'position.delete',
            'roster.view', 'roster.create', 'roster.edit', 'roster.delete', 'roster.publish',
            'shift.view', 'shift.create', 'shift.edit', 'shift.delete',
            'shift_template.view', 'shift_template.create', 'shift_template.edit', 'shift_template.delete',
            'leave_type.view', 'leave_type.create', 'leave_type.edit', 'leave_type.delete',
            'leave_request.view', 'leave_request.create', 'leave_request.approve', 'leave_request.reject',
            'subscription.view', 'subscription.manage', 'subscription.refund',
            'report.view',
            'settings.view', 'settings.edit',
        ];

        foreach ($permissions as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(
            Permission::whereNotIn('name', [
                'company.create', 'company.delete', 'subscription.refund',
            ])->pluck('name')->all()
        );

        $scheduler = Role::findOrCreate('scheduler', 'web');
        $scheduler->syncPermissions([
            'branch.view',
            'employee.view',
            'department.view',
            'position.view',
            'roster.view', 'roster.create', 'roster.edit', 'roster.publish',
            'shift.view', 'shift.create', 'shift.edit', 'shift.delete',
            'shift_template.view', 'shift_template.create', 'shift_template.edit',
            'leave_request.view', 'leave_request.approve', 'leave_request.reject',
            'report.view',
        ]);

        $employee = Role::findOrCreate('employee', 'web');
        $employee->syncPermissions([
            'shift.view',
            'roster.view',
            'leave_request.view', 'leave_request.create',
        ]);
    }

    // ------------------------------------------------------------------ setup

    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    protected function actingAsScheduler(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('scheduler');
        Sanctum::actingAs($user);

        return $user;
    }

    protected function actingAsSuperAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole('super_admin');
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

    /**
     * Create a company with an active subscription on a plan with generous
     * allowances, and an active branch ready to be used.
     *
     * @return array{0: Company, 1: Plan, 2: Subscription, 3: Branch}
     */
    protected function makeCompanyWithActiveSubscription(array $planOverrides = []): array
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create(array_merge([
            'max_branches' => 3,
            'max_employees' => 25,
            'description' => 'Audit plan',
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
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        return [$company, $plan, $subscription, $branch];
    }

    protected function activateBranchViaApi(Branch $branch): void
    {
        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();
    }

    /**
     * Bind a no-op billing provider so provider-backed operations (refunds,
     * billing portal) run without real Stripe credentials in tests.
     */
    protected function fakeBillingProvider(): void
    {
        $this->app->instance(
            \App\Billing\BillingProvider::class,
            new class implements \App\Billing\BillingProvider
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
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | 1. Tenant isolation — cross-company access with malicious IDs
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_cannot_view_another_companys_subscription(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany, , $otherSubscription] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/companies/{$otherCompany->id}/subscriptions/{$otherSubscription->id}")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_list_another_companys_subscriptions(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/companies/{$otherCompany->id}/subscriptions")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_list_another_companys_payments(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany, , $otherSubscription] = $this->makeCompanyWithActiveSubscription();
        SubscriptionPayment::factory()->count(2)->create(['subscription_id' => $otherSubscription->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/companies/{$otherCompany->id}/subscriptions/{$otherSubscription->id}/payments")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_view_another_companys_branch(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany, , , $otherBranch] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/branches/{$otherBranch->id}")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_update_another_companys_branch(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany, , , $otherBranch] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($ownCompany);

        $this->putJson("/api/v1/branches/{$otherBranch->id}", ['name' => 'Hijacked'])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_view_another_companys_employee(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany] = $this->makeCompanyWithActiveSubscription();
        $otherEmployee = Employee::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/employees/{$otherEmployee->id}")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_edit_another_companys_employee(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany] = $this->makeCompanyWithActiveSubscription();
        $otherEmployee = Employee::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->putJson("/api/v1/employees/{$otherEmployee->id}", ['first_name' => 'Hijacked'])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_view_another_companys_roster(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany, , , $otherBranch] = $this->makeCompanyWithActiveSubscription();
        $otherRoster = Roster::factory()->create([
            'company_id' => $otherCompany->id,
            'branch_id' => $otherBranch->id,
        ]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/rosters/{$otherRoster->id}")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_view_another_companys_shift(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany, , , $otherBranch] = $this->makeCompanyWithActiveSubscription();
        $otherRoster = Roster::factory()->create([
            'company_id' => $otherCompany->id,
            'branch_id' => $otherBranch->id,
        ]);
        $otherShift = Shift::factory()->create([
            'company_id' => $otherCompany->id,
            'branch_id' => $otherBranch->id,
            'roster_id' => $otherRoster->id,
        ]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/shifts/{$otherShift->id}")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_view_another_companys_profile(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($ownCompany);

        // GET /companies/{company} sits outside company.access but is guarded by
        // the CompanyPolicy (belongsToCompany), so it must still be forbidden.
        $this->getJson("/api/v1/companies/{$otherCompany->id}")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_update_another_companys_settings(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($ownCompany);

        $this->putJson("/api/v1/companies/{$otherCompany->id}/settings", ['timezone' => 'UTC'])
            ->assertForbidden();
    }

    public function test_scheduler_cannot_access_another_companys_branch(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany, , , $otherBranch] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($ownCompany);

        $this->getJson("/api/v1/branches/{$otherBranch->id}")
            ->assertForbidden();
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Schedular restrictions — no billing, no refund, no branch capacity
    |--------------------------------------------------------------------------
    */

    public function test_scheduler_cannot_view_the_subscription(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($company);

        $this->getJson('/api/v1/subscription')
            ->assertForbidden();
    }

    public function test_scheduler_cannot_upgrade_the_subscription(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $target = Plan::factory()->create(['max_branches' => 10, 'max_employees' => 100]);
        $this->actingAsScheduler($company);

        $this->postJson('/api/v1/subscription/upgrade', [
            'plan_id' => $target->id,
            'billing_cycle' => 'yearly',
        ])->assertForbidden();

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $subscription->plan_id,
        ]);
    }

    public function test_scheduler_cannot_downgrade_the_subscription(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $target = Plan::factory()->create(['max_branches' => 1, 'max_employees' => 5]);
        $this->actingAsScheduler($company);

        $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $target->id,
            'billing_cycle' => 'monthly',
        ])->assertForbidden();
    }

    public function test_scheduler_cannot_cancel_the_subscription(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($company);

        $this->postJson('/api/v1/subscription/cancel', ['immediately' => true])
            ->assertForbidden();

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => 'active',
        ]);
    }

    public function test_scheduler_cannot_change_the_billing_period(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($company);

        $this->postJson('/api/v1/subscription/billing-period', ['billing_cycle' => 'yearly'])
            ->assertForbidden();

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'billing_cycle' => 'monthly',
        ]);
    }

    public function test_scheduler_cannot_open_the_billing_portal(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($company);

        $this->postJson('/api/v1/subscription/billing-portal')
            ->assertForbidden();
    }

    public function test_scheduler_cannot_list_plans(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($company);

        $this->getJson('/api/v1/plans')->assertForbidden();
    }

    public function test_scheduler_cannot_refund_a_payment(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $payment = SubscriptionPayment::factory()->create(['subscription_id' => $subscription->id]);
        $this->actingAsScheduler($company);

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/payments/{$payment->id}/refund")
            ->assertForbidden();
    }

    public function test_scheduler_cannot_activate_a_branch(): void
    {
        [$company, , , $branch] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($company);

        $this->postJson("/api/v1/branches/{$branch->id}/activate")
            ->assertForbidden();

        $this->assertDatabaseMissing('branch_subscriptions', ['branch_id' => $branch->id]);
    }

    public function test_scheduler_cannot_deactivate_a_branch(): void
    {
        [$company, , , $branch] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($company);
        $this->activateBranchViaApi($branch);

        $this->actingAsScheduler($company);
        $this->postJson("/api/v1/branches/{$branch->id}/deactivate")
            ->assertForbidden();

        $this->assertDatabaseHas('branch_subscriptions', ['branch_id' => $branch->id, 'status' => 'active']);
    }

    public function test_scheduler_cannot_change_branch_capacity(): void
    {
        [$company, , , $branch] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($company);

        $this->putJson("/api/v1/branches/{$branch->id}/capacity", ['employee_capacity' => 100])
            ->assertForbidden();
    }

    public function test_capacity_blocked_employee_creation_shows_the_company_admin_message(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 1]);
        $branch = $company->branches()->first();
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'status' => 'active',
        ]);

        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Over',
            'last_name' => 'Capacity',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED')
            ->assertJsonPath('message', 'Employee capacity reached. Contact your company administrator.')
            ->assertJsonPath('errors.used', 1)
            ->assertJsonPath('errors.capacity', 1);
    }

    public function test_scheduler_cannot_create_an_employee(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($company);

        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'first_name' => 'Blocked',
            'last_name' => 'Scheduler',
        ])->assertForbidden();
    }

    public function test_scheduler_cannot_update_an_employee(): void
    {
        [$company, , , $branch] = $this->makeCompanyWithActiveSubscription();
        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
        ]);
        $this->actingAsScheduler($company);

        $this->putJson("/api/v1/employees/{$employee->id}", ['first_name' => 'Hijacked'])
            ->assertForbidden();
    }

    public function test_scheduler_can_manage_rosters_and_shifts(): void
    {
        // Positive control: the schedular is NOT over-restricted. They can
        // create and publish rosters and create shifts (roster.* / shift.*
        // permissions from the seeder).
        [$company, , , $branch] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsScheduler($company);

        $this->postJson('/api/v1/rosters', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'week_start' => now()->startOfWeek()->toDateString(),
            'week_end' => now()->endOfWeek()->toDateString(),
        ])->assertCreated();

        $roster = Roster::query()->first();

        $this->postJson("/api/v1/rosters/{$roster->id}/publish")->assertOk();

        $this->postJson('/api/v1/shifts', [
            'roster_id' => $roster->id,
            'date' => now()->startOfWeek()->addDay()->toDateString(),
            'start_time' => '09:00',
            'end_time' => '17:00',
        ])->assertCreated();
    }

    /*
    |--------------------------------------------------------------------------
    | 3. Billing / payment permissions — company admin vs super admin
    |--------------------------------------------------------------------------
    */

    public function test_company_admin_can_view_own_subscription_and_payments(): void
    {
        [$company, $plan, $subscription] = $this->makeCompanyWithActiveSubscription();
        SubscriptionPayment::factory()->count(2)->create(['subscription_id' => $subscription->id]);
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/subscription')
            ->assertOk()
            ->assertJsonPath('data.plan.id', $plan->id);

        $this->getJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/payments")
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_can_upgrade_own_subscription(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $target = Plan::factory()->create(['max_branches' => 10, 'max_employees' => 100]);
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/subscription/upgrade', [
            'plan_id' => $target->id,
            'billing_cycle' => 'yearly',
        ])->assertOk();

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $target->id,
        ]);
    }

    public function test_company_admin_cannot_refund_a_payment(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $payment = SubscriptionPayment::factory()->create(['subscription_id' => $subscription->id]);
        $this->actingAsCompanyAdmin($company);

        // The seeder now excludes subscription.refund from company_admin, so a
        // tenant account is never allowed to push money back out of Stripe.
        $this->postJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/payments/{$payment->id}/refund")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_manage_plans(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($company);
        // One extra plan on top of the subscription's own plan = 2 total.
        Plan::factory()->create();

        // View-only: the plan catalogue is visible to anyone with subscription.view.
        $this->getJson('/api/v1/plans')->assertOk()->assertJsonCount(2, 'data.data');

        // Mutations are super-admin only.
        $this->postJson('/api/v1/plans', [
            'name' => 'Nope',
            'slug' => 'nope',
            'price_monthly' => 1,
            'price_yearly' => 10,
        ])->assertForbidden();

        $plan = Plan::query()->first();
        $this->putJson("/api/v1/plans/{$plan->id}", ['name' => 'Hijacked'])
            ->assertForbidden();
        $this->deleteJson("/api/v1/plans/{$plan->id}")
            ->assertForbidden();
    }

    public function test_employee_cannot_view_subscription_or_plans(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsEmployee($company);

        $this->getJson('/api/v1/subscription')->assertForbidden();
        $this->getJson('/api/v1/plans')->assertForbidden();
    }

    public function test_guest_is_rejected_from_every_guarded_route(): void
    {
        $this->getJson('/api/v1/subscription')->assertUnauthorized();
        $this->getJson('/api/v1/plans')->assertUnauthorized();
        $this->getJson('/api/v1/companies/1/subscriptions')->assertUnauthorized();
        $this->getJson('/api/v1/branches')->assertUnauthorized();
    }

    /*
    |--------------------------------------------------------------------------
    | 4. Superadmin scoping — the platform bypass is scoped
    |--------------------------------------------------------------------------
    */

    public function test_super_admin_sees_the_platform_dashboard(): void
    {
        [$companyA] = $this->makeCompanyWithActiveSubscription();
        [$companyB] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsSuperAdmin();

        $this->getJson('/api/v1/dashboard/overview')
            ->assertOk()
            ->assertJsonPath('data.scope', 'platform')
            ->assertJsonPath('data.stats.total_companies', 2);
    }

    public function test_company_admin_sees_only_their_own_dashboard(): void
    {
        [$ownCompany] = $this->makeCompanyWithActiveSubscription();
        [$otherCompany] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson('/api/v1/dashboard/overview')
            ->assertOk()
            ->assertJsonPath('data.scope', 'company');
    }

    public function test_super_admin_can_read_and_write_platform_settings(): void
    {
        $this->actingAsSuperAdmin();

        $this->getJson('/api/v1/platform-settings/trial')
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->putJson('/api/v1/platform-settings/trial', ['trial_period_days' => 21])
            ->assertOk()
            ->assertJsonPath('data.trial_period_days', 21);
    }

    public function test_company_admin_cannot_read_or_write_platform_settings(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/platform-settings/trial')->assertForbidden();
        $this->putJson('/api/v1/platform-settings/trial', ['trial_period_days' => 7])
            ->assertForbidden();
    }

    public function test_super_admin_can_manage_any_companys_subscription(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsSuperAdmin();

        // The platform surface (companies/{company}/subscriptions) is available
        // to a super admin for cross-tenant management.
        $this->getJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}")
            ->assertOk();
    }

    public function test_super_admin_can_refund_a_payment(): void
    {
        $this->fakeBillingProvider();

        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription();
        // A refund reaches Stripe as the subscription's customer (user), so the
        // subscription must reference a user and a refundable PaymentIntent.
        $customer = User::factory()->create(['company_id' => $company->id]);
        $subscription->update(['user_id' => $customer->id]);
        $payment = SubscriptionPayment::factory()->create([
            'subscription_id' => $subscription->id,
            'status' => 'succeeded',
            'stripe_payment_intent_id' => 'pi_test_123',
        ]);
        $this->actingAsSuperAdmin();

        $this->postJson("/api/v1/companies/{$company->id}/subscriptions/{$subscription->id}/payments/{$payment->id}/refund")
            ->assertOk()
            ->assertJsonPath('data.status', 'refunded');

        $this->assertDatabaseHas('subscription_payments', [
            'id' => $payment->id,
            'status' => 'refunded',
        ]);
    }

    public function test_super_admin_can_view_any_companys_profile(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $this->actingAsSuperAdmin();

        $this->getJson("/api/v1/companies/{$company->id}")
            ->assertOk();
    }
}
