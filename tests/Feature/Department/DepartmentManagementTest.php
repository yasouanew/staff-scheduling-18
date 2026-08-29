<?php

namespace Tests\Feature\Department;

use App\Models\Company;
use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class DepartmentManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedRolesAndPermissions();
    }

    /**
     * Seed the roles and permissions needed for department management.
     */
    protected function seedRolesAndPermissions(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['department.view', 'department.create', 'department.edit', 'department.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['department.view', 'department.create', 'department.edit', 'department.delete']);

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

    public function test_guest_cannot_access_departments(): void
    {
        $this->getJson('/api/v1/departments')->assertUnauthorized();
    }

    public function test_super_admin_can_list_departments(): void
    {
        $this->actingAsSuperAdmin();
        Department::factory()->count(3)->create();

        $response = $this->getJson('/api/v1/departments');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_departments_can_be_filtered_by_search(): void
    {
        $this->actingAsSuperAdmin();
        Department::factory()->create(['name' => 'Engineering']);
        Department::factory()->create(['name' => 'Human Resources']);

        $response = $this->getJson('/api/v1/departments?search=Engineering');

        $response->assertOk()->assertJsonCount(1, 'data.data');
        $this->assertSame('Engineering', $response->json('data.data.0.name'));
    }

    public function test_super_admin_can_create_a_department(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $payload = [
            'company_id' => $company->id,
            'name' => 'Marketing',
            'code' => 'MKT',
            'color' => '#FF5733',
        ];

        $response = $this->postJson('/api/v1/departments', $payload);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Marketing');

        $this->assertDatabaseHas('departments', [
            'name' => 'Marketing',
            'company_id' => $company->id,
        ]);
    }

    public function test_creating_a_department_requires_a_name(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/departments', ['company_id' => $company->id]);

        $response->assertUnprocessable()->assertJsonValidationErrors('name');
    }

    public function test_invalid_status_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/departments', [
            'company_id' => $company->id,
            'name' => 'Bad Status Dept',
            'status' => 'exploded',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_invalid_color_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/departments', [
            'company_id' => $company->id,
            'name' => 'Bad Color Dept',
            'color' => 'not-a-color',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('color');
    }

    public function test_super_admin_can_view_a_department(): void
    {
        $this->actingAsSuperAdmin();
        $department = Department::factory()->create();

        $this->getJson("/api/v1/departments/{$department->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $department->id);
    }

    public function test_super_admin_can_update_a_department(): void
    {
        $this->actingAsSuperAdmin();
        $department = Department::factory()->create(['name' => 'Old Dept']);

        $response = $this->putJson("/api/v1/departments/{$department->id}", [
            'name' => 'Updated Dept',
        ]);

        $response->assertOk()->assertJsonPath('data.name', 'Updated Dept');
        $this->assertDatabaseHas('departments', ['id' => $department->id, 'name' => 'Updated Dept']);
    }

    public function test_super_admin_can_delete_a_department(): void
    {
        $this->actingAsSuperAdmin();
        $department = Department::factory()->create();

        $this->deleteJson("/api/v1/departments/{$department->id}")->assertOk();
        $this->assertSoftDeleted('departments', ['id' => $department->id]);
    }

    public function test_company_admin_only_sees_own_company_departments(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        Department::factory()->count(2)->create(['company_id' => $company->id]);
        Department::factory()->count(3)->create(['company_id' => $otherCompany->id]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/departments')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_creates_department_scoped_to_own_company(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $admin = $this->actingAsCompanyAdmin($company);

        // Even if they try to pass another company_id, it is forced to their own.
        $response = $this->postJson('/api/v1/departments', [
            'company_id' => $otherCompany->id,
            'name' => 'Scoped Dept',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('departments', [
            'name' => 'Scoped Dept',
            'company_id' => $company->id,
            'created_by' => $admin->id,
        ]);
    }

    public function test_company_admin_can_update_own_department(): void
    {
        $company = Company::factory()->create();
        $department = Department::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->putJson("/api/v1/departments/{$department->id}", ['name' => 'Renamed'])
            ->assertOk();
    }

    public function test_company_admin_cannot_update_other_company_department(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $department = Department::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->putJson("/api/v1/departments/{$department->id}", ['name' => 'Hacked'])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_view_other_company_department(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $department = Department::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/departments/{$department->id}")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_delete_other_company_department(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $department = Department::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->deleteJson("/api/v1/departments/{$department->id}")
            ->assertForbidden();
    }

    public function test_user_without_permissions_cannot_list_departments(): void
    {
        $user = User::factory()->create();
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/departments')->assertForbidden();
    }
}
