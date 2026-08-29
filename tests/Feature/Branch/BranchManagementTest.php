<?php

namespace Tests\Feature\Branch;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class BranchManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedRolesAndPermissions();
    }

    /**
     * Seed the roles and permissions needed for branch management.
     */
    protected function seedRolesAndPermissions(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['branch.view', 'branch.create', 'branch.edit', 'branch.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['branch.view', 'branch.create', 'branch.edit', 'branch.delete']);

        Role::findOrCreate('employee', 'web');
    }

    /**
     * Create a super admin user authenticated via Sanctum.
     */
    protected function actingAsSuperAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    /**
     * Create a company admin bound to a specific company.
     */
    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_guest_cannot_access_branches(): void
    {
        $this->getJson('/api/v1/branches')->assertUnauthorized();
    }

    public function test_super_admin_can_list_branches(): void
    {
        $this->actingAsSuperAdmin();
        Branch::factory()->count(3)->create();

        $response = $this->getJson('/api/v1/branches');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_branches_can_be_filtered_by_search(): void
    {
        $this->actingAsSuperAdmin();
        Branch::factory()->create(['name' => 'Sydney CBD Branch']);
        Branch::factory()->create(['name' => 'Melbourne Central Branch']);

        $response = $this->getJson('/api/v1/branches?search=Sydney');

        $response->assertOk()->assertJsonCount(1, 'data.data');
        $this->assertSame('Sydney CBD Branch', $response->json('data.data.0.name'));
    }

    public function test_super_admin_can_create_a_branch(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $payload = [
            'company_id' => $company->id,
            'name' => 'North Shore Branch',
            'phone' => '0298765432',
            'timezone' => 'Australia/Sydney',
        ];

        $response = $this->postJson('/api/v1/branches', $payload);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'North Shore Branch');

        $this->assertDatabaseHas('branches', [
            'name' => 'North Shore Branch',
            'company_id' => $company->id,
        ]);
    }

    public function test_super_admin_can_assign_a_manager_to_a_branch(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $manager = Employee::factory()->create([
            'company_id' => $company->id,
            'first_name' => 'Dana',
            'last_name' => 'Scully',
        ]);

        $response = $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Managed Branch',
            'manager_id' => $manager->id,
            'timezone' => 'Australia/Sydney',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.manager_id', $manager->id)
            ->assertJsonPath('data.manager.id', $manager->id)
            ->assertJsonPath('data.manager.name', 'Dana Scully');

        $this->assertDatabaseHas('branches', [
            'name' => 'Managed Branch',
            'manager_id' => $manager->id,
        ]);
    }

    public function test_assigning_a_non_existent_manager_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Bad Manager Branch',
            'manager_id' => 999999,
            'timezone' => 'Australia/Sydney',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('manager_id');
    }

    public function test_manager_can_be_cleared_on_update(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $manager = Employee::factory()->create(['company_id' => $company->id]);
        $branch = Branch::factory()->create([
            'company_id' => $company->id,
            'manager_id' => $manager->id,
        ]);

        $this->putJson("/api/v1/branches/{$branch->id}", ['manager_id' => null])
            ->assertOk()
            ->assertJsonPath('data.manager_id', null);

        $this->assertDatabaseHas('branches', [
            'id' => $branch->id,
            'manager_id' => null,
        ]);
    }

    public function test_creating_a_branch_requires_a_name(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/branches', ['company_id' => $company->id]);

        $response->assertUnprocessable()->assertJsonValidationErrors('name');
    }

    public function test_invalid_status_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Bad Status Branch',
            'status' => 'exploded',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_super_admin_can_view_a_branch(): void
    {
        $this->actingAsSuperAdmin();
        $branch = Branch::factory()->create();

        $this->getJson("/api/v1/branches/{$branch->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $branch->id);
    }

    public function test_super_admin_can_update_a_branch(): void
    {
        $this->actingAsSuperAdmin();
        $branch = Branch::factory()->create(['name' => 'Old Branch']);

        $response = $this->putJson("/api/v1/branches/{$branch->id}", [
            'name' => 'Updated Branch',
        ]);

        $response->assertOk()->assertJsonPath('data.name', 'Updated Branch');
        $this->assertDatabaseHas('branches', ['id' => $branch->id, 'name' => 'Updated Branch']);
    }

    public function test_super_admin_can_delete_a_branch(): void
    {
        $this->actingAsSuperAdmin();
        $branch = Branch::factory()->create();

        $this->deleteJson("/api/v1/branches/{$branch->id}")->assertOk();
        $this->assertDatabaseMissing('branches', ['id' => $branch->id]);
    }

    public function test_company_admin_only_sees_own_company_branches(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        Branch::factory()->count(2)->create(['company_id' => $company->id]);
        Branch::factory()->count(3)->create(['company_id' => $otherCompany->id]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/branches')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_creates_branch_scoped_to_own_company(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        // Even if they try to pass another company_id, it is forced to their own.
        $response = $this->postJson('/api/v1/branches', [
            'company_id' => $otherCompany->id,
            'name' => 'Scoped Branch',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('branches', [
            'name' => 'Scoped Branch',
            'company_id' => $company->id,
        ]);
    }

    public function test_company_admin_can_update_own_branch(): void
    {
        $company = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->putJson("/api/v1/branches/{$branch->id}", ['name' => 'Renamed'])
            ->assertOk();
    }

    public function test_company_admin_cannot_update_other_company_branch(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->putJson("/api/v1/branches/{$branch->id}", ['name' => 'Hacked'])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_view_other_company_branch(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/branches/{$branch->id}")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_delete_other_company_branch(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->deleteJson("/api/v1/branches/{$branch->id}")
            ->assertForbidden();
    }

    public function test_user_without_permissions_cannot_list_branches(): void
    {
        $user = User::factory()->create();
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/branches')->assertForbidden();
    }
}
