<?php

namespace Tests\Feature\Billing;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Employee;
use App\Models\Plan;
use App\Models\Roster;
use App\Models\Shift;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Task 2 / Task 7: scheduling (rosters + shifts) must be fully usable during
 * the trial, and fully blocked (423 SUBSCRIPTION_REQUIRED) once the trial ends
 * with no subscription, or once a subscription expires without renewal.
 *
 * This is enforced by `company.access` (CheckCompanyAccess) serving 423 with
 * `SUBSCRIPTION_REQUIRED` for every operational endpoint; the tests below prove
 * it at the endpoint level for rosters and shifts — the two surfaces the admin
 * uses to schedule users.
 */
class CompanyAccessSchedulingBlockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach ([
            'roster.view', 'roster.create', 'roster.edit', 'roster.delete', 'roster.publish',
            'shift.view', 'shift.create', 'shift.edit', 'shift.delete',
            'subscription.view', 'subscription.manage',
        ] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions([
            'roster.view', 'roster.create', 'roster.edit', 'roster.delete', 'roster.publish',
            'shift.view', 'shift.create', 'shift.edit', 'shift.delete',
            'subscription.view', 'subscription.manage',
        ]);

        Role::findOrCreate('scheduler', 'web');
        Role::findOrCreate('employee', 'web');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    protected function makeActiveSubscription(Company $company, array $overrides = []): Subscription
    {
        return Subscription::factory()->create(array_merge([
            'company_id' => $company->id,
            'plan_id' => Plan::factory()->create()->id,
            'status' => 'active',
            'ends_at' => Carbon::now()->addMonth(),
        ], $overrides));
    }

    protected function makeRosterPayload(Company $company, Branch $branch): array
    {
        $start = Carbon::parse('2026-01-05'); // Monday

        return [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'week_start' => $start->toDateString(),
            'week_end' => (clone $start)->addDays(6)->toDateString(),
        ];
    }

    // ─────────────────────────────────────────────────────────────────────
    // TRIAL = FULLY UNRESTRICTED
    // ─────────────────────────────────────────────────────────────────────

    public function test_during_trial_admin_can_list_and_create_rosters(): void
    {
        $company = Company::factory()->create([
            'trial_ends_at' => Carbon::now()->addDays(7),
        ]);
        $this->actingAsCompanyAdmin($company);
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        $this->getJson('/api/v1/rosters')->assertOk();

        $this->postJson('/api/v1/rosters', $this->makeRosterPayload($company, $branch))
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft');
    }

    public function test_during_trial_admin_can_list_and_create_shifts(): void
    {
        $company = Company::factory()->create([
            'trial_ends_at' => Carbon::now()->addDays(7),
        ]);
        $this->actingAsCompanyAdmin($company);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $roster = Roster::factory()->create(['company_id' => $company->id, 'branch_id' => $branch->id]);
        $employee = Employee::factory()->create(['company_id' => $company->id, 'branch_id' => $branch->id, 'status' => 'active']);

        $this->getJson('/api/v1/shifts')->assertOk();

        $this->postJson('/api/v1/shifts', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'roster_id' => $roster->id,
            'employee_id' => $employee->id,
            'date' => '2026-01-06',
            'start_time' => '09:00',
            'end_time' => '17:00',
        ])->assertCreated();
    }

    // ─────────────────────────────────────────────────────────────────────
    // TRIAL EXPIRED + NO SUBSCRIPTION = LOCKED
    // ─────────────────────────────────────────────────────────────────────

    public function test_expired_trial_without_subscription_blocks_rosters(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/rosters')
            ->assertStatus(423)
            ->assertJsonPath('code', 'SUBSCRIPTION_REQUIRED')
            ->assertJsonPath('data.is_locked', true);
    }

    public function test_expired_trial_without_subscription_blocks_creating_rosters(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $this->actingAsCompanyAdmin($company);
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        $this->postJson('/api/v1/rosters', $this->makeRosterPayload($company, $branch))
            ->assertStatus(423)
            ->assertJsonPath('code', 'SUBSCRIPTION_REQUIRED');
    }

    public function test_expired_trial_without_subscription_blocks_shifts(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/shifts')
            ->assertStatus(423)
            ->assertJsonPath('code', 'SUBSCRIPTION_REQUIRED');
    }

    public function test_expired_trial_without_subscription_blocks_roster_changes(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $this->actingAsCompanyAdmin($company);
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $roster = Roster::factory()->create(['company_id' => $company->id, 'branch_id' => $branch->id]);

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => 1,
            'mutations' => [['type' => 'add', 'shift' => ['date' => '2026-01-06', 'start_time' => '09:00', 'end_time' => '17:00']]],
        ])->assertStatus(423)
            ->assertJsonPath('code', 'SUBSCRIPTION_REQUIRED');
    }

    // ─────────────────────────────────────────────────────────────────────
    // SUBSCRIPTION EXPIRED / UNRENEWED = LOCKED (opposite of trial)
    // ─────────────────────────────────────────────────────────────────────

    public function test_expired_subscription_blocks_rosters_until_renewed(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $this->makeActiveSubscription($company, ['ends_at' => Carbon::now()->addDay()]);
        $this->actingAsCompanyAdmin($company);

        // Still entitled → rosters reachable.
        $this->getJson('/api/v1/rosters')->assertOk();

        // Server clock passes the subscription `ends_at`; no renewal happened.
        Carbon::setTestNow(Carbon::now()->addDays(2));

        $this->getJson('/api/v1/rosters')
            ->assertStatus(423)
            ->assertJsonPath('code', 'SUBSCRIPTION_REQUIRED')
            ->assertJsonPath('data.is_locked', true);
    }

    public function test_expired_subscription_blocks_shifts_until_renewed(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $this->makeActiveSubscription($company, ['ends_at' => Carbon::now()->addDay()]);
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/shifts')->assertOk();

        Carbon::setTestNow(Carbon::now()->addDays(2));

        $this->getJson('/api/v1/shifts')
            ->assertStatus(423)
            ->assertJsonPath('code', 'SUBSCRIPTION_REQUIRED');
    }

    public function test_renewal_restores_access_to_rosters_and_shifts(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $this->makeActiveSubscription($company, ['ends_at' => Carbon::now()->addDay()]);
        $this->actingAsCompanyAdmin($company);

        Carbon::setTestNow(Carbon::now()->addDays(2));

        // Locked after expiry.
        $this->getJson('/api/v1/rosters')->assertStatus(423);

        // The admin renews: a fresh active subscription extends `ends_at`.
        $this->makeActiveSubscription($company, ['ends_at' => Carbon::now()->addMonth(), 'starts_at' => Carbon::now()]);

        $this->getJson('/api/v1/rosters')->assertOk();
        $this->getJson('/api/v1/shifts')->assertOk();
    }

    public function test_locked_company_can_still_reach_billing_surface(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $this->actingAsCompanyAdmin($company);

        // Operational endpoints are locked (423)…
        $this->getJson('/api/v1/rosters')->assertStatus(423);

        // …but the billing surface stays reachable so the admin can reactivate.
        $this->getJson('/api/v1/subscription')
            ->assertOk();
    }
}