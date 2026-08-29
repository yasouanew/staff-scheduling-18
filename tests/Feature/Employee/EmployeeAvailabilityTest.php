<?php

namespace Tests\Feature\Employee;

use App\Models\Company;
use App\Models\Employee;
use App\Models\EmployeeAvailability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class EmployeeAvailabilityTest extends TestCase
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

        foreach (['employee.view', 'employee.create', 'employee.edit', 'employee.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['employee.view', 'employee.create', 'employee.edit', 'employee.delete']);

        Role::findOrCreate('employee', 'web');
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

    public function test_guest_cannot_access_availability(): void
    {
        $employee = Employee::factory()->create();

        $this->getJson("/api/v1/employees/{$employee->id}/availabilities")->assertUnauthorized();
    }

    public function test_can_list_employee_availability(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();
        EmployeeAvailability::factory()->count(3)->create(['employee_id' => $employee->id]);

        $this->getJson("/api/v1/employees/{$employee->id}/availabilities")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data');
    }

    public function test_can_create_availability_slot(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();

        $response = $this->postJson("/api/v1/employees/{$employee->id}/availabilities", [
            'day_of_week' => 1,
            'start_time' => '09:00',
            'end_time' => '17:00',
            'is_available' => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.day_of_week', 1)
            ->assertJsonPath('data.day_name', 'Monday');
        $this->assertDatabaseHas('employee_availabilities', [
            'employee_id' => $employee->id,
            'day_of_week' => 1,
            'is_available' => true,
        ]);
    }

    public function test_creating_slot_requires_valid_day_of_week(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();

        $this->postJson("/api/v1/employees/{$employee->id}/availabilities", [
            'day_of_week' => 9,
        ])->assertUnprocessable()->assertJsonValidationErrors('day_of_week');
    }

    public function test_end_time_must_be_after_start_time(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();

        $this->postJson("/api/v1/employees/{$employee->id}/availabilities", [
            'day_of_week' => 2,
            'start_time' => '17:00',
            'end_time' => '09:00',
        ])->assertUnprocessable()->assertJsonValidationErrors('end_time');
    }

    public function test_can_sync_weekly_availability(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();
        // Existing slot that should be replaced.
        EmployeeAvailability::factory()->create(['employee_id' => $employee->id, 'day_of_week' => 0]);

        $payload = [
            'availabilities' => [
                ['day_of_week' => 1, 'start_time' => '09:00', 'end_time' => '17:00', 'is_available' => true],
                ['day_of_week' => 2, 'start_time' => '10:00', 'end_time' => '18:00', 'is_available' => true],
                ['day_of_week' => 3, 'is_available' => false],
            ],
        ];

        $response = $this->putJson("/api/v1/employees/{$employee->id}/availabilities/sync", $payload);

        $response->assertOk()->assertJsonCount(3, 'data');
        $this->assertDatabaseCount('employee_availabilities', 3);
        $this->assertDatabaseMissing('employee_availabilities', ['employee_id' => $employee->id, 'day_of_week' => 0]);
        $this->assertDatabaseHas('employee_availabilities', ['employee_id' => $employee->id, 'day_of_week' => 3, 'is_available' => false]);
    }

    public function test_sync_requires_at_least_one_slot(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();

        $this->putJson("/api/v1/employees/{$employee->id}/availabilities/sync", ['availabilities' => []])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('availabilities');
    }

    public function test_can_show_availability_slot(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();
        $slot = EmployeeAvailability::factory()->create(['employee_id' => $employee->id]);

        $this->getJson("/api/v1/employees/{$employee->id}/availabilities/{$slot->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $slot->id);
    }

    public function test_can_update_availability_slot(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();
        $slot = EmployeeAvailability::factory()->create(['employee_id' => $employee->id, 'is_available' => true]);

        $this->putJson("/api/v1/employees/{$employee->id}/availabilities/{$slot->id}", [
            'is_available' => false,
        ])->assertOk()->assertJsonPath('data.is_available', false);
        $this->assertDatabaseHas('employee_availabilities', ['id' => $slot->id, 'is_available' => false]);
    }

    public function test_can_delete_availability_slot(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();
        $slot = EmployeeAvailability::factory()->create(['employee_id' => $employee->id]);

        $this->deleteJson("/api/v1/employees/{$employee->id}/availabilities/{$slot->id}")->assertOk();
        $this->assertDatabaseMissing('employee_availabilities', ['id' => $slot->id]);
    }

    public function test_cannot_access_slot_belonging_to_other_employee(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();
        $otherEmployee = Employee::factory()->create();
        $slot = EmployeeAvailability::factory()->create(['employee_id' => $otherEmployee->id]);

        $this->getJson("/api/v1/employees/{$employee->id}/availabilities/{$slot->id}")->assertNotFound();
    }

    public function test_company_admin_cannot_manage_other_company_availability(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $employee = Employee::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->postJson("/api/v1/employees/{$employee->id}/availabilities", [
            'day_of_week' => 1,
        ])->assertForbidden();
    }

    public function test_employee_without_permission_cannot_view_availability(): void
    {
        $employee = Employee::factory()->create();
        $user = User::factory()->create(['company_id' => $employee->company_id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->getJson("/api/v1/employees/{$employee->id}/availabilities")->assertForbidden();
    }
}
