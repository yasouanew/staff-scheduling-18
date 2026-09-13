<?php

namespace Tests\Feature\Billing;

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
 * Employee branch assignment under the company-scoped subscription model.
 *
 * Regression coverage for the reported bug: changing an employee's branch used
 * to fail with `422 BRANCH_NOT_ENTITLED` ("This branch is not active under the
 * business subscription.") because the assignment path asserted a BRANCH-scoped
 * entitlement row that newly created branches never received. Subscriptions are
 * company-scoped now, so moving an employee onto any branch of the company is
 * allowed as long as the verified guards hold:
 *
 *   - the destination branch belongs to the same company;
 *   - the company holds an entitled subscription;
 *   - the plan's employee capacity is not already reached.
 *
 * `BRANCH_NOT_ENTITLED` no longer exists anywhere in the application.
 */
class EmployeeBranchAssignmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach ([
            'subscription.view', 'subscription.manage',
            'branch.view', 'branch.create', 'branch.edit', 'branch.delete',
            'employee.view', 'employee.create', 'employee.edit', 'employee.delete',
        ] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions([
            'subscription.view', 'subscription.manage',
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

    /**
     * @return array{0: Company, 1: Plan, 2: Subscription}
     */
    protected function makeCompanyWithActiveSubscription(array $planOverrides = []): array
    {
        $company = Company::factory()->create();

        $plan = Plan::factory()->create(array_merge([
            'max_branches' => 3,
            'max_employees' => 25,
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

    /**
     * The reported bug: a branch created through the API (with no activation
     * step) must be a valid transfer destination.
     */
    public function test_employee_can_be_moved_to_a_newly_created_branch(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();

        $this->actingAsCompanyAdmin($company);

        $source = Branch::factory()->create(['company_id' => $company->id, 'status' => 'active']);

        // Created exactly the way the UI does it — no activate endpoint call.
        $destinationId = $this->postJson('/api/v1/branches', [
            'name' => 'Second Branch',
            'status' => 'active',
        ])->assertCreated()->json('data.id');

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $source->id,
            'status' => 'active',
        ]);

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", [
            'branch_id' => $destinationId,
        ])
            ->assertOk()
            ->assertJsonPath('data.branch_id', $destinationId);

        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'branch_id' => $destinationId,
        ]);
    }

    /**
     * The tenant guard is retained even though the branch-entitlement guard is
     * gone.
     */
    public function test_moving_an_employee_to_another_companys_branch_is_rejected(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription();

        $this->actingAsCompanyAdmin($company);

        $source = Branch::factory()->create(['company_id' => $company->id, 'status' => 'active']);
        $otherCompany = Company::factory()->create();
        $foreignBranch = Branch::factory()->create(['company_id' => $otherCompany->id]);

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $source->id,
            'status' => 'active',
        ]);

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", [
            'branch_id' => $foreignBranch->id,
        ])
            ->assertStatus(403)
            ->assertJsonPath('code', 'CROSS_BUSINESS_ACCESS_DENIED');

        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'branch_id' => $source->id,
        ]);
    }

    /**
     * A company without an entitled subscription still cannot assign staff.
     */
    public function test_moving_an_employee_without_an_entitled_subscription_is_rejected(): void
    {
        $company = Company::factory()->create();

        $this->actingAsCompanyAdmin($company);

        $source = Branch::factory()->create(['company_id' => $company->id, 'status' => 'active']);
        $destination = Branch::factory()->create(['company_id' => $company->id, 'status' => 'active']);

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $source->id,
            'status' => 'active',
        ]);

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", [
            'branch_id' => $destination->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'NO_ACTIVE_SUBSCRIPTION');

        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'branch_id' => $source->id,
        ]);
    }

    /**
     * Plan employee capacity is still enforced at the destination.
     */
    public function test_moving_an_employee_into_a_full_plan_is_rejected(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 2]);

        $this->actingAsCompanyAdmin($company);

        $source = Branch::factory()->create(['company_id' => $company->id, 'status' => 'active']);
        $destination = Branch::factory()->create(['company_id' => $company->id, 'status' => 'active']);

        // Fill the plan's employee allowance with two active employees already
        // sitting in the destination branch.
        Employee::factory()->count(2)->create([
            'company_id' => $company->id,
            'branch_id' => $destination->id,
            'status' => 'active',
        ]);

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $source->id,
            'status' => 'active',
        ]);

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", [
            'branch_id' => $destination->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED')
            ->assertJsonPath('errors.used', 2)
            ->assertJsonPath('errors.capacity', 2)
            ->assertJsonPath('errors.remaining', 0);

        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'branch_id' => $source->id,
        ]);
    }

    /**
     * An employee with no branch is not tied to any branch capacity, so
     * assigning them one is only limited by the plan's capacity.
     */
    public function test_employee_without_a_branch_is_not_capacity_checked_against_a_branch(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);

        $this->actingAsCompanyAdmin($company);

        $destination = Branch::factory()->create(['company_id' => $company->id, 'status' => 'active']);

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'branch_id' => null,
            'status' => 'active',
        ]);

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", [
            'branch_id' => $destination->id,
        ])->assertOk();

        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'branch_id' => $destination->id,
        ]);
    }

    /**
     * `plans.max_branches` is still enforced: a company that already uses its
     * full branch allowance cannot switch to a plan that would be over the
     * limit.
     */
    public function test_branch_allowance_is_still_enforced_on_plan_change(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription(['max_branches' => 3]);

        $this->actingAsCompanyAdmin($company);

        // Two active branches exist with no branch-subscription rows at all —
        // counting reads `branches.status` directly.
        Branch::factory()->count(2)->create([
            'company_id' => $company->id,
            'status' => 'active',
        ]);

        $smallPlan = Plan::factory()->create([
            'max_branches' => 1,
            'max_employees' => 25,
        ]);

        $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $smallPlan->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'DOWNGRADE_BRANCH_LIMIT_EXCEEDED')
            ->assertJsonPath('errors.used', 2)
            ->assertJsonPath('errors.limit', 1);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $subscription->plan_id,
        ]);
    }
}
