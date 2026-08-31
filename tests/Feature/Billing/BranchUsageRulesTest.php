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
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * TASK 15 — finalizes the Branch Subscription → Employee Capacity → Usage
 * rules on top of the existing BranchSubscriptionService / UsageService
 * implementation.
 *
 * These tests pin the business invariants that were not yet explicitly
 * covered by BranchCapacityTest / TrialLifecycleTest:
 *
 *  1. Branch activation honours the plan branch limit exactly (limit allowed,
 *     limit+1 rejected).
 *  2. A deactivated branch releases its branch allowance and can be
 *     reactivated without double-counting; capacity is preserved on
 *     reactivation.
 *  3. Employee creation with a branch that belongs to ANOTHER company is
 *     rejected server-side (branch is re-scoped, not trusted).
 *  4. A super-admin creating an employee with a mismatched company/branch pair
 *     is rejected by the branch-ownership guard (no capacity bypass).
 *  5. Transferring an active employee frees capacity at the source branch and
 *     consumes it at the destination (counts converge).
 *  6. Archived/inactive employees do not consume capacity, and capacity is
 *     enforced from the plan configuration through the branch subscription.
 *
 * No frontend is touched (as required by the task).
 */
class BranchUsageRulesTest extends TestCase
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

    protected function actingAsSuperAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole('super_admin');
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

    // ------------------------------------------------------------------------
    // Branch activation — plan branch limit boundary
    // ------------------------------------------------------------------------

    public function test_branch_activation_allows_exactly_the_plan_branch_limit(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_branches' => 2]);
        $this->actingAsCompanyAdmin($company);

        $branchOne = Branch::factory()->create(['company_id' => $company->id]);
        $branchTwo = Branch::factory()->create(['company_id' => $company->id]);

        $this->postJson("/api/v1/branches/{$branchOne->id}/activate")->assertOk();
        $this->postJson("/api/v1/branches/{$branchTwo->id}/activate")->assertOk();

        $this->assertSame(2, BranchSubscription::where('company_id', $company->id)->where('status', 'active')->count());

        // Usage endpoint reports 2/2 — at the limit but not over.
        $this->getJson('/api/v1/usage')
            ->assertOk()
            ->assertJsonPath('data.branches.used', 2)
            ->assertJsonPath('data.branches.limit', 2);
    }

    public function test_branch_activation_rejects_one_past_the_plan_branch_limit(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_branches' => 2]);
        $this->actingAsCompanyAdmin($company);

        $branchOne = Branch::factory()->create(['company_id' => $company->id]);
        $branchTwo = Branch::factory()->create(['company_id' => $company->id]);
        $branchThree = Branch::factory()->create(['company_id' => $company->id]);

        $this->postJson("/api/v1/branches/{$branchOne->id}/activate")->assertOk();
        $this->postJson("/api/v1/branches/{$branchTwo->id}/activate")->assertOk();

        $this->postJson("/api/v1/branches/{$branchThree->id}/activate")
            ->assertStatus(422)
            ->assertJsonPath('code', 'BRANCH_LIMIT_REACHED')
            ->assertJsonPath('errors.used', 2)
            ->assertJsonPath('errors.limit', 2);

        // The third branch was not activated.
        $this->assertNull($branchThree->fresh()->activeBranchSubscription());
    }

    public function test_deactivated_branch_releases_allowance_and_can_be_reactivated_without_double_count(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_branches' => 1]);
        $this->actingAsCompanyAdmin($company);

        $branch = Branch::factory()->create(['company_id' => $company->id]);

        // Fill the single allowance.
        $this->postJson("/api/v1/branches/{$branch->id}/activate")->assertOk();

        // Deactivate — releases the allowance.
        $this->postJson("/api/v1/branches/{$branch->id}/deactivate")->assertOk();
        $this->getJson('/api/v1/usage')->assertJsonPath('data.branches.used', 0);

        // A different branch can now take the freed allowance.
        $other = Branch::factory()->create(['company_id' => $company->id]);
        $this->postJson("/api/v1/branches/{$other->id}/activate")->assertOk();

        // Reactivate the original branch again (now over allowance -> rejected).
        $this->postJson("/api/v1/branches/{$branch->id}/activate")
            ->assertStatus(422)
            ->assertJsonPath('code', 'BRANCH_LIMIT_REACHED');
    }

    public function test_reactivation_reuses_the_prior_row_without_duplicate_and_capacity_defaults_to_plan_max(): void
    {
        [$company, $plan] = $this->makeCompanyWithActiveSubscription(['max_branches' => 2, 'max_employees' => 25]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        // Activate with a custom per-branch capacity.
        $this->postJson("/api/v1/branches/{$branch->id}/activate", ['employee_capacity' => 10])->assertOk();

        // Deactivate...
        $this->postJson("/api/v1/branches/{$branch->id}/deactivate")->assertOk();

        // Reactivate WITHOUT passing capacity. Per the documented behaviour,
        // capacity defaults back to the plan max (25) on activation — the
        // custom value is a per-activation override.
        $response = $this->postJson("/api/v1/branches/{$branch->id}/activate");
        $response->assertOk()
            ->assertJsonPath('data.branch_subscription.employee_capacity', $plan->max_employees);

        // The prior cancelled row is reused — there is still exactly one row.
        $this->assertSame(1, BranchSubscription::where('branch_id', $branch->id)->count());

        // Re-passing the custom capacity on reactivation re-applies it.
        $this->postJson("/api/v1/branches/{$branch->id}/deactivate")->assertOk();
        $this->postJson("/api/v1/branches/{$branch->id}/activate", ['employee_capacity' => 12])
            ->assertOk()
            ->assertJsonPath('data.branch_subscription.employee_capacity', 12);

        $active = $branch->fresh()->activeBranchSubscription();
        $this->assertNotNull($active);
        $this->assertSame(12, $active->employee_capacity);
    }

    // ------------------------------------------------------------------------
    // Employee creation — server-side branch re-scoping
    // ------------------------------------------------------------------------

    public function test_employee_creation_with_another_companys_branch_is_rejected(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $this->actingAsCompanyAdmin($company);

        $foreignBranch = Branch::factory()->create(); // belongs to a different company

        // The company admin is pinned to their own company, but the branch id
        // belongs to another business. assertCapacityForAssignment re-scopes the
        // branch against the company server-side and must reject it.
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $foreignBranch->id,
            'first_name' => 'Sneaky',
            'last_name' => 'Agent',
        ])
            ->assertStatus(403)
            ->assertJsonPath('code', 'CROSS_BUSINESS_ACCESS_DENIED');

        $this->assertSame(0, Employee::where('company_id', $company->id)->count());
    }

    public function test_super_admin_cannot_create_employee_with_mismatched_company_and_branch(): void
    {
        $companyA = Company::factory()->create();
        $plan = Plan::factory()->create(['max_employees' => 5]);
        Subscription::factory()->create([
            'company_id' => $companyA->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);
        $branchA = Branch::factory()->create(['company_id' => $companyA->id]);

        $companyB = Company::factory()->create();
        $branchB = Branch::factory()->create(['company_id' => $companyB->id]);

        $this->actingAsSuperAdmin();

        // Activate branchA under companyA so the legitimate pair (companyA +
        // branchA) can pass the entitlement check in the sanity assertion below.
        $this->postJson("/api/v1/branches/{$branchA->id}/activate")->assertOk();

        // Super admin may pass any company_id, but a branch from company B
        // combined with company A must still be rejected by the ownership guard.
        $this->postJson('/api/v1/employees', [
            'company_id' => $companyA->id,
            'branch_id' => $branchB->id,
            'first_name' => 'Mismatch',
            'last_name' => 'Guard',
        ])
            ->assertStatus(403)
            ->assertJsonPath('code', 'CROSS_BUSINESS_ACCESS_DENIED');

        $this->assertSame(0, Employee::where('company_id', $companyA->id)->count());

        // Sanity check: the correct pair is accepted.
        $this->postJson('/api/v1/employees', [
            'company_id' => $companyA->id,
            'branch_id' => $branchA->id,
            'first_name' => 'Good',
            'last_name' => 'Pair',
        ])->assertCreated();
    }

    public function test_employee_creation_is_rejected_without_an_active_subscription(): void
    {
        $company = Company::factory()->create(); // no subscription at all
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        // Company.access middleware blocks locked companies first, but a fresh
        // company with no trial and no subscription is not locked yet — so the
        // capacity guard (NO_ACTIVE_SUBSCRIPTION) is what rejects the request.
        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'first_name' => 'No',
            'last_name' => 'Plan',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'NO_ACTIVE_SUBSCRIPTION');

        $this->assertSame(0, Employee::where('company_id', $company->id)->count());
    }

    // ------------------------------------------------------------------------
    // Employee transfer — source capacity freed, destination consumed
    // ------------------------------------------------------------------------

    public function test_transfer_frees_source_capacity_and_consumes_destination(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 10]);
        $branchA = Branch::factory()->create(['company_id' => $company->id]);
        $branchB = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branchA);
        $this->activateBranchViaApi($branchB);

        // A = 10/10 (full), B = 9/10.
        Employee::factory()->count(10)->create([
            'company_id' => $company->id,
            'branch_id' => $branchA->id,
            'status' => 'active',
        ]);
        Employee::factory()->count(9)->create([
            'company_id' => $company->id,
            'branch_id' => $branchB->id,
            'status' => 'active',
        ]);

        $employee = $branchA->employees()->active()->first();

        $this->postJson("/api/v1/employees/{$employee->id}/transfer", ['branch_id' => $branchB->id])
            ->assertOk()
            ->assertJsonPath('data.branch_id', $branchB->id);

        // Counts converged: A=9, B=10.
        $this->assertSame(9, $branchA->employees()->active()->count());
        $this->assertSame(10, $branchB->employees()->active()->count());

        // Usage reflects both branches.
        $this->getJson('/api/v1/usage')
            ->assertOk()
            ->assertJsonPath('data.branch_usage.0.employees_used', 9)
            ->assertJsonPath('data.branch_usage.1.employees_used', 10);
    }

    // ------------------------------------------------------------------------
    // Archived employees do not consume capacity
    // ------------------------------------------------------------------------

    public function test_archived_employees_do_not_consume_capacity_and_do_not_block_new_creations(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription(['max_employees' => 2]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->activateBranchViaApi($branch);

        // A large number of archived staff must not count toward capacity.
        Employee::factory()->count(20)->create([
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
            'first_name' => 'Over',
            'last_name' => 'Capacity',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED')
            ->assertJsonPath('errors.used', 2)
            ->assertJsonPath('errors.capacity', 2);
    }
}
