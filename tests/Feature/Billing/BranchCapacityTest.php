<?php

namespace Tests\Feature\Billing;

use App\Models\Branch;
use App\Models\BranchSubscription;
use App\Models\Company;
use App\Models\Employee;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class BranchCapacityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['branch.view', 'branch.create', 'branch.edit', 'branch.delete', 'employee.view', 'employee.create', 'employee.edit', 'employee.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions([
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

    protected function actingAsScheduler(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('scheduler');
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

    public function test_guest_cannot_activate_a_branch(): void
    {
        $branch = Branch::factory()->create();

        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertUnauthorized();
    }

    public function test_valid_activation_creates_an_entitled_branch_subscription(): void
    {
        [$company, $plan] = $this->makeCompanyWithActiveSubscription();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $response = $this->postJson("/api/v1/branches/{$branch->id}/activate");

        $response->assertOk()
            ->assertJsonPath('data.branch_subscription.status', 'active')
            ->assertJsonPath('data.branch_subscription.employee_capacity', $plan->max_employees);

        $this->assertDatabaseHas('branch_subscriptions', [
            'branch_id' => $branch->id,
            'company_id' => $company->id,
            'status' => 'active',
            'employee_capacity' => $plan->max_employees,
        ]);

        $this->assertTrue($branch->fresh()->activeBranchSubscription() !== null);

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => Branch::class,
            'subject_id' => $branch->id,
            'event' => 'branch_activated',
        ]);
    }

    public function test_activation_honours_custom_employee_capacity(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->postJson("/api/v1/branches/{$branch->id}/activate", ['employee_capacity' => 10])
            ->assertOk()
            ->assertJsonPath('data.branch_subscription.employee_capacity', 10);

        $this->assertDatabaseHas('branch_subscriptions', [
            'branch_id' => $branch->id,
            'employee_capacity' => 10,
        ]);
    }

    public function test_activation_is_rejected_without_an_active_subscription(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        // The company.access middleware blocks locked companies first (423).
        $this->postJson("/api/v1/branches/{$branch->id}/activate")
            ->assertStatus(423)
            ->assertJsonPath('code', 'company_subscription_required');
    }

    public function test_activation_is_rejected_when_branch_limit_is_reached(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_branches' => 1]);
        $branchOne = Branch::factory()->create(['company_id' => $company->id]);
        $branchTwo = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        // Fill the single branch allowance.
        $this->postJson("/api/v1/branches/{$branchOne->id}/activate")->assertOk();

        $this->postJson("/api/v1/branches/{$branchTwo->id}/activate")
            ->assertStatus(422)
            ->assertJsonPath('code', 'BRANCH_LIMIT_REACHED')
            ->assertJsonPath('errors.used', 1)
            ->assertJsonPath('errors.limit', 1);
    }

    public function test_unlimited_branch_limit_allows_any_number_of_branches(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_branches' => null]);
        $this->actingAsCompanyAdmin($company);

        foreach (range(1, 3) as $i) {
            $branch = Branch::factory()->create(['company_id' => $company->id]);
            $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();
        }

        $this->assertSame(3, BranchSubscription::where('company_id', $company->id)->where('status', 'active')->count());
    }

    public function test_reactivating_an_already_active_branch_does_not_double_count(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_branches' => 1]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();
        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();

        $this->assertSame(1, BranchSubscription::where('branch_id', $branch->id)->where('status', 'active')->count());
    }

    public function test_deactivation_ends_the_branch_subscription(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        $response = $this->postJson("/api/v1/branches/{$branch->id}/deactivate");

        $response->assertOk()
            ->assertJsonPath('data.branch_subscription.status', 'cancelled');

        $this->assertNull($branch->fresh()->activeBranchSubscription());

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => Branch::class,
            'subject_id' => $branch->id,
            'event' => 'branch_deactivated',
        ]);
    }

    public function test_deactivating_an_inactive_branch_is_rejected(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->postJson("/api/v1/branches/{$branch->id}/deactivate")
            ->assertStatus(422)
            ->assertJsonPath('code', 'BRANCH_NOT_ACTIVE');
    }

    public function test_cannot_activate_a_branch_from_another_company(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $otherBranch = Branch::factory()->create();
        $this->actingAsCompanyAdmin($company);

        // BranchPolicy denies before the service runs because the branch belongs
        // to a different company, so a generic 403 is returned.
        $this->postJson("/api/v1/branches/{$otherBranch->id}/activate")
            ->assertForbidden();
    }

    public function test_scheduler_cannot_activate_a_branch(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsScheduler($company);

        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertForbidden();
    }

    // ---------------------------------------------------------------- capacity

    public function test_add_employee_consumes_branch_capacity(): void
    {
        [$company, $plan] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'employment_type' => 'full_time',
        ])->assertCreated();

        $this->assertSame(1, $branch->employees()->active()->count());

        // Usage endpoint reflects 1/10 used.
        $this->getJson('/api/v1/usage')
            ->assertOk()
            ->assertJsonPath('data.branch_usage.0.employees_used', 1)
            ->assertJsonPath('data.branch_usage.0.capacity', 10)
            ->assertJsonPath('data.branch_usage.0.remaining', 9);
    }

    public function test_capacity_is_fully_consumed_at_the_limit(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 2]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'One',
            'last_name' => 'A',
        ])->assertCreated();

        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Two',
            'last_name' => 'B',
        ])->assertCreated();

        $this->assertSame(2, $branch->employees()->active()->count());
    }

    public function test_adding_an_eleventh_employee_is_rejected_with_capacity_error(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        Employee::factory()->count(10)->create([
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
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED')
            ->assertJsonPath('errors.used', 10)
            ->assertJsonPath('errors.capacity', 10)
            ->assertJsonPath('errors.remaining', 0);

        $this->assertSame(10, $branch->employees()->active()->count());
    }

    public function test_inactive_employees_do_not_consume_capacity(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 2]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        // One archived employee does not count toward capacity.
        Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'status' => 'inactive',
        ]);

        // Two active employees fill the capacity of 2.
        Employee::factory()->count(2)->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'status' => 'active',
        ]);

        // A third active employee is rejected.
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'Third',
            'last_name' => 'Active',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED');
    }

    public function test_adding_an_employee_to_an_inactive_branch_is_rejected(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        // Note: no activation call — the branch is dormant.
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'No',
            'last_name' => 'Entitlement',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'BRANCH_NOT_ENTITLED');
    }

    public function test_employee_without_branch_is_not_capacity_checked(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 1]);
        $this->actingAsCompanyAdmin($company);

        // No subscription is even needed — employees without a branch are not
        // capacity-checked, preserving legacy behaviour.
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'first_name' => 'Free',
            'last_name' => 'Agent',
        ])->assertCreated();
    }

    // ---------------------------------------------------------------- transfer

    public function test_valid_transfer_moves_employee_and_updates_counts(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $branchA = Branch::factory()->create(['company_id' => $company->id]);
        $branchB = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branchA);
        $this->activateBranchViaApi($branchB);

        // A is 10/10, B is 5/10.
        Employee::factory()->count(10)->create([
            'company_id' => $company->id,
            'branch_id' => $branchA->id,
            'status' => 'active',
        ]);
        Employee::factory()->count(5)->create([
            'company_id' => $company->id,
            'branch_id' => $branchB->id,
            'status' => 'active',
        ]);

        $employee = $branchA->employees()->active()->first();

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", ['branch_id' => $branchB->id])
            ->assertOk()
            ->assertJsonPath('data.branch_id', $branchB->id);

        $this->assertSame(9, $branchA->employees()->active()->count());
        $this->assertSame(6, $branchB->employees()->active()->count());

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => Employee::class,
            'subject_id' => $employee->id,
            'event' => 'employee_transferred',
        ]);
    }

    public function test_transfer_to_a_full_destination_is_rejected_transactionally(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $branchA = Branch::factory()->create(['company_id' => $company->id]);
        $branchB = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branchA);
        $this->activateBranchViaApi($branchB);

        // A=10/10, B=10/10.
        Employee::factory()->count(10)->create([
            'company_id' => $company->id,
            'branch_id' => $branchA->id,
            'status' => 'active',
        ]);
        Employee::factory()->count(10)->create([
            'company_id' => $company->id,
            'branch_id' => $branchB->id,
            'status' => 'active',
        ]);

        $employee = $branchA->employees()->active()->first();

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", ['branch_id' => $branchB->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED');

        // Nothing changed — the transfer was rolled back.
        $this->assertSame(10, $branchA->employees()->active()->count());
        $this->assertSame(10, $branchB->employees()->active()->count());
        $this->assertSame($branchA->id, $employee->fresh()->branch_id);
    }

    public function test_transfer_to_an_inactive_destination_branch_is_rejected(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $branchA = Branch::factory()->create(['company_id' => $company->id]);
        $branchB = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branchA);
        // branchB is intentionally not activated.

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branchA->id,
            'status' => 'active',
        ]);

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", ['branch_id' => $branchB->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'BRANCH_NOT_ENTITLED');

        $this->assertSame($branchA->id, $employee->fresh()->branch_id);
    }

    public function test_transfer_to_a_branch_of_another_company_is_rejected(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $branchA = Branch::factory()->create(['company_id' => $company->id]);

        $this->actingAsCompanyAdmin($company);
        $this->activateBranchViaApi($branchA);

        $otherCompanyBranch = Branch::factory()->create();

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branchA->id,
            'status' => 'active',
        ]);

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", ['branch_id' => $otherCompanyBranch->id])
            ->assertStatus(403)
            ->assertJsonPath('code', 'CROSS_BUSINESS_ACCESS_DENIED');

        $this->assertSame($branchA->id, $employee->fresh()->branch_id);
    }

    public function test_unauthorized_user_cannot_transfer_an_employee(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $branchA = Branch::factory()->create(['company_id' => $company->id]);
        $branchB = Branch::factory()->create(['company_id' => $company->id]);

        $this->actingAsCompanyAdmin($company);
        $this->activateBranchViaApi($branchA);
        $this->activateBranchViaApi($branchB);

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branchA->id,
            'status' => 'active',
        ]);

        // A scheduler (no employee.edit permission) cannot transfer.
        $this->actingAsScheduler($company);

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", ['branch_id' => $branchB->id])
            ->assertForbidden();
    }

    // ---------------------------------------------------------------- capacity update

    public function test_can_update_branch_employee_capacity(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 25]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        $this->putJson("/api/v1/branches/{$branch->id}/capacity", ['employee_capacity' => 50])
            ->assertOk()
            ->assertJsonPath('data.branch_subscription.employee_capacity', 50);

        $this->assertDatabaseHas('activity_log', [
            'subject_type' => Branch::class,
            'subject_id' => $branch->id,
            'event' => 'employee_capacity_changed',
        ]);
    }

    public function test_cannot_shrink_capacity_below_active_employee_count(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 25]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        Employee::factory()->count(20)->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'status' => 'active',
        ]);

        $this->putJson("/api/v1/branches/{$branch->id}/capacity", ['employee_capacity' => 10])
            ->assertStatus(422)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_TOO_LOW');

        $this->assertDatabaseHas('branch_subscriptions', [
            'branch_id' => $branch->id,
            'employee_capacity' => 25,
        ]);
    }

    // ---------------------------------------------------------------- usage endpoint

    public function test_usage_endpoint_reports_plan_allowances(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_branches' => 5, 'max_employees' => 25]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        $this->getJson('/api/v1/usage')
            ->assertOk()
            ->assertJsonPath('data.branches.used', 1)
            ->assertJsonPath('data.branches.limit', 5)
            ->assertJsonCount(1, 'data.branch_usage');
    }
}
