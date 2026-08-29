<?php

namespace Tests\Feature\Leave;

use App\Models\Company;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class LeaveRequestManagementTest extends TestCase
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

        // Permission names must match RoleAndPermissionSeeder (leave_request.*).
        $leavePermissions = [
            'leave_request.view',
            'leave_request.create',
            'leave_request.approve',
            'leave_request.reject',
        ];

        foreach ($leavePermissions as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions($leavePermissions);

        // Employees can view and request leave, but not approve/reject.
        $employee = Role::findOrCreate('employee', 'web');
        $employee->syncPermissions(['leave_request.view', 'leave_request.create']);

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

    public function test_guest_cannot_access_leave_requests(): void
    {
        $this->getJson('/api/v1/leave-requests')->assertUnauthorized();
    }

    public function test_super_admin_can_list_leave_requests(): void
    {
        $this->actingAsSuperAdmin();
        LeaveRequest::factory()->count(3)->create();

        $this->getJson('/api/v1/leave-requests')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_can_submit_a_leave_request(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $employee = Employee::factory()->create(['company_id' => $company->id]);
        $leaveType = LeaveType::factory()->create(['company_id' => $company->id]);

        $response = $this->postJson('/api/v1/leave-requests', [
            'company_id' => $company->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-02-02',
            'end_date' => '2026-02-04',
            'reason' => 'Family vacation.',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.total_days', '3.00');
        $this->assertDatabaseHas('leave_requests', [
            'employee_id' => $employee->id,
            'status' => 'pending',
        ]);
    }

    public function test_submitting_leave_requires_employee_type_and_dates(): void
    {
        $this->actingAsSuperAdmin();

        $this->postJson('/api/v1/leave-requests', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['employee_id', 'leave_type_id', 'start_date', 'end_date']);
    }

    public function test_end_date_must_be_after_or_equal_start_date(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $employee = Employee::factory()->create(['company_id' => $company->id]);
        $leaveType = LeaveType::factory()->create(['company_id' => $company->id]);

        $this->postJson('/api/v1/leave-requests', [
            'employee_id' => $employee->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-02-10',
            'end_date' => '2026-02-05',
        ])->assertUnprocessable()->assertJsonValidationErrors('end_date');
    }

    public function test_can_approve_a_pending_leave_request(): void
    {
        $admin = $this->actingAsSuperAdmin();
        $leaveRequest = LeaveRequest::factory()->create(['status' => 'pending']);

        $this->postJson("/api/v1/leave-requests/{$leaveRequest->id}/approve", [
            'admin_notes' => 'Approved, enjoy!',
        ])->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.approved_by', $admin->id);

        $this->assertDatabaseHas('leave_requests', [
            'id' => $leaveRequest->id,
            'status' => 'approved',
            'approved_by' => $admin->id,
        ]);
    }

    public function test_cannot_approve_a_non_pending_leave_request(): void
    {
        $this->actingAsSuperAdmin();
        $leaveRequest = LeaveRequest::factory()->create(['status' => 'approved', 'approved_at' => now()]);

        $this->postJson("/api/v1/leave-requests/{$leaveRequest->id}/approve")
            ->assertStatus(422);
    }

    public function test_can_reject_a_pending_leave_request(): void
    {
        $admin = $this->actingAsSuperAdmin();
        $leaveRequest = LeaveRequest::factory()->create(['status' => 'pending']);

        $this->postJson("/api/v1/leave-requests/{$leaveRequest->id}/reject", [
            'rejection_reason' => 'Insufficient staffing for that week.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.rejected_by', $admin->id)
            ->assertJsonPath('data.rejection_reason', 'Insufficient staffing for that week.');

        $this->assertDatabaseHas('leave_requests', [
            'id' => $leaveRequest->id,
            'status' => 'rejected',
            'rejected_by' => $admin->id,
        ]);
    }

    public function test_rejecting_requires_a_reason(): void
    {
        $this->actingAsSuperAdmin();
        $leaveRequest = LeaveRequest::factory()->create(['status' => 'pending']);

        $this->postJson("/api/v1/leave-requests/{$leaveRequest->id}/reject", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rejection_reason');
    }

    public function test_cannot_reject_a_non_pending_leave_request(): void
    {
        $this->actingAsSuperAdmin();
        $leaveRequest = LeaveRequest::factory()->create(['status' => 'rejected', 'rejected_at' => now()]);

        $this->postJson("/api/v1/leave-requests/{$leaveRequest->id}/reject", [
            'rejection_reason' => 'Already handled.',
        ])->assertStatus(422);
    }

    public function test_company_admin_only_sees_own_company_leave_requests(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        LeaveRequest::factory()->count(2)->create(['company_id' => $company->id]);
        LeaveRequest::factory()->count(3)->create(['company_id' => $otherCompany->id]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/leave-requests')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_cannot_approve_other_company_leave_request(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $leaveRequest = LeaveRequest::factory()->create(['company_id' => $otherCompany->id, 'status' => 'pending']);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->postJson("/api/v1/leave-requests/{$leaveRequest->id}/approve")->assertForbidden();
    }

    public function test_employee_cannot_approve_leave_request(): void
    {
        $company = Company::factory()->create();
        $leaveRequest = LeaveRequest::factory()->create(['company_id' => $company->id, 'status' => 'pending']);
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/leave-requests/{$leaveRequest->id}/approve")->assertForbidden();
    }

    public function test_employee_cannot_reject_leave_request(): void
    {
        $company = Company::factory()->create();
        $leaveRequest = LeaveRequest::factory()->create(['company_id' => $company->id, 'status' => 'pending']);
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/leave-requests/{$leaveRequest->id}/reject", [
            'rejection_reason' => 'No.',
        ])->assertForbidden();
    }

    public function test_employee_can_submit_leave_request(): void
    {
        $company = Company::factory()->create();
        $user = User::factory()->create(['company_id' => $company->id]);
        // An employee user must have an employee profile linked to it, since the
        // controller derives the employee_id from the authenticated user.
        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
        ]);
        $leaveType = LeaveType::factory()->create(['company_id' => $company->id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);


        $this->postJson('/api/v1/leave-requests', [
            'employee_id' => $employee->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-02-02',
            'end_date' => '2026-02-02',
        ])->assertCreated()
            ->assertJsonPath('data.company_id', $company->id);
    }
}
