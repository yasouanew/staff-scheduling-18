<?php

namespace Tests\Feature\ShiftTemplate;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Department;
use App\Models\Position;
use App\Models\ShiftTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class ShiftTemplateManagementTest extends TestCase
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

        foreach (['shift_template.view', 'shift_template.create', 'shift_template.edit', 'shift_template.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['shift_template.view', 'shift_template.create', 'shift_template.edit', 'shift_template.delete']);

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

    public function test_guest_cannot_access_shift_templates(): void
    {
        $this->getJson('/api/v1/shift-templates')->assertUnauthorized();
    }

    public function test_super_admin_can_list_shift_templates(): void
    {
        $this->actingAsSuperAdmin();
        ShiftTemplate::factory()->count(3)->create();

        $this->getJson('/api/v1/shift-templates')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_shift_templates_can_be_filtered_by_search(): void
    {
        $this->actingAsSuperAdmin();
        ShiftTemplate::factory()->create(['name' => 'Morning Opener']);
        ShiftTemplate::factory()->create(['name' => 'Night Closer']);

        $response = $this->getJson('/api/v1/shift-templates?search=Morning');

        $response->assertOk()->assertJsonCount(1, 'data.data');
        $this->assertSame('Morning Opener', $response->json('data.data.0.name'));
    }

    public function test_super_admin_can_create_a_shift_template(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $department = Department::factory()->create(['company_id' => $company->id]);
        $position = Position::factory()->create(['company_id' => $company->id]);

        $payload = [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'name' => 'Morning Shift',
            'description' => 'Opening shift',
            'start_time' => '09:00',
            'end_time' => '17:00',
            'break_minutes' => 30,
            'color' => '#10B981',
            'is_paid_break' => true,
            'status' => 'active',
        ];

        $response = $this->postJson('/api/v1/shift-templates', $payload);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Morning Shift')
            ->assertJsonPath('data.is_paid_break', true);
        $this->assertDatabaseHas('shift_templates', [
            'name' => 'Morning Shift',
            'company_id' => $company->id,
            'created_by' => auth()->id(),
        ]);
    }

    public function test_creating_a_shift_template_requires_name_and_times(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/shift-templates', ['company_id' => $company->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'start_time', 'end_time']);
    }

    public function test_invalid_status_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/shift-templates', [
            'company_id' => $company->id,
            'name' => 'Bad Status',
            'start_time' => '09:00',
            'end_time' => '17:00',
            'status' => 'archived',
        ])->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_super_admin_can_view_a_shift_template(): void
    {
        $this->actingAsSuperAdmin();
        $template = ShiftTemplate::factory()->create();

        $this->getJson("/api/v1/shift-templates/{$template->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $template->id);
    }

    public function test_super_admin_can_update_a_shift_template(): void
    {
        $this->actingAsSuperAdmin();
        $template = ShiftTemplate::factory()->create(['name' => 'Old Name']);

        $this->putJson("/api/v1/shift-templates/{$template->id}", ['name' => 'New Name'])
            ->assertOk()
            ->assertJsonPath('data.name', 'New Name');
        $this->assertDatabaseHas('shift_templates', ['id' => $template->id, 'name' => 'New Name']);
    }

    public function test_super_admin_can_delete_a_shift_template(): void
    {
        $this->actingAsSuperAdmin();
        $template = ShiftTemplate::factory()->create();

        $this->deleteJson("/api/v1/shift-templates/{$template->id}")->assertOk();
        // Soft deleted.
        $this->assertSoftDeleted('shift_templates', ['id' => $template->id]);
    }

    public function test_company_admin_only_sees_own_company_templates(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        ShiftTemplate::factory()->count(2)->create(['company_id' => $company->id]);
        ShiftTemplate::factory()->count(3)->create(['company_id' => $otherCompany->id]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/shift-templates')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_creates_template_scoped_to_own_company(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $response = $this->postJson('/api/v1/shift-templates', [
            'company_id' => $otherCompany->id,
            'name' => 'Scoped Shift',
            'start_time' => '08:00',
            'end_time' => '16:00',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('shift_templates', [
            'name' => 'Scoped Shift',
            'company_id' => $company->id,
        ]);
    }

    public function test_company_admin_cannot_view_other_company_template(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $template = ShiftTemplate::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/shift-templates/{$template->id}")->assertForbidden();
    }

    public function test_company_admin_cannot_update_other_company_template(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $template = ShiftTemplate::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->putJson("/api/v1/shift-templates/{$template->id}", ['name' => 'Hacked'])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_delete_other_company_template(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $template = ShiftTemplate::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->deleteJson("/api/v1/shift-templates/{$template->id}")->assertForbidden();
    }

    public function test_user_without_permissions_cannot_list_shift_templates(): void
    {
        $user = User::factory()->create();
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/shift-templates')->assertForbidden();
    }
}
