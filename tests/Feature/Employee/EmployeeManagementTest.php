<?php

namespace Tests\Feature\Employee;

use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Position;
use App\Models\User;
use App\Notifications\EmployeeInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class EmployeeManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seedRolesAndPermissions();
    }

    /**
     * Seed the roles and permissions needed for employee management.
     */
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

        Role::findOrCreate('scheduler', 'web');
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

    public function test_guest_cannot_access_employees(): void
    {
        $this->getJson('/api/v1/employees')->assertUnauthorized();
    }

    public function test_super_admin_can_list_employees(): void
    {
        $this->actingAsSuperAdmin();
        Employee::factory()->count(3)->create();

        $this->getJson('/api/v1/employees')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_employees_can_be_filtered_by_search(): void
    {
        $this->actingAsSuperAdmin();
        Employee::factory()->create(['first_name' => 'Alice', 'last_name' => 'Walker']);
        Employee::factory()->create(['first_name' => 'Bob', 'last_name' => 'Stone']);

        $response = $this->getJson('/api/v1/employees?search=Alice');

        $response->assertOk()->assertJsonCount(1, 'data.data');
        $this->assertSame('Alice', $response->json('data.data.0.first_name'));
    }

    public function test_super_admin_can_create_an_employee(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $department = Department::factory()->create(['company_id' => $company->id]);
        $position = Position::factory()->create(['company_id' => $company->id]);

        $payload = [
            'company_id' => $company->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'employment_type' => 'full_time',
            'hourly_rate' => 40.00,
        ];

        $response = $this->postJson('/api/v1/employees', $payload);

        $response->assertCreated()->assertJsonPath('data.full_name', 'Jane Doe');
        $this->assertDatabaseHas('employees', [
            'first_name' => 'Jane',
            'company_id' => $company->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
        ]);
    }

    public function test_creating_an_employee_requires_names(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/employees', ['company_id' => $company->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['first_name', 'last_name']);
    }

    public function test_invalid_employment_type_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'employment_type' => 'freelancer',
        ])->assertUnprocessable()->assertJsonValidationErrors('employment_type');
    }

    public function test_super_admin_can_create_employee_with_photo(): void
    {
        Storage::fake('public');
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/employees', [
            'company_id' => $company->id,
            'first_name' => 'Photo',
            'last_name' => 'Person',
            'photo' => UploadedFile::fake()->image('avatar.jpg'),
        ]);

        $response->assertCreated();
        $path = $response->json('data.photo');
        $this->assertNotNull($path);
        Storage::disk('public')->assertExists($path);
    }

    public function test_super_admin_can_view_an_employee(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();

        $this->getJson("/api/v1/employees/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $employee->id);
    }

    public function test_super_admin_can_update_an_employee(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create(['first_name' => 'Old']);

        $this->putJson("/api/v1/employees/{$employee->id}", ['first_name' => 'New'])
            ->assertOk()
            ->assertJsonPath('data.first_name', 'New');
        $this->assertDatabaseHas('employees', ['id' => $employee->id, 'first_name' => 'New']);
    }

    public function test_super_admin_can_delete_an_employee(): void
    {
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();

        $this->deleteJson("/api/v1/employees/{$employee->id}")->assertOk();
        $this->assertDatabaseMissing('employees', ['id' => $employee->id]);
    }

    public function test_super_admin_can_invite_an_employee(): void
    {
        Notification::fake();
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/employees/invite', [
            'company_id' => $company->id,
            'email' => 'invitee@example.com',
            'first_name' => 'Invited',
            'last_name' => 'User',
            'role' => 'employee',
        ]);

        $response->assertCreated()->assertJsonPath('data.first_name', 'Invited');

        $this->assertDatabaseHas('users', [
            'email' => 'invitee@example.com',
            'company_id' => $company->id,
            'role' => 'employee',
        ]);
        $this->assertDatabaseHas('employees', [
            'first_name' => 'Invited',
            'company_id' => $company->id,
        ]);

        $user = User::where('email', 'invitee@example.com')->first();
        $this->assertTrue($user->hasRole('employee'));
        Notification::assertSentTo($user, EmployeeInvitationNotification::class);
    }

    public function test_inviting_requires_unique_email(): void
    {
        Notification::fake();
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        User::factory()->create(['email' => 'taken@example.com']);

        $this->postJson('/api/v1/employees/invite', [
            'company_id' => $company->id,
            'email' => 'taken@example.com',
            'first_name' => 'Dupe',
            'last_name' => 'User',
            'role' => 'employee',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_can_assign_role_to_employee(): void
    {
        $this->actingAsSuperAdmin();
        $user = User::factory()->create(['role' => 'employee']);
        $user->assignRole('employee');
        $employee = Employee::factory()->create(['user_id' => $user->id]);

        $this->postJson("/api/v1/employees/{$employee->id}/role", ['role' => 'scheduler'])
            ->assertOk();

        $this->assertTrue($user->fresh()->hasRole('scheduler'));
        $this->assertFalse($user->fresh()->hasRole('employee'));
        $this->assertDatabaseHas('users', ['id' => $user->id, 'role' => 'scheduler']);
    }

    public function test_can_assign_department_to_employee(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $employee = Employee::factory()->create(['company_id' => $company->id, 'department_id' => null]);
        $department = Department::factory()->create(['company_id' => $company->id]);

        $this->postJson("/api/v1/employees/{$employee->id}/department", ['department_id' => $department->id])
            ->assertOk()
            ->assertJsonPath('data.department_id', $department->id);
        $this->assertDatabaseHas('employees', ['id' => $employee->id, 'department_id' => $department->id]);
    }

    public function test_can_assign_position_to_employee(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $employee = Employee::factory()->create(['company_id' => $company->id, 'position_id' => null]);
        $position = Position::factory()->create(['company_id' => $company->id]);

        $this->postJson("/api/v1/employees/{$employee->id}/position", ['position_id' => $position->id])
            ->assertOk()
            ->assertJsonPath('data.position_id', $position->id);
        $this->assertDatabaseHas('employees', ['id' => $employee->id, 'position_id' => $position->id]);
    }

    public function test_can_upload_employee_photo(): void
    {
        Storage::fake('public');
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create(['photo' => null]);

        $response = $this->postJson("/api/v1/employees/{$employee->id}/photo", [
            'photo' => UploadedFile::fake()->image('profile.png'),
        ]);

        $response->assertOk();
        $path = $response->json('data.photo');
        $this->assertNotNull($path);
        Storage::disk('public')->assertExists($path);
        $this->assertDatabaseHas('employees', ['id' => $employee->id, 'photo' => $path]);
    }

    public function test_photo_upload_rejects_non_image(): void
    {
        Storage::fake('public');
        $this->actingAsSuperAdmin();
        $employee = Employee::factory()->create();

        $this->postJson("/api/v1/employees/{$employee->id}/photo", [
            'photo' => UploadedFile::fake()->create('document.pdf', 100, 'application/pdf'),
        ])->assertUnprocessable()->assertJsonValidationErrors('photo');
    }

    public function test_company_admin_only_sees_own_company_employees(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        Employee::factory()->count(2)->create(['company_id' => $company->id]);
        Employee::factory()->count(3)->create(['company_id' => $otherCompany->id]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/employees')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_creates_employee_scoped_to_own_company(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $response = $this->postJson('/api/v1/employees', [
            'company_id' => $otherCompany->id,
            'first_name' => 'Scoped',
            'last_name' => 'Employee',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('employees', [
            'first_name' => 'Scoped',
            'company_id' => $company->id,
        ]);
    }

    public function test_company_admin_cannot_view_other_company_employee(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $employee = Employee::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/employees/{$employee->id}")->assertForbidden();
    }

    public function test_company_admin_cannot_update_other_company_employee(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $employee = Employee::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->putJson("/api/v1/employees/{$employee->id}", ['first_name' => 'Hacked'])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_delete_other_company_employee(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $employee = Employee::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->deleteJson("/api/v1/employees/{$employee->id}")->assertForbidden();
    }

    public function test_user_without_permissions_cannot_list_employees(): void
    {
        $user = User::factory()->create();
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/employees')->assertForbidden();
    }
}
