<?php

namespace Tests\Feature\Employee;

use App\Models\Company;
use App\Models\Employee;
use App\Models\EmployeeInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Covers what happens when an administrator deactivates a team member from the
 * edit dialog on the team page.
 *
 * "Inactive" has to mean the person is out immediately — not at the end of their
 * session, and not only for future logins. These tests pin down each way back in
 * that has to be closed: the tokens they already hold, a fresh sign-in, and any
 * invitation link still sitting in their inbox.
 */
class EmployeeDeactivationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['employee.view', 'employee.edit'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        Role::findOrCreate('company_admin', 'web')
            ->syncPermissions(['employee.view', 'employee.edit']);
        Role::findOrCreate('employee', 'web');
    }

    /** Signs in a company admin who can manage the given company's team. */
    protected function actingAsCompanyAdmin(Company $company): User
    {
        $admin = User::factory()->create([
            'company_id' => $company->id,
            'status' => 'active',
        ]);
        $admin->assignRole('company_admin');
        Sanctum::actingAs($admin);

        return $admin;
    }

    /**
     * Creates an onboarded team member: an active employee row linked to an
     * active login account with an accepted invitation.
     *
     * @return array{0: Employee, 1: User}
     */
    protected function onboardedEmployee(Company $company): array
    {
        $user = User::factory()->create([
            'company_id' => $company->id,
            'status' => 'active',
            'password' => Hash::make('password123'),
        ]);
        $user->assignRole('employee');

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'department_id' => null,
            'position_id' => null,
            'branch_id' => null,
            'status' => 'active',
        ]);

        EmployeeInvitation::create([
            'company_id' => $company->id,
            'employee_id' => $employee->id,
            'user_id' => $user->id,
            'email' => $user->email,
            'role' => 'employee',
            'channel' => EmployeeInvitation::CHANNEL_MOBILE,
            'accepted_at' => now(),
        ]);

        return [$employee, $user];
    }

    public function test_deactivating_an_employee_marks_their_login_account_inactive(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        [$employee, $user] = $this->onboardedEmployee($company);

        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'inactive'])
            ->assertOk();

        $this->assertSame('inactive', $employee->fresh()->status);
        $this->assertSame('inactive', $user->fresh()->status);
    }

    public function test_deactivating_an_employee_signs_them_out_of_every_device(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        [$employee, $user] = $this->onboardedEmployee($company);

        // Stand in for the phone and the browser they are already signed in on.
        $user->createToken('mobile');
        $user->createToken('web');
        $this->assertSame(2, $user->tokens()->count());

        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'inactive'])
            ->assertOk();

        $this->assertSame(0, $user->fresh()->tokens()->count());
    }

    public function test_a_deactivated_employee_cannot_sign_in_again(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        [$employee, $user] = $this->onboardedEmployee($company);

        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'inactive'])
            ->assertOk();

        // Correct credentials, but the account is closed.
        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertUnauthorized();
    }

    public function test_a_deactivated_employee_is_rejected_on_their_next_api_request(): void
    {
        $company = Company::factory()->create();
        [$employee, $user] = $this->onboardedEmployee($company);

        // Deactivate the record directly: this mirrors an admin deactivating them
        // in one browser tab while the employee's app is still holding a session.
        app(\App\Services\EmployeeService::class)->update($employee, ['status' => 'inactive']);

        Sanctum::actingAs($user->fresh());

        $this->getJson('/api/v1/auth/me')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Your account has been deactivated. Please contact your administrator.');
    }

    public function test_deactivating_an_employee_revokes_their_outstanding_invitation(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $user = User::factory()->create([
            'company_id' => $company->id,
            'status' => 'invited',
        ]);
        $user->assignRole('employee');

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'department_id' => null,
            'position_id' => null,
            'branch_id' => null,
            'status' => 'active',
        ]);

        $invitation = EmployeeInvitation::create([
            'company_id' => $company->id,
            'employee_id' => $employee->id,
            'user_id' => $user->id,
            'email' => $user->email,
            'role' => 'employee',
            'channel' => EmployeeInvitation::CHANNEL_MOBILE,
            'code_hash' => Hash::make('123456'),
            'code_expires_at' => now()->addMinutes(15),
        ]);

        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'inactive'])
            ->assertOk();

        // The row is kept as a record that they were invited, but every secret on
        // it is destroyed so the emailed code is no longer a way back in.
        $invitation->refresh();
        $this->assertNull($invitation->code_hash);
        $this->assertNull($invitation->code_expires_at);
        $this->assertNull($invitation->token_hash);
        $this->assertNull($invitation->setup_token_hash);

        // And the code itself is now rejected by the mobile verify endpoint.
        $this->postJson('/api/v1/invitations/mobile/verify-code', [
            'email' => $user->email,
            'code' => '123456',
        ])->assertStatus(422);
    }



    public function test_reactivating_an_employee_restores_their_login(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        [$employee, $user] = $this->onboardedEmployee($company);

        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'inactive'])
            ->assertOk();
        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'active'])
            ->assertOk();

        $this->assertSame('active', $user->fresh()->status);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertOk();
    }

    public function test_an_invited_account_cannot_be_hand_flipped_to_active(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        // Invited, but has never set a password. (A directory row that still
        // points at an `invited` account is a `pending` member; the stale
        // `active` row below mirrors legacy data before the backfill.)
        $user = User::factory()->create([
            'company_id' => $company->id,
            'status' => 'invited',
        ]);
        $user->assignRole('employee');

        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'department_id' => null,
            'position_id' => null,
            'branch_id' => null,
            'status' => 'active',
        ]);

        // Flipping the employee row (or re-saving it as active) must not hand
        // out access to an account whose password was never chosen by its
        // owner: acceptance is the only activation path, so the edit is
        // refused outright and nothing is half-applied.
        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'active'])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'INVITATION_PENDING');

        $this->assertSame('active', $employee->fresh()->status);
        $this->assertSame('invited', $user->fresh()->status);
    }
}
