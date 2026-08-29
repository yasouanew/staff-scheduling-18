<?php

namespace Tests\Feature\Employee;

use App\Models\Company;
use App\Models\Employee;
use App\Models\EmployeeInvitation;
use App\Models\User;
use App\Notifications\MobileInvitationNotification;
use App\Notifications\MobileVerificationCodeNotification;
use App\Notifications\WebInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Covers the two onboarding journeys reachable from the team page row menu.
 *
 * Web (company admin / scheduler): emailed link → set password → sign in.
 * Mobile (employee): "download the app" email → code → verify → set password.
 */
class EmployeeInvitationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['employee.view', 'employee.create', 'employee.edit', 'employee.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        Role::findOrCreate('company_admin', 'web')
            ->syncPermissions(['employee.view', 'employee.create', 'employee.edit', 'employee.delete']);
        Role::findOrCreate('scheduler', 'web');
        Role::findOrCreate('employee', 'web');

        Notification::fake();
    }

    /** Signs in a company admin who can manage the given company's team. */
    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    /** Creates an employee with no login account yet, as "Add employee" would. */
    protected function employeeWithoutAccount(Company $company): Employee
    {
        return Employee::factory()->create([
            'company_id' => $company->id,
            'user_id' => null,
            'department_id' => null,
            'position_id' => null,
            'branch_id' => null,
        ]);
    }

    /* ---------------------------------------------------------------------- */
    /* Sending                                                                */
    /* ---------------------------------------------------------------------- */

    public function test_admin_can_invite_a_scheduler_through_the_web_channel(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        $response = $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'scheduler',
            'email' => 'sam.scheduler@example.com',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.channel', 'web')
            ->assertJsonPath('data.role', 'scheduler')
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('employee_invitations', [
            'email' => 'sam.scheduler@example.com',
            'channel' => 'web',
            'role' => 'scheduler',
        ]);

        // The employee row must now point at the account it onboards.
        $user = User::where('email', 'sam.scheduler@example.com')->firstOrFail();
        $this->assertSame($user->id, $employee->fresh()->user_id);
        $this->assertSame('invited', $user->status);
        $this->assertTrue($user->hasRole('scheduler'));

        Notification::assertSentTo($user, WebInvitationNotification::class);
    }

    public function test_admin_inviting_an_employee_sends_the_download_the_app_email(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'employee',
            'email' => 'casey.crew@example.com',
        ])->assertCreated()->assertJsonPath('data.channel', 'mobile');

        $user = User::where('email', 'casey.crew@example.com')->firstOrFail();

        Notification::assertSentTo($user, MobileInvitationNotification::class);
        // Employees never receive a browser set-password link.
        Notification::assertNotSentTo($user, WebInvitationNotification::class);
    }

    public function test_inviting_without_an_email_for_an_accountless_employee_fails_validation(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'scheduler',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_resending_rotates_the_token_so_the_old_link_stops_working(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'company_admin',
            'email' => 'dana.admin@example.com',
        ])->assertCreated();

        $firstHash = EmployeeInvitation::where('email', 'dana.admin@example.com')->value('token_hash');

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'company_admin',
        ])->assertCreated();

        $invitation = EmployeeInvitation::where('email', 'dana.admin@example.com')->firstOrFail();

        $this->assertNotSame($firstHash, $invitation->token_hash);
        // One ledger row per user, with the send counter advanced.
        $this->assertEquals(2, $invitation->send_count);
        $this->assertSame(1, EmployeeInvitation::where('email', 'dana.admin@example.com')->count());
    }

    public function test_an_email_already_used_by_another_account_is_rejected(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        User::factory()->create(['email' => 'taken@example.com']);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'scheduler',
            'email' => 'taken@example.com',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_an_admin_cannot_invite_someone_at_another_company(): void
    {
        $this->actingAsCompanyAdmin(Company::factory()->create());
        $foreignEmployee = $this->employeeWithoutAccount(Company::factory()->create());

        $this->postJson("/api/v1/employees/{$foreignEmployee->id}/invitation", [
            'role' => 'scheduler',
            'email' => 'outsider@example.com',
        ])->assertForbidden();
    }

    /* ---------------------------------------------------------------------- */
    /* Web journey (company admin / scheduler)                                */
    /* ---------------------------------------------------------------------- */

    public function test_an_invited_admin_can_preview_and_accept_their_invitation(): void
    {
        $company = Company::factory()->create(['name' => 'Acme Pty Ltd']);
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'company_admin',
            'email' => 'dana.admin@example.com',
        ])->assertCreated();

        // Capture the plain token from the email — it is never persisted.
        $token = null;
        Notification::assertSentTo(
            User::where('email', 'dana.admin@example.com')->firstOrFail(),
            WebInvitationNotification::class,
            function (WebInvitationNotification $notification) use (&$token): bool {
                $token = $notification->token;

                return true;
            }
        );

        $this->assertNotNull($token);

        $this->getJson('/api/v1/invitations?' . http_build_query([
            'token' => $token,
            'email' => 'dana.admin@example.com',
        ]))
            ->assertOk()
            ->assertJsonPath('data.email', 'dana.admin@example.com')
            ->assertJsonPath('data.role', 'company_admin')
            ->assertJsonPath('data.company_name', 'Acme Pty Ltd');

        $this->postJson('/api/v1/invitations/accept', [
            'token' => $token,
            'email' => 'dana.admin@example.com',
            'password' => 'NewPassw0rd!',
            'password_confirmation' => 'NewPassw0rd!',
        ])->assertOk();

        $user = User::where('email', 'dana.admin@example.com')->firstOrFail();

        $this->assertTrue(Hash::check('NewPassw0rd!', $user->password));
        // Activated and verified, so `LoginAction` will accept the new password.
        $this->assertSame('active', $user->status);
        $this->assertNotNull($user->email_verified_at);
        $this->assertNotNull(
            EmployeeInvitation::where('email', 'dana.admin@example.com')->value('accepted_at')
        );

        // The link is single-use.
        $this->postJson('/api/v1/invitations/accept', [
            'token' => $token,
            'email' => 'dana.admin@example.com',
            'password' => 'AnotherPassw0rd!',
            'password_confirmation' => 'AnotherPassw0rd!',
        ])->assertStatus(422);
    }

    public function test_an_expired_web_invitation_cannot_be_accepted(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'scheduler',
            'email' => 'late@example.com',
        ])->assertCreated();

        $token = null;
        Notification::assertSentTo(
            User::where('email', 'late@example.com')->firstOrFail(),
            WebInvitationNotification::class,
            function (WebInvitationNotification $notification) use (&$token): bool {
                $token = $notification->token;

                return true;
            }
        );

        EmployeeInvitation::where('email', 'late@example.com')
            ->update(['expires_at' => now()->subMinute()]);

        $this->postJson('/api/v1/invitations/accept', [
            'token' => $token,
            'email' => 'late@example.com',
            'password' => 'NewPassw0rd!',
            'password_confirmation' => 'NewPassw0rd!',
        ])->assertStatus(422);
    }

    /* ---------------------------------------------------------------------- */
    /* Mobile journey (employee)                                              */
    /* ---------------------------------------------------------------------- */

    public function test_an_invited_employee_can_verify_by_code_and_set_a_password(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'employee',
            'email' => 'casey.crew@example.com',
        ])->assertCreated();

        $user = User::where('email', 'casey.crew@example.com')->firstOrFail();

        // Step 1: the app asks for a code.
        $this->postJson('/api/v1/invitations/mobile/request-code', [
            'email' => 'casey.crew@example.com',
        ])->assertOk();

        $code = null;
        Notification::assertSentTo(
            $user,
            MobileVerificationCodeNotification::class,
            function (MobileVerificationCodeNotification $notification) use (&$code): bool {
                $code = $notification->code;

                return true;
            }
        );

        $this->assertNotNull($code);

        // Step 2: verifying the code yields a short-lived setup token.
        $setupToken = $this->postJson('/api/v1/invitations/mobile/verify-code', [
            'email' => 'casey.crew@example.com',
            'code' => $code,
        ])->assertOk()->json('data.setup_token');

        $this->assertNotEmpty($setupToken);

        // Step 3: the setup token authorises choosing a password.
        $this->postJson('/api/v1/invitations/mobile/complete-setup', [
            'email' => 'casey.crew@example.com',
            'setup_token' => $setupToken,
            'password' => 'MobilePassw0rd!',
            'password_confirmation' => 'MobilePassw0rd!',
        ])->assertOk();

        $user->refresh();

        $this->assertTrue(Hash::check('MobilePassw0rd!', $user->password));
        $this->assertSame('active', $user->status);
        $this->assertNotNull(
            EmployeeInvitation::where('email', 'casey.crew@example.com')->value('accepted_at')
        );

        // The code was consumed on first use, so it cannot be replayed.
        $this->postJson('/api/v1/invitations/mobile/verify-code', [
            'email' => 'casey.crew@example.com',
            'code' => $code,
        ])->assertStatus(422);
    }

    public function test_an_incorrect_code_is_rejected_and_counted(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'employee',
            'email' => 'casey.crew@example.com',
        ])->assertCreated();

        $this->postJson('/api/v1/invitations/mobile/request-code', [
            'email' => 'casey.crew@example.com',
        ])->assertOk();

        $this->postJson('/api/v1/invitations/mobile/verify-code', [
            'email' => 'casey.crew@example.com',
            'code' => '000000',
        ])->assertStatus(422)->assertJsonValidationErrors('code');

        $this->assertEquals(
            1,
            EmployeeInvitation::where('email', 'casey.crew@example.com')->value('code_attempts')
        );
    }

    public function test_requesting_a_code_for_an_unknown_email_does_not_leak_that_fact(): void
    {
        // Same 200 response as a known address, and nothing is emailed.
        $this->postJson('/api/v1/invitations/mobile/request-code', [
            'email' => 'nobody@example.com',
        ])->assertOk();

        Notification::assertNothingSent();
    }

    /* ---------------------------------------------------------------------- */
    /* Revoking                                                               */
    /* ---------------------------------------------------------------------- */

    public function test_admin_can_revoke_an_outstanding_invitation(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'scheduler',
            'email' => 'revoke.me@example.com',
        ])->assertCreated();

        $token = null;
        Notification::assertSentTo(
            User::where('email', 'revoke.me@example.com')->firstOrFail(),
            WebInvitationNotification::class,
            function (WebInvitationNotification $notification) use (&$token): bool {
                $token = $notification->token;

                return true;
            }
        );

        $this->deleteJson("/api/v1/employees/{$employee->id}/invitation")->assertOk();

        $this->assertNull(
            EmployeeInvitation::where('email', 'revoke.me@example.com')->value('token_hash')
        );

        // The previously emailed link is now inert.
        $this->postJson('/api/v1/invitations/accept', [
            'token' => $token,
            'email' => 'revoke.me@example.com',
            'password' => 'NewPassw0rd!',
            'password_confirmation' => 'NewPassw0rd!',
        ])->assertStatus(422);
    }
}
