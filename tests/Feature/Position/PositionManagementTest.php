<?php

namespace Tests\Feature\Position;

use App\Models\Company;
use App\Models\Department;
use App\Models\Position;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class PositionManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedRolesAndPermissions();
    }

    /**
     * Seed the roles and permissions needed for position management.
     */
    protected function seedRolesAndPermissions(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['position.view', 'position.create', 'position.edit', 'position.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['position.view', 'position.create', 'position.edit', 'position.delete']);

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

    public function test_guest_cannot_access_positions(): void
    {
        $this->getJson('/api/v1/positions')->assertUnauthorized();
    }

    public function test_super_admin_can_list_positions(): void
    {
        $this->actingAsSuperAdmin();
        Position::factory()->count(3)->create();

        $response = $this->getJson('/api/v1/positions');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_positions_can_be_filtered_by_search(): void
    {
        $this->actingAsSuperAdmin();
        Position::factory()->create(['name' => 'Barista']);
        Position::factory()->create(['name' => 'Store Manager']);

        $response = $this->getJson('/api/v1/positions?search=Barista');

        $response->assertOk()->assertJsonCount(1, 'data.data');
        $this->assertSame('Barista', $response->json('data.data.0.name'));
    }

    public function test_super_admin_can_create_a_position(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $department = Department::factory()->create(['company_id' => $company->id]);

        $payload = [
            'company_id' => $company->id,
            'department_id' => $department->id,
            'name' => 'Shift Supervisor',
            'code' => 'SUP',
            'default_hourly_rate' => 32.50,
            'color' => '#FF5733',
        ];

        $response = $this->postJson('/api/v1/positions', $payload);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Shift Supervisor');

        $this->assertDatabaseHas('positions', [
            'name' => 'Shift Supervisor',
            'company_id' => $company->id,
            'department_id' => $department->id,
        ]);
    }

    public function test_creating_a_position_requires_a_name(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/positions', ['company_id' => $company->id]);

        $response->assertUnprocessable()->assertJsonValidationErrors('name');
    }

    public function test_invalid_status_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/positions', [
            'company_id' => $company->id,
            'name' => 'Bad Status Position',
            'status' => 'exploded',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_invalid_hourly_rate_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/positions', [
            'company_id' => $company->id,
            'name' => 'Bad Rate Position',
            'default_hourly_rate' => -5,
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('default_hourly_rate');
    }

    public function test_super_admin_can_view_a_position(): void
    {
        $this->actingAsSuperAdmin();
        $position = Position::factory()->create();

        $this->getJson("/api/v1/positions/{$position->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $position->id);
    }

    public function test_super_admin_can_update_a_position(): void
    {
        $this->actingAsSuperAdmin();
        $position = Position::factory()->create(['name' => 'Old Position']);

        $response = $this->putJson("/api/v1/positions/{$position->id}", [
            'name' => 'Updated Position',
        ]);

        $response->assertOk()->assertJsonPath('data.name', 'Updated Position');
        $this->assertDatabaseHas('positions', ['id' => $position->id, 'name' => 'Updated Position']);
    }

    public function test_super_admin_can_delete_a_position(): void
    {
        $this->actingAsSuperAdmin();
        $position = Position::factory()->create();

        $this->deleteJson("/api/v1/positions/{$position->id}")->assertOk();
        $this->assertSoftDeleted('positions', ['id' => $position->id]);
    }

    public function test_company_admin_only_sees_own_company_positions(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        Position::factory()->count(2)->create(['company_id' => $company->id]);
        Position::factory()->count(3)->create(['company_id' => $otherCompany->id]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/positions')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_creates_position_scoped_to_own_company(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $admin = $this->actingAsCompanyAdmin($company);

        // Even if they try to pass another company_id, it is forced to their own.
        $response = $this->postJson('/api/v1/positions', [
            'company_id' => $otherCompany->id,
            'name' => 'Scoped Position',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('positions', [
            'name' => 'Scoped Position',
            'company_id' => $company->id,
            'created_by' => $admin->id,
        ]);
    }

    public function test_company_admin_can_update_own_position(): void
    {
        $company = Company::factory()->create();
        $position = Position::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $this->putJson("/api/v1/positions/{$position->id}", ['name' => 'Renamed'])
            ->assertOk();
    }

    public function test_company_admin_cannot_update_other_company_position(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $position = Position::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->putJson("/api/v1/positions/{$position->id}", ['name' => 'Hacked'])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_view_other_company_position(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $position = Position::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/positions/{$position->id}")
            ->assertForbidden();
    }

    public function test_company_admin_cannot_delete_other_company_position(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $position = Position::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->deleteJson("/api/v1/positions/{$position->id}")
            ->assertForbidden();
    }

    public function test_user_without_permissions_cannot_list_positions(): void
    {
        $user = User::factory()->create();
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/positions')->assertForbidden();
    }
}
