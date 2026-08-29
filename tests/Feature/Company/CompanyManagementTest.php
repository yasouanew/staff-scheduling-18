<?php

namespace Tests\Feature\Company;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class CompanyManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedRolesAndPermissions();
    }

    /**
     * Seed the roles and permissions needed for company management.
     */
    protected function seedRolesAndPermissions(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['company.view', 'company.create', 'company.edit', 'company.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['company.view', 'company.edit']);

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

    public function test_guest_cannot_access_companies(): void
    {
        $this->getJson('/api/v1/companies')->assertUnauthorized();
    }

    public function test_super_admin_can_list_companies(): void
    {
        $this->actingAsSuperAdmin();
        Company::factory()->count(3)->create();

        $response = $this->getJson('/api/v1/companies');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_companies_can_be_filtered_by_search(): void
    {
        $this->actingAsSuperAdmin();
        Company::factory()->create(['name' => 'Acme Widgets']);
        Company::factory()->create(['name' => 'Globex Corporation']);

        $response = $this->getJson('/api/v1/companies?search=Acme');

        $response->assertOk()->assertJsonCount(1, 'data.data');
        $this->assertSame('Acme Widgets', $response->json('data.data.0.name'));
    }

    public function test_super_admin_can_create_a_company(): void
    {
        $this->actingAsSuperAdmin();

        $payload = [
            'name' => 'New Venture Pty Ltd',
            'email' => 'hello@newventure.test',
            'business_type' => 'retail',
            'timezone' => 'Australia/Sydney',
        ];

        $response = $this->postJson('/api/v1/companies', $payload);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'New Venture Pty Ltd');

        $this->assertDatabaseHas('companies', [
            'name' => 'New Venture Pty Ltd',
            'email' => 'hello@newventure.test',
        ]);
    }

    public function test_creating_a_company_requires_a_name(): void
    {
        $this->actingAsSuperAdmin();

        $response = $this->postJson('/api/v1/companies', ['email' => 'no-name@test.com']);

        $response->assertUnprocessable()->assertJsonValidationErrors('name');
    }

    public function test_invalid_status_is_rejected(): void
    {
        $this->actingAsSuperAdmin();

        $response = $this->postJson('/api/v1/companies', [
            'name' => 'Bad Status Co',
            'status' => 'exploded',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_super_admin_can_view_a_company(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->getJson("/api/v1/companies/{$company->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $company->id);
    }

    public function test_super_admin_can_update_a_company(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create(['name' => 'Old Name']);

        $response = $this->putJson("/api/v1/companies/{$company->id}", [
            'name' => 'Updated Name',
        ]);

        $response->assertOk()->assertJsonPath('data.name', 'Updated Name');
        $this->assertDatabaseHas('companies', ['id' => $company->id, 'name' => 'Updated Name']);
    }

    public function test_super_admin_can_delete_a_company(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->deleteJson("/api/v1/companies/{$company->id}")->assertOk();
        $this->assertDatabaseMissing('companies', ['id' => $company->id]);
    }

    public function test_company_admin_can_update_own_company(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->putJson("/api/v1/companies/{$company->id}", ['name' => 'Renamed'])
            ->assertOk();
    }

    public function test_company_admin_cannot_update_other_company(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $this->actingAsCompanyAdmin($ownCompany);

        $this->putJson("/api/v1/companies/{$otherCompany->id}", ['name' => 'Hacked'])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_create_company(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->postJson('/api/v1/companies', ['name' => 'Sneaky Co'])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_delete_company(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->deleteJson("/api/v1/companies/{$company->id}")
            ->assertForbidden();
    }

    public function test_user_without_permissions_cannot_list_companies(): void
    {
        $user = User::factory()->create();
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/companies')->assertForbidden();
    }
}
