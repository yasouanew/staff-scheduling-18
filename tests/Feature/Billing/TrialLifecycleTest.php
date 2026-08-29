<?php

namespace Tests\Feature\Billing;

use App\Console\Commands\SendTrialEndingReminders;
use App\Console\Commands\TransitionExpiredTrials;
use App\Models\Branch;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Notifications\TrialExpiredNotification;
use App\Notifications\TrialEndingNotification;
use App\Services\EntitlementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class TrialLifecycleTest extends TestCase
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

    protected function makeCompanyWithActiveSubscription(array $planOverrides = []): array
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create(array_merge(['max_branches' => 3, 'max_employees' => 25], $planOverrides));
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        return [$company, $plan, $subscription];
    }

    protected function activateBranchViaApi(Branch $branch): void
    {
        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();
    }

    // ─────────────────────────────────────────────────────────────────────
    // TRIAL REMINDERS (staggered 7/3/1)
    // ─────────────────────────────────────────────────────────────────────

    public function test_trial_reminder_sends_at_7_days_remaining(): void
    {
        Notification::fake();

        $company = Company::factory()->create([
            'trial_ends_at' => now()->addDays(7),
            'trial_reminders_sent' => null,
        ]);

        $user = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);

        $this->artisan(SendTrialEndingReminders::class);

        Notification::assertSentTo($user, TrialEndingNotification::class);

        $company->refresh();
        $this->assertContains(7, $company->trial_reminders_sent);
    }

    public function test_trial_reminder_sends_at_3_days_remaining(): void
    {
        Notification::fake();

        $company = Company::factory()->create([
            'trial_ends_at' => now()->addDays(3),
            'trial_reminders_sent' => [7],
        ]);

        $user = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);

        $this->artisan(SendTrialEndingReminders::class);

        Notification::assertSentTo($user, TrialEndingNotification::class);

        $company->refresh();
        $this->assertContains(3, $company->trial_reminders_sent);
    }

    public function test_trial_reminder_sends_at_1_day_remaining(): void
    {
        Notification::fake();

        $company = Company::factory()->create([
            'trial_ends_at' => now()->addDay(),
            'trial_reminders_sent' => [7, 3],
        ]);

        $user = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);

        $this->artisan(SendTrialEndingReminders::class);

        Notification::assertSentTo($user, TrialEndingNotification::class);

        $company->refresh();
        $this->assertContains(1, $company->trial_reminders_sent);
    }

    public function test_trial_reminder_does_not_resend_same_bucket(): void
    {
        Notification::fake();

        $company = Company::factory()->create([
            'trial_ends_at' => now()->addDays(7),
            'trial_reminders_sent' => [7],
        ]);

        $user = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);

        $this->artisan(SendTrialEndingReminders::class);

        Notification::assertNothingSent();
    }

    public function test_trial_reminder_skips_companies_with_active_subscription(): void
    {
        Notification::fake();

        $company = Company::factory()->create([
            'trial_ends_at' => now()->addDays(3),
            'trial_reminders_sent' => null,
        ]);

        $plan = Plan::factory()->create();
        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $user = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);

        $this->artisan(SendTrialEndingReminders::class);

        Notification::assertNothingSent();
    }

    public function test_trial_reminder_skips_companies_with_expired_trial(): void
    {
        Notification::fake();

        $company = Company::factory()->create([
            'trial_ends_at' => now()->subDay(),
            'trial_reminders_sent' => null,
        ]);

        $user = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);

        $this->artisan(SendTrialEndingReminders::class);

        Notification::assertNothingSent();
    }

    // ─────────────────────────────────────────────────────────────────────
    // TRIAL → ACTIVE / TRIAL → EXPIRED TRANSITION
    // ─────────────────────────────────────────────────────────────────────

    public function test_expired_trial_with_stripe_id_transitions_to_active(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'trialing',
            'trial_ends_at' => now()->subDay(),
            'stripe_id' => 'sub_test_123',
        ]);

        $this->artisan(TransitionExpiredTrials::class);

        $subscription->refresh();
        $this->assertEquals('active', $subscription->status);
        $this->assertNotNull($subscription->activation_notified_at);
    }

    public function test_expired_trial_without_stripe_id_transitions_to_expired(): void
    {
        Notification::fake();

        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'trialing',
            'trial_ends_at' => now()->subDay(),
            'stripe_id' => null,
        ]);

        $user = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);

        $this->artisan(TransitionExpiredTrials::class);

        $subscription->refresh();
        $this->assertEquals('expired', $subscription->status);
        $this->assertNotNull($subscription->suspended_at);

        $company->refresh();
        $this->assertNotNull($company->locked_at);

        Notification::assertSentTo($user, TrialExpiredNotification::class);
    }

    public function test_trial_not_yet_expired_is_not_transitioned(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'trialing',
            'trial_ends_at' => now()->addDays(5),
        ]);

        $this->artisan(TransitionExpiredTrials::class);

        $subscription->refresh();
        $this->assertEquals('trialing', $subscription->status);
    }

    public function test_already_active_subscription_is_not_affected_by_trial_transition(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'trial_ends_at' => now()->subDay(),
        ]);

        $this->artisan(TransitionExpiredTrials::class);

        $subscription->refresh();
        $this->assertEquals('active', $subscription->status);
    }

    // ─────────────────────────────────────────────────────────────────────
    // GRACE PERIOD ACCESS
    // ─────────────────────────────────────────────────────────────────────

    public function test_grace_period_subscription_grants_access(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
        ]);

        $entitlements = app(EntitlementService::class);
        $this->assertNotNull($entitlements->entitledSubscription($company));
        $this->assertTrue($entitlements->hasEntitledSubscription($company));
    }

    public function test_expired_grace_period_does_not_grant_access(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'grace_ends_at' => now()->subDay(),
        ]);

        $entitlements = app(EntitlementService::class);
        $this->assertNull($entitlements->entitledSubscription($company));
        $this->assertFalse($entitlements->hasEntitledSubscription($company));
    }

    public function test_company_active_subscription_includes_grace_period(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
        ]);

        $this->assertNotNull($company->activeSubscription());
        $this->assertEquals($subscription->id, $company->activeSubscription()->id);
    }

    public function test_company_active_subscription_excludes_expired_grace_period(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'grace_ends_at' => now()->subDay(),
        ]);

        $this->assertNull($company->activeSubscription());
    }

    public function test_company_is_not_locked_during_grace_period(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
        ]);

        $this->assertFalse($company->isAccessLocked());
    }

    public function test_company_is_locked_after_grace_period_expires(): void
    {
        // Trial has lapsed AND the payment-failure grace window has also
        // expired — no path to access remains, so the company must be locked.
        $company = Company::factory()->trialExpired()->create();
        $plan = Plan::factory()->create();

        Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'grace_ends_at' => now()->subDay(),
        ]);

        $this->assertTrue($company->isAccessLocked());
    }

    public function test_check_company_access_allows_grace_period(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
        ]);

        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/dashboard/overview')->assertOk();
    }

    public function test_ensure_active_subscription_allows_grace_period(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
        ]);

        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');

        // The `subscription.active` middleware is not wired onto any live route
        // (the SPA gates reads through `company.access` and billing mutations
        // through SubscriptionPolicy), so exercise the middleware directly to
        // prove the grace-period clause keeps access during the window.
        $middleware = app(\App\Http\Middleware\EnsureActiveSubscription::class);
        $request = \Illuminate\Http\Request::create('/api/v1/__grace-probe', 'GET');
        $request->setUserResolver(fn () => $user);

        $response = $middleware->handle($request, fn ($req) => response()->json(['success' => true]));

        $this->assertSame(200, $response->getStatusCode());
    }

    public function test_ensure_active_subscription_rejects_after_grace_period_expires(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'grace_ends_at' => now()->subDay(),
        ]);

        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');

        $middleware = app(\App\Http\Middleware\EnsureActiveSubscription::class);
        $request = \Illuminate\Http\Request::create('/api/v1/__grace-probe', 'GET');
        $request->setUserResolver(fn () => $user);

        $response = $middleware->handle($request, fn ($req) => response()->json(['success' => true]));

        $this->assertSame(402, $response->getStatusCode());
    }

    // ─────────────────────────────────────────────────────────────────────
    // CONCURRENT EMPLOYEE CAPACITY (lockForUpdate)
    // ─────────────────────────────────────────────────────────────────────

    public function test_concurrent_employee_creation_respects_capacity(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create(['max_employees' => 2]);
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $this->actingAsCompanyAdmin($company);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->activateBranchViaApi($branch);

        // Set branch capacity to 2
        $branchSubscription = $branch->activeBranchSubscription();
        $branchSubscription->update(['employee_capacity' => 2]);

        // Create 2 employees (should succeed)
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Employee',
            'last_name' => 'One',
            'email' => 'emp1@example.com',
            'role' => 'employee',
        ])->assertCreated();

        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Employee',
            'last_name' => 'Two',
            'email' => 'emp2@example.com',
            'role' => 'employee',
        ])->assertCreated();

        // Third employee should be rejected (capacity reached)
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Employee',
            'last_name' => 'Three',
            'email' => 'emp3@example.com',
            'role' => 'employee',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED');
    }

    public function test_inactive_employees_do_not_consume_capacity(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create(['max_employees' => 2]);
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $this->actingAsCompanyAdmin($company);

        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->activateBranchViaApi($branch);

        $branchSubscription = $branch->activeBranchSubscription();
        $branchSubscription->update(['employee_capacity' => 2]);

        // Create 2 employees
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Employee',
            'last_name' => 'One',
            'email' => 'emp1@example.com',
            'role' => 'employee',
        ])->assertCreated();

        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Employee',
            'last_name' => 'Two',
            'email' => 'emp2@example.com',
            'role' => 'employee',
        ])->assertCreated();

        // Deactivate one employee
        $employee = $company->employees()->where('branch_id', $branch->id)->first();
        $this->patchJson("/api/v1/employees/{$employee->id}", [
            'status' => 'inactive',
        ])->assertOk();

        // Now we can add a third employee (capacity freed)
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Employee',
            'last_name' => 'Three',
            'email' => 'emp3@example.com',
            'role' => 'employee',
        ])->assertCreated();
    }

    // ─────────────────────────────────────────────────────────────────────
    // MULTI-TENANT SECURITY
    // ─────────────────────────────────────────────────────────────────────

    public function test_company_cannot_access_another_companys_subscription(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        $plan = Plan::factory()->create();
        $subscription = Subscription::factory()->create([
            'company_id' => $companyB->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $user = User::factory()->create(['company_id' => $companyA->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->getJson("/api/v1/companies/{$companyB->id}/subscriptions/{$subscription->id}")
            ->assertForbidden();
    }

    public function test_company_cannot_access_another_companys_branch(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        // Company A has a valid active subscription so it passes the
        // `company.access` middleware; the branch policy must still reject it.
        $planA = Plan::factory()->create();
        Subscription::factory()->create([
            'company_id' => $companyA->id,
            'plan_id' => $planA->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $branch = Branch::factory()->create(['company_id' => $companyB->id]);

        $user = User::factory()->create(['company_id' => $companyA->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/branches/{$branch->id}/activate")
            ->assertForbidden();
    }

    public function test_company_cannot_access_another_companys_employee(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        // Company A has a valid active subscription so it passes the
        // `company.access` middleware; the employee policy must still reject it.
        $planA = Plan::factory()->create();
        Subscription::factory()->create([
            'company_id' => $companyA->id,
            'plan_id' => $planA->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $employee = \App\Models\Employee::factory()->create(['company_id' => $companyB->id]);

        $user = User::factory()->create(['company_id' => $companyA->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->getJson("/api/v1/employees/{$employee->id}")
            ->assertForbidden();
    }

    // ─────────────────────────────────────────────────────────────────────
    // PLAN UPGRADE / DOWNGRADE
    // ─────────────────────────────────────────────────────────────────────

    public function test_company_can_upgrade_plan(): void
    {
        $company = Company::factory()->create();
        $planA = Plan::factory()->create(['max_branches' => 1, 'max_employees' => 10]);
        $planB = Plan::factory()->create(['max_branches' => 3, 'max_employees' => 25]);

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $planA->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/subscription/upgrade', [
            'plan_id' => $planB->id,
        ])->assertOk();

        $subscription->refresh();
        $this->assertEquals($planB->id, $subscription->plan_id);
    }

    public function test_company_cannot_downgrade_when_branches_exceed_new_limit(): void
    {
        $company = Company::factory()->create();
        $planA = Plan::factory()->create(['max_branches' => 3, 'max_employees' => 25]);
        $planB = Plan::factory()->create(['max_branches' => 1, 'max_employees' => 10]);

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $planA->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        // Authenticate BEFORE activating branches so the API requests are authorized
        $this->actingAsCompanyAdmin($company);

        // Activate 2 branches
        $branch1 = Branch::factory()->create(['company_id' => $company->id]);
        $branch2 = Branch::factory()->create(['company_id' => $company->id]);
        $this->activateBranchViaApi($branch1);
        $this->activateBranchViaApi($branch2);

        $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $planB->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'DOWNGRADE_BRANCH_LIMIT_EXCEEDED');
    }

    // ─────────────────────────────────────────────────────────────────────
    // BRANCH LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────

    public function test_branch_lifecycle_create_activate_employees_capacity_deactivate_reactivate(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create(['max_branches' => 2, 'max_employees' => 5]);
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        // Create branch
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        // Activate branch
        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();

        // Add employees up to capacity (branch capacity defaults to plan max)
        for ($i = 1; $i <= 5; $i++) {
            $this->postJson('/api/v1/employees', [
                'company_id' => $company->id,
                'branch_id' => $branch->id,
                'first_name' => 'Employee',
                'last_name' => "{$i}",
                'email' => "emp{$i}@example.com",
                'role' => 'employee',
            ])->assertCreated();
        }

        // Try to add 6th employee (should fail - capacity reached)
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Employee',
            'last_name' => 'Six',
            'email' => 'emp6@example.com',
            'role' => 'employee',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED');

        // Increase capacity (route is PUT branches/{branch}/capacity)
        $this->putJson("/api/v1/branches/{$branch->id}/capacity", [
            'employee_capacity' => 10,
        ])->assertOk();

        // Now we can add more employees
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Employee',
            'last_name' => 'Six',
            'email' => 'emp6@example.com',
            'role' => 'employee',
        ])->assertCreated();

        // Deactivate branch
        $this->postJson("/api/v1/branches/{$branch->id}/deactivate")->assertOk();

        // Reactivate branch
        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();
    }

    // ─────────────────────────────────────────────────────────────────────
    // NOTIFICATION VERIFICATION
    // ─────────────────────────────────────────────────────────────────────

    public function test_trial_ending_notification_is_sent_to_company_admins(): void
    {
        Notification::fake();

        $company = Company::factory()->create([
            'trial_ends_at' => now()->addDays(3),
            'trial_reminders_sent' => null,
        ]);

        $admin1 = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);
        $admin2 = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);
        $employee = User::factory()->create(['company_id' => $company->id, 'role' => 'employee']);

        $this->artisan(SendTrialEndingReminders::class);

        Notification::assertSentTo([$admin1, $admin2], TrialEndingNotification::class);
        Notification::assertNotSentTo($employee, TrialEndingNotification::class);
    }

    public function test_trial_expired_notification_is_sent_to_company_admins(): void
    {
        Notification::fake();

        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'trialing',
            'trial_ends_at' => now()->subDay(),
            'stripe_id' => null,
        ]);

        $admin = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);

        $this->artisan(TransitionExpiredTrials::class);

        Notification::assertSentTo($admin, TrialExpiredNotification::class);
    }

    // ─────────────────────────────────────────────────────────────────────
    // DATABASE INTEGRITY
    // ─────────────────────────────────────────────────────────────────────

    public function test_trial_reminders_sent_column_is_json_array(): void
    {
        $company = Company::factory()->create([
            'trial_reminders_sent' => [7, 3, 1],
        ]);

        $company->refresh();
        $this->assertIsArray($company->trial_reminders_sent);
        $this->assertEquals([7, 3, 1], $company->trial_reminders_sent);
    }

    public function test_trial_reminders_sent_column_defaults_to_null(): void
    {
        $company = Company::factory()->create();
        $this->assertNull($company->trial_reminders_sent);
    }

    public function test_subscription_grace_ends_at_is_cast_to_datetime(): void
    {
        $subscription = Subscription::factory()->gracePeriod()->create();
        $this->assertInstanceOf(\Illuminate\Support\Carbon::class, $subscription->grace_ends_at);
    }

    public function test_subscription_past_due_since_is_cast_to_datetime(): void
    {
        $subscription = Subscription::factory()->pastDue()->create();
        $this->assertInstanceOf(\Illuminate\Support\Carbon::class, $subscription->past_due_since);
    }
}