<?php

namespace Tests\Feature\Shift;

use App\Models\Company;
use App\Models\Employee;
use App\Models\Roster;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class ShiftManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedRolesAndPermissions();
    }

    protected function seedRolesAndPermissions(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['shift.view', 'shift.create', 'shift.edit', 'shift.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['shift.view', 'shift.create', 'shift.edit', 'shift.delete']);

        $employee = Role::findOrCreate('employee', 'web');
        $employee->syncPermissions(['shift.view']);
    }

    protected function actingAsSuperAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_guest_cannot_access_shifts(): void
    {
        $this->getJson('/api/v1/shifts')->assertUnauthorized();
    }

    public function test_super_admin_can_list_shifts(): void
    {
        $this->actingAsSuperAdmin();
        Shift::factory()->count(3)->create();

        $this->getJson('/api/v1/shifts')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_super_admin_can_create_a_shift(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $roster = Roster::factory()->create(['company_id' => $company->id]);
        $employee = Employee::factory()->create(['company_id' => $company->id]);

        $response = $this->postJson('/api/v1/shifts', [
            'company_id' => $company->id,
            'roster_id' => $roster->id,
            'employee_id' => $employee->id,
            'date' => '2026-01-05',
            'start_time' => '09:00',
            'end_time' => '17:00',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'scheduled')
            ->assertJsonPath('data.date', '2026-01-05');
        $this->assertDatabaseHas('shifts', [
            'company_id' => $company->id,
            'employee_id' => $employee->id,
            'status' => 'scheduled',
        ]);
    }

    public function test_creating_a_shift_requires_roster_date_and_times(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/shifts', ['company_id' => $company->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['roster_id', 'date', 'start_time', 'end_time']);
    }

    public function test_super_admin_can_view_a_shift(): void
    {
        $this->actingAsSuperAdmin();
        $shift = Shift::factory()->create();

        $this->getJson("/api/v1/shifts/{$shift->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $shift->id);
    }

    public function test_super_admin_can_update_a_shift(): void
    {
        $this->actingAsSuperAdmin();
        $shift = Shift::factory()->create(['status' => 'scheduled']);

        $this->putJson("/api/v1/shifts/{$shift->id}", ['status' => 'completed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');
    }

    public function test_super_admin_can_delete_a_shift(): void
    {
        $this->actingAsSuperAdmin();
        $shift = Shift::factory()->create();

        $this->deleteJson("/api/v1/shifts/{$shift->id}")->assertOk();
        $this->assertDatabaseMissing('shifts', ['id' => $shift->id]);
    }

    public function test_can_assign_employee_to_shift(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $shift = Shift::factory()->create(['company_id' => $company->id, 'employee_id' => null]);
        $employee = Employee::factory()->create(['company_id' => $company->id]);

        $this->postJson("/api/v1/shifts/{$shift->id}/assign-employee", [
            'employee_id' => $employee->id,
        ])->assertOk()
            ->assertJsonPath('data.employee_id', $employee->id);

        $this->assertDatabaseHas('shifts', [
            'id' => $shift->id,
            'employee_id' => $employee->id,
        ]);
    }

    public function test_company_admin_only_sees_own_company_shifts(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        Shift::factory()->count(2)->create(['company_id' => $company->id]);
        Shift::factory()->count(3)->create(['company_id' => $otherCompany->id]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/shifts')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_creates_shift_scoped_to_own_company(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $roster = Roster::factory()->create(['company_id' => $company->id]);
        $this->actingAsCompanyAdmin($company);

        $response = $this->postJson('/api/v1/shifts', [
            'company_id' => $otherCompany->id,
            'roster_id' => $roster->id,
            'date' => '2026-01-05',
            'start_time' => '09:00',
            'end_time' => '17:00',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.company_id', $company->id);
    }

    public function test_company_admin_cannot_view_other_company_shift(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $shift = Shift::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/shifts/{$shift->id}")->assertForbidden();
    }

    public function test_employee_cannot_create_shift(): void
    {
        $company = Company::factory()->create();
        $roster = Roster::factory()->create(['company_id' => $company->id]);
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/shifts', [
            'roster_id' => $roster->id,
            'date' => '2026-01-05',
            'start_time' => '09:00',
            'end_time' => '17:00',
        ])->assertForbidden();
    }
}
