<?php

namespace Tests\Feature\Billing;

use App\Models\Company;
use App\Models\Employee;
use App\Models\EmployeeInvitation;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Notifications\EmployeeInvitationNotification;
use App\Notifications\SeatLimitReachedNotification;
use App\Notifications\MobileVerificationCodeNotification;
use App\Notifications\ResetPasswordNotification;
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
 * End-to-end coverage for the per-seat (active-user-account) capacity model.
 *
 * A "seat" is one active `users` row: `company_id` set, role not
 * `super_admin`, status `active` — with or without an employee profile. The
 * founding company admin always consumes one seat, so `used` is `1 + N` for
 * every additional active member. The cap is the plan's `max_employees`
 * (surfaced as `maxSeats()`).
 *
 * The guard fires only when an account is *activated*:
 *
 *   - re-activating a deactivated directory member (`PUT employees/{id}`)
 *   - accepting a web invitation (`POST invitations/accept`)
 *   - completing a mobile invitation (`POST invitations/mobile/complete-setup`)
 *   - a pending invited user setting their first password
 *     (`POST auth/reset-password`)
 *
 * Downgrades are validated against the same active-seat count
 * (`DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED`). Deactivating or deleting a member
 * frees their seat immediately. Routes that need an active subscription are
 * protected by `company.access` (`SUBSCRIPTION_REQUIRED`) — the seat guard
 * itself only enforces the numeric cap.
 */
class SeatCapacityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach ([
            'subscription.view', 'subscription.manage', 'subscription.refund',
            'employee.view', 'employee.create', 'employee.edit', 'employee.delete',
        ] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        Role::findOrCreate('super_admin', 'web')->syncPermissions(Permission::all());

        Role::findOrCreate('company_admin', 'web')->syncPermissions([
            'subscription.view', 'subscription.manage', 'subscription.refund',
            'employee.view', 'employee.create', 'employee.edit', 'employee.delete',
        ]);

        Role::findOrCreate('scheduler', 'web');
        Role::findOrCreate('employee', 'web');

        Notification::fake();
    }

    /**
     * Signs in a company admin who manages the given company. The factory keeps
     * the `role` column as `employee` by default, so the role is assigned
     * explicitly — and the resulting active user consumes one seat.
     */
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
     * Creates a company with an active subscription. `max_employees` must be
     * supplied by each caller so seat counts are deterministic.
     *
     * @return array{0: Company, 1: Plan, 2: Subscription}
     */
    protected function makeCompanyWithActiveSubscription(array $planOverrides = []): array
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create(array_merge([
            'max_branches' => 3,
            'max_employees' => 25,
            'description' => 'Seat test plan',
            'currency' => 'AUD',
            'price_monthly' => 29.00,
            'price_yearly' => 290.00,
            'price_six_monthly' => 159.00,
        ], $planOverrides));

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'ends_at' => now()->addMonth(),
        ]);

        return [$company, $plan, $subscription];
    }

    /**
     * Creates an onboarded team member whose linked user has chosen a password.
     * The `$status` controls the *user's* current status:
     *
     *   - 'active'   → consumes a seat (default)
     *   - 'inactive' → a deactivated member who has been onboarded before and
     *                  can be re-activated through the directory (frees a seat)
     *
     * The employee row itself is created `active` either way, matching how the
     * directory models a member who is not currently signed in.
     *
     * @return array{0: Employee, 1: User}
     */
    protected function onboardedEmployee(Company $company, string $userStatus = 'active'): array
    {
        $user = User::factory()->create([
            'company_id' => $company->id,
            'status' => $userStatus,
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

    /** Creates an employee row with no linked login account yet. */
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
    /* Usage reporting                                                         */
    /* ---------------------------------------------------------------------- */

    public function test_usage_reports_the_founding_admin_plus_active_members_as_seats(): void
    {
        [$company, $plan] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 5,
        ]);

        // 2 extra active members + the acting admin => used = 1 + 2 = 3.
        $this->actingAsCompanyAdmin($company);
        $this->onboardedEmployee($company);
        $this->onboardedEmployee($company);

        // Members without an account (or never activated) do not consume seats.
        $this->employeeWithoutAccount($company);

        $this->getJson('/api/v1/subscription/usage')
            ->assertOk()
            ->assertJsonPath('data.seats.used', 3)
            ->assertJsonPath('data.seats.limit', $plan->maxSeats());
    }

    public function test_usage_reports_a_null_seat_limit_for_an_unlimited_plan(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => null,
        ]);

        $this->actingAsCompanyAdmin($company);
        $this->onboardedEmployee($company);

        $this->getJson('/api/v1/subscription/usage')
            ->assertOk()
            ->assertJsonPath('data.seats.limit', null);
    }

    /* ---------------------------------------------------------------------- */
    /* Re-activation via the directory (employee PUT)                          */
    /* ---------------------------------------------------------------------- */

    public function test_reactivating_a_member_below_capacity_is_allowed(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 5,
        ]);

        $this->actingAsCompanyAdmin($company);
        [$employee, $user] = $this->onboardedEmployee($company);

        // Deactivate to free the seat, then re-activate while there is room.
        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'inactive'])
            ->assertOk();
        $this->assertSame('inactive', $user->fresh()->status);

        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'active'])
            ->assertOk();

        $this->assertSame('active', $user->fresh()->status);
    }

    public function test_reactivation_at_full_capacity_is_blocked(): void
    {
        // Plan allows 2 seats: the admin takes one and an active member takes
        // the other, so a seat only frees up if someone is deactivated.
        [$company, $plan] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);

        $this->actingAsCompanyAdmin($company); // used = 1

        // Member A is onboarded, then deactivated through the directory — the
        // seat they occupied is freed.
        [$memberA, $userA] = $this->onboardedEmployee($company); // used = 2
        $this->putJson("/api/v1/employees/{$memberA->id}", ['status' => 'inactive'])
            ->assertOk(); // used = 1

        // Someone else takes the freed seat: used is back at the limit.
        $this->onboardedEmployee($company); // used = 2 == limit

        // Re-activating member A would exceed the cap => blocked.
        $this->putJson("/api/v1/employees/{$memberA->id}", ['status' => 'active'])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED')
            ->assertJsonPath('errors.used', 2)
            ->assertJsonPath('errors.limit', $plan->maxSeats())
            ->assertJsonPath('errors.remaining', 0);

        // Member A stays deactivated; nothing was half-applied.
        $this->assertSame('inactive', $userA->fresh()->status);
    }

    public function test_deactivating_a_member_frees_their_seat(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);

        $this->actingAsCompanyAdmin($company); // used = 1
        [$employee] = $this->onboardedEmployee($company); // used = 2 == limit

        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'inactive'])
            ->assertOk();

        // A brand-new member can now be activated into the freed seat.
        $this->onboardedEmployee($company);

        $this->getJson('/api/v1/subscription/usage')
            ->assertOk()
            ->assertJsonPath('data.seats.used', 2)
            ->assertJsonPath('data.seats.limit', 2);
    }

    public function test_deleting_an_employee_deactivates_its_user_and_frees_the_seat(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);

        $this->actingAsCompanyAdmin($company); // used = 1
        [$employee, $user] = $this->onboardedEmployee($company); // used = 2 == limit

        $this->deleteJson("/api/v1/employees/{$employee->id}")
            ->assertOk();

        $this->assertNull($employee->fresh());
        $this->assertSame('inactive', $user->fresh()->status);

        // The freed seat can be taken by someone else.
        $this->onboardedEmployee($company);

        $this->getJson('/api/v1/subscription/usage')
            ->assertOk()
            ->assertJsonPath('data.seats.used', 2);
    }

    public function test_an_unlimited_plan_allows_any_number_of_activations(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => null,
        ]);

        $this->actingAsCompanyAdmin($company);
        [$employee, $user] = $this->onboardedEmployee($company);

        for ($i = 0; $i < 5; $i++) {
            $this->onboardedEmployee($company);
        }

        // Deactivate and re-activate freely — no cap ever blocks.
        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'inactive'])
            ->assertOk();
        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'active'])
            ->assertOk();

        $this->assertSame('active', $user->fresh()->status);
    }

    /* ---------------------------------------------------------------------- */
    /* Invitation acceptance                                                   */
    /* ---------------------------------------------------------------------- */

    public function test_accepting_a_web_invitation_beyond_capacity_is_blocked(): void
    {
        // Admin = 1 seat; the second seat lets the invite itself be sent (the
        // send gate only refuses when the plan is already full), then the last
        // member is activated so `used` reaches the cap and acceptance is
        // blocked with capacity context.
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);

        $this->actingAsCompanyAdmin($company); // used = 1
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'scheduler',
            'email' => 'dana.admin@example.com',
        ])->assertCreated();

        $user = User::where('email', 'dana.admin@example.com')->firstOrFail();

        $token = null;
        Notification::assertSentTo(
            $user,
            WebInvitationNotification::class,
            function (WebInvitationNotification $notification) use (&$token): bool {
                $token = $notification->token;

                return true;
            }
        );

        $this->assertNotNull($token);

        // Fill the last seat: used = 2 == limit => activation is blocked.
        $this->onboardedEmployee($company);

        $this->postJson('/api/v1/invitations/accept', [
            'token' => $token,
            'email' => 'dana.admin@example.com',
            'password' => 'NewPassw0rd!',
            'password_confirmation' => 'NewPassw0rd!',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED')
            ->assertJsonPath('errors.used', 2)
            ->assertJsonPath('errors.limit', 2)
            ->assertJsonPath('errors.remaining', 0);

        // Still pending — nothing was half-accepted.
        $this->assertSame('invited', $user->fresh()->status);
    }

    public function test_accepting_a_web_invitation_within_capacity_is_allowed(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);

        $this->actingAsCompanyAdmin($company); // used = 1
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'scheduler',
            'email' => 'dana.admin@example.com',
        ])->assertCreated();

        $user = User::where('email', 'dana.admin@example.com')->firstOrFail();

        $token = null;
        Notification::assertSentTo(
            $user,
            WebInvitationNotification::class,
            function (WebInvitationNotification $notification) use (&$token): bool {
                $token = $notification->token;

                return true;
            }
        );

        // used = 1 < limit 2 => allowed.
        $this->postJson('/api/v1/invitations/accept', [
            'token' => $token,
            'email' => 'dana.admin@example.com',
            'password' => 'NewPassw0rd!',
            'password_confirmation' => 'NewPassw0rd!',
        ])
            ->assertOk();

        $this->assertSame('active', $user->fresh()->status);
    }

    public function test_completing_a_mobile_invitation_beyond_capacity_is_blocked(): void
    {
        // Admin = 1 seat; the second seat lets the invite itself be sent, then
        // the last member is activated so the final setup step is blocked.
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);

        $this->actingAsCompanyAdmin($company); // used = 1
        $employee = $this->employeeWithoutAccount($company);

        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'role' => 'employee',
            'email' => 'casey.crew@example.com',
        ])->assertCreated();

        $user = User::where('email', 'casey.crew@example.com')->firstOrFail();

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

        $setupToken = $this->postJson('/api/v1/invitations/mobile/verify-code', [
            'email' => 'casey.crew@example.com',
            'code' => $code,
        ])->assertOk()->json('data.setup_token');

        // Fill the last seat: used = 2 == limit => blocked at activation.
        $this->onboardedEmployee($company);

        $this->postJson('/api/v1/invitations/mobile/complete-setup', [
            'email' => 'casey.crew@example.com',
            'setup_token' => $setupToken,
            'password' => 'MobilePassw0rd!',
            'password_confirmation' => 'MobilePassw0rd!',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED')
            ->assertJsonPath('errors.used', 2)
            ->assertJsonPath('errors.limit', 2)
            ->assertJsonPath('errors.remaining', 0);

        // Still invited: the account was not half-activated.
        $this->assertSame('invited', $user->fresh()->status);
    }

    /* ---------------------------------------------------------------------- */
    /* Reset-password promotion of an invited account                          */
    /* ---------------------------------------------------------------------- */

    public function test_promoting_an_invited_account_beyond_capacity_is_blocked(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 1,
        ]);

        // The invited user belongs to the company but is NOT yet a seat.
        $invited = User::factory()->create([
            'company_id' => $company->id,
            'status' => 'invited',
            'email_verified_at' => null,
        ]);
        $invited->assignRole('employee');

        $this->actingAsCompanyAdmin($company); // used = 1 == limit

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $invited->email]);

        Notification::assertSentTo($invited, ResetPasswordNotification::class, function ($notification) use ($invited) {
            $this->postJson('/api/v1/auth/reset-password', [
                'token' => $notification->token,
                'email' => $invited->email,
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])
                ->assertStatus(422)
                ->assertJsonPath('success', false)
                ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED')
                ->assertJsonPath('errors.used', 1)
                ->assertJsonPath('errors.limit', 1)
                ->assertJsonPath('errors.remaining', 0);

            return true;
        });

        // Still invited — the promotion was rolled back cleanly.
        $this->assertSame('invited', $invited->fresh()->status);
    }

    public function test_promoting_an_invited_account_within_capacity_activates_it(): void
    {
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);

        $this->actingAsCompanyAdmin($company); // used = 1

        $invited = User::factory()->create([
            'company_id' => $company->id,
            'status' => 'invited',
            'email_verified_at' => null,
        ]);
        $invited->assignRole('employee');

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $invited->email]);

        Notification::assertSentTo($invited, ResetPasswordNotification::class, function ($notification) use ($invited) {
            $this->postJson('/api/v1/auth/reset-password', [
                'token' => $notification->token,
                'email' => $invited->email,
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])->assertOk();

            return true;
        });

        $this->assertSame('active', $invited->fresh()->status);
        $this->assertNotNull($invited->fresh()->email_verified_at);
    }

    /* ---------------------------------------------------------------------- */
    /* Downgrade seat validation                                               */
    /* ---------------------------------------------------------------------- */

    public function test_downgrade_is_rejected_when_active_seats_exceed_the_target_plan(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 10,
        ]);

        $target = Plan::factory()->create([
            'max_branches' => 3,
            'max_employees' => 2,
        ]);

        // Admin (1) + 2 active members = 3 active seats > target limit 2.
        $this->actingAsCompanyAdmin($company);
        $this->onboardedEmployee($company);
        $this->onboardedEmployee($company);

        $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $target->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED')
            ->assertJsonPath('errors.used', 3)
            ->assertJsonPath('errors.capacity', 2);

        // The subscription was not changed.
        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $subscription->plan_id,
        ]);
    }

    public function test_downgrade_is_allowed_when_active_seats_fit_the_target_plan(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 10,
        ]);

        $target = Plan::factory()->create([
            'max_branches' => 3,
            'max_employees' => 5,
        ]);

        // Admin (1) + 2 active members = 3 seats <= target limit 5.
        $this->actingAsCompanyAdmin($company);
        $this->onboardedEmployee($company);
        $this->onboardedEmployee($company);

        $this->postJson('/api/v1/subscription/downgrade', [
            'plan_id' => $target->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.subscription.plan.id', $target->id);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $target->id,
        ]);
    }

    public function test_upgrade_is_allowed_at_any_seat_usage(): void
    {
        [$company, , $subscription] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);

        // Admin (1) + 2 members = 3 seats — already above the current plan's
        // cap, but an upgrade to a larger plan must never be blocked.
        $this->actingAsCompanyAdmin($company);
        $this->onboardedEmployee($company);
        $this->onboardedEmployee($company);

        $larger = Plan::factory()->create([
            'max_branches' => 10,
            'max_employees' => 25,
        ]);

        $this->postJson('/api/v1/subscription/upgrade', [
            'plan_id' => $larger->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.subscription.plan.id', $larger->id)
            ->assertJsonPath('data.subscription.plan.max_employees', 25);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'plan_id' => $larger->id,
        ]);
    }

    /* ---------------------------------------------------------------------- */
    /* Boundary: two activations for one free seat                             */
    /* ---------------------------------------------------------------------- */

    public function test_two_activations_for_one_free_seat_only_one_succeeds(): void
    {
        // Admin = 1 seat; limit 2 leaves exactly one free seat. Two deactivated
        // members race to take it: the serialized guard counts the first
        // success (used reaches the limit), so the second is blocked.
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);

        $this->actingAsCompanyAdmin($company); // used = 1 (one free seat)

        [$first, $firstUser] = $this->onboardedEmployee($company, 'inactive');
        [$second, $secondUser] = $this->onboardedEmployee($company, 'inactive');

        // First activation takes the last free seat.
        $this->putJson("/api/v1/employees/{$first->id}", ['status' => 'active'])
            ->assertOk();
        $this->assertSame('active', $firstUser->fresh()->status);

        // Second activation is now at the limit => blocked.
        $this->putJson("/api/v1/employees/{$second->id}", ['status' => 'active'])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED')
            ->assertJsonPath('errors.used', 2)
            ->assertJsonPath('errors.limit', 2)
            ->assertJsonPath('errors.remaining', 0);

        $this->assertSame('inactive', $secondUser->fresh()->status);
    }

    /* ---------------------------------------------------------------------- */
    /* Inviting at full capacity (T7)                                          */
    /* ---------------------------------------------------------------------- */

    public function test_inviting_at_full_capacity_is_refused_and_guides_the_admin(): void
    {
        // Admin (1) + one onboarded member (1) = 2 active seats, and the cap is
        // 2, so the plan is already full when the new member's invite is asked
        // for. No invitation email may go out: the invitee could never accept
        // while no seat is free, so the request is refused with guidance to
        // upgrade or deactivate another member.
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);
        $admin = $this->actingAsCompanyAdmin($company); // used = 1
        $this->onboardedEmployee($company); // used = 2 == limit

        $this->postJson('/api/v1/employees/invite', [
            'company_id' => $company->id,
            'email' => 'held@example.com',
            'first_name' => 'Held',
            'last_name' => 'Starter',
            'role' => 'employee',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED');

        // Nothing was half-created — no user, no directory row, no invitee email.
        $this->assertNull(User::where('email', 'held@example.com')->first());
        $this->assertDatabaseMissing('employees', ['company_id' => $company->id, 'user_id' => null]);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'held@example.com']);

        // The company admin is told the plan is out of seats — in-app and by email.
        Notification::assertSentTo(
            $admin,
            SeatLimitReachedNotification::class,
            fn (SeatLimitReachedNotification $notification): bool => $notification->seatsUsed === 2
                && $notification->seatsLimit === 2
        );
    }

    public function test_reaching_full_capacity_expires_outstanding_invitations_and_notifies_admins(): void
    {
        // Admin (1) is the only seat, so the cap of 2 leaves one free seat for
        // the brand-new invite. The invite goes out and the member sits
        // `pending` + `invited` with a live web token.
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 2,
        ]);
        $admin = $this->actingAsCompanyAdmin($company); // used = 1
        $employee = $this->employeeWithoutAccount($company);

        // A scheduler invite uses the web channel, so the ledger row carries a
        // live set-password token — exactly what must be force-expired.
        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'email' => 'held@example.com',
            'role' => 'scheduler',
        ])->assertCreated();

        $invitation = EmployeeInvitation::where('email', 'held@example.com')->firstOrFail();
        $this->assertNotNull($invitation->token_hash, 'The web invitation must be live before the plan fills.');

        // Fill the remaining seat so the plan is full.
        $this->onboardedEmployee($company); // used = 2 == limit

        // Any invitation send while the plan is full is refused — including a
        // re-send of the existing pending member: the invitee could not accept
        // until a seat frees up, so the link must not stay alive.
        $this->postJson("/api/v1/employees/{$employee->id}/invitation", [
            'email' => 'held@example.com',
            'role' => 'scheduler',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'EMPLOYEE_CAPACITY_REACHED');

        // The outstanding invitation was force-expired: every secret is gone
        // and the expiry is stamped to now, so the directory shows "expired".
        $invitation->refresh();
        $this->assertNull($invitation->token_hash);
        $this->assertNotNull($invitation->expires_at);
        $this->assertTrue($invitation->expires_at->isPast());
        $this->assertFalse($invitation->isPending());

        // The invitee's account is untouched — they simply cannot accept yet.
        $user = User::where('email', 'held@example.com')->firstOrFail();
        $this->assertSame('invited', $user->fresh()->status);
        $this->assertSame('pending', $employee->fresh()->status);

        // The company admin is notified in-app and by email that the plan is
        // out of seats (and that pending invites no longer work).
        Notification::assertSentTo(
            $admin,
            SeatLimitReachedNotification::class,
            fn (SeatLimitReachedNotification $notification): bool => $notification->seatsUsed === 2
                && $notification->seatsLimit === 2
        );
    }

    public function test_a_pending_member_cannot_be_hand_flipped_to_active_before_accepting_their_invitation(): void
    {
        // Admin (1) is the only seat, so the cap of 3 leaves room for the new
        // member's *acceptance* later — the invite itself is a new account, so
        // it must be sent while a seat is free (sending at full capacity is
        // refused). The member sits `pending` + `invited` until they accept.
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 3,
        ]);
        $this->actingAsCompanyAdmin($company); // used = 1

        // Invite through the directory create flow so the emailed set-password
        // token (`password_reset_tokens`) and EmployeeInvitationNotification
        // exist for the acceptance-path assertions below.
        $this->postJson('/api/v1/employees/invite', [
            'company_id' => $company->id,
            'email' => 'held@example.com',
            'first_name' => 'Held',
            'last_name' => 'Starter',
            'role' => 'employee',
        ])->assertCreated();

        $user = User::where('email', 'held@example.com')->firstOrFail();
        $employee = $user->employee;
        $this->assertNotNull($employee, 'the invited user must have a linked directory row');
        $this->assertSame('pending', $employee->fresh()->status);
        $this->assertSame('invited', $user->fresh()->status);

        // Editing the member through the directory must not bypass the hold by
        // hand-flipping their row to `active`: only a real accepted login is an
        // active member, and this account has never chosen a password. The
        // refusal is not capacity-driven (INVITATION_PENDING, not
        // EMPLOYEE_CAPACITY_REACHED) — nothing is half-applied.
        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'active'])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'INVITATION_PENDING');

        $this->assertSame('pending', $employee->fresh()->status);
        $this->assertSame('invited', $user->fresh()->status);

        // Re-saving the pending member's profile (the edit dialog always
        // re-submits the current status) must be a no-op for account access:
        // their outstanding invitation stays alive and the row stays pending.
        $this->putJson("/api/v1/employees/{$employee->id}", [
            'first_name' => 'Held',
            'last_name' => 'Starter',
            'status' => 'pending',
        ])->assertOk()->assertJsonPath('data.status', 'pending');

        $this->assertSame('pending', $employee->fresh()->status);
        $this->assertSame('invited', $user->fresh()->status);
        // The outstanding invitation (the emailed set-password token) must
        // still be redeemable — the profile re-save must not have revoked it.
        $this->assertDatabaseHas('password_reset_tokens', ['email' => 'held@example.com']);
    }

    public function test_a_pending_members_employment_status_is_locked_against_all_changes(): void
    {
        // The status lock is not capacity-driven: it applies to every status
        // change away from `pending` regardless of how many seats are free.
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 10,
        ]);
        $this->actingAsCompanyAdmin($company);

        // Invite through the directory create flow so the password-reset token
        // asserted at the end is actually created.
        $this->postJson('/api/v1/employees/invite', [
            'company_id' => $company->id,
            'email' => 'locked@example.com',
            'first_name' => 'Locked',
            'last_name' => 'Member',
            'role' => 'employee',
        ])->assertCreated();

        $user = User::where('email', 'locked@example.com')->firstOrFail();
        $employee = $user->employee;
        $this->assertNotNull($employee, 'the invited user must have a linked directory row');
        $this->assertSame('pending', $employee->fresh()->status);
        $this->assertSame('invited', $user->fresh()->status);

        // Neither deactivating nor terminating a still-pending member is
        // allowed — both would bypass the acceptance-only activation rule or
        // strand the outstanding invitation.
        foreach (['inactive', 'terminated'] as $status) {
            $this->putJson("/api/v1/employees/{$employee->id}", ['status' => $status])
                ->assertStatus(422)
                ->assertJsonPath('success', false)
                ->assertJsonPath('code', 'INVITATION_PENDING');

            $this->assertSame('pending', $employee->fresh()->status);
            $this->assertSame('invited', $user->fresh()->status);
        }

        // Re-submitting `pending` (the edit dialog's read-only state) is a
        // valid no-op profile save.
        $this->putJson("/api/v1/employees/{$employee->id}", [
            'first_name' => 'Locked',
            'last_name' => 'Member',
            'status' => 'pending',
        ])->assertOk()->assertJsonPath('data.status', 'pending');

        // The outstanding invitation is untouched by the refusal.
        $this->assertDatabaseHas('password_reset_tokens', ['email' => 'locked@example.com']);
    }

    public function test_hand_flipping_a_pending_member_stays_refused_after_a_seat_frees_and_acceptance_activates(): void
    {
        // Admin (1) with cap 3 leaves room for the new member's acceptance
        // later; the member is created by inviting with a seat free.
        [$company] = $this->makeCompanyWithActiveSubscription([
            'max_employees' => 3,
        ]);
        $this->actingAsCompanyAdmin($company); // used = 1
        [$existing] = $this->onboardedEmployee($company); // used = 2

        // Invite through the directory create flow so the emailed set-password
        // token and EmployeeInvitationNotification used for acceptance exist.
        $this->postJson('/api/v1/employees/invite', [
            'company_id' => $company->id,
            'email' => 'held@example.com',
            'first_name' => 'Held',
            'last_name' => 'Starter',
            'role' => 'employee',
        ])->assertCreated();

        $user = User::where('email', 'held@example.com')->firstOrFail();
        $employee = $user->employee;
        $this->assertNotNull($employee, 'the invited user must have a linked directory row');
        $this->assertSame('pending', $employee->fresh()->status);

        // Free a seat by deactivating the existing member. Even with a seat
        // available the hand-flip is still refused: capacity was never the
        // reason — the member simply has not accepted their invitation yet, and
        // acceptance is the only path that activates the account and its row.
        $this->putJson("/api/v1/employees/{$existing->id}", ['status' => 'inactive'])
            ->assertOk();

        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'active'])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'INVITATION_PENDING');

        $this->assertSame('pending', $employee->fresh()->status);
        $this->assertSame('invited', $user->fresh()->status);

        // Accepting the invitation (setting the first password) is what
        // activates them: the user flips to `active` and the held row is
        // promoted out of `pending` in the same flow.
        Notification::assertSentTo($user, EmployeeInvitationNotification::class, function ($notification) use ($user) {
            $this->postJson('/api/v1/auth/reset-password', [
                'token' => $notification->token,
                'email' => $user->email,
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])->assertOk();

            return true;
        });

        $this->assertSame('active', $user->fresh()->status);
        $this->assertSame('active', $employee->fresh()->status);
    }

    /* ---------------------------------------------------------------------- */
    /* No company access                                                       */
    /* ---------------------------------------------------------------------- */

    public function test_reactivation_is_blocked_when_the_company_has_no_access(): void
    {
        // Company factory defaults to an active trial; expire it and add no
        // subscription so `company.access` denies the employee route with
        // `SUBSCRIPTION_REQUIRED` and auto-locks the company. The seat guard
        // itself never reports a "no subscription" code — that is the access
        // middleware's job.
        $company = Company::factory()->trialExpired()->create();
        $this->actingAsCompanyAdmin($company);
        [$employee] = $this->onboardedEmployee($company);

        $this->putJson("/api/v1/employees/{$employee->id}", ['status' => 'active'])
            ->assertStatus(423)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'SUBSCRIPTION_REQUIRED');

        $this->assertTrue($company->fresh()->isAccessLocked());
    }
}
