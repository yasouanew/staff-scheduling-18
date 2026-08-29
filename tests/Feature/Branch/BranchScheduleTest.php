<?php

namespace Tests\Feature\Branch;

use App\Models\Branch;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Covers a branch's trading hours and break policy.
 *
 * The behaviour worth protecting here is the *default + exceptions* model: a
 * branch states one standard day, and only the days that genuinely differ are
 * stored. These tests pin that down so a future refactor cannot quietly turn it
 * into "seven independent days", which would break the ability to change the
 * standard hours in one place.
 */
class BranchScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['branch.view', 'branch.create', 'branch.edit', 'branch.delete'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        Role::findOrCreate('super_admin', 'web')->syncPermissions(Permission::all());
    }

    /** Authenticate as a super admin, who may manage any branch. */
    protected function actingAsSuperAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_branch_can_be_created_with_default_hours_and_break(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Sydney CBD',
            'timezone' => 'Australia/Sydney',
            'default_opens_at' => '09:00',
            'default_closes_at' => '17:30',
            'default_break_minutes' => 30,
            'default_break_paid' => false,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.default_opens_at', '09:00')
            ->assertJsonPath('data.default_closes_at', '17:30')
            ->assertJsonPath('data.default_break_minutes', 30)
            ->assertJsonPath('data.default_break_paid', false);
    }

    public function test_every_weekday_inherits_the_default_day_when_no_override_exists(): void
    {
        $this->actingAsSuperAdmin();

        $branch = Branch::factory()->create([
            'default_opens_at' => '08:00',
            'default_closes_at' => '16:00',
            'default_break_minutes' => 45,
            'default_break_paid' => true,
            'day_schedules' => null,
        ]);

        $response = $this->getJson("/api/v1/branches/{$branch->id}")->assertOk();

        foreach (Branch::WEEKDAYS as $weekday) {
            $response->assertJsonPath("data.day_schedules.{$weekday}.opens_at", '08:00')
                ->assertJsonPath("data.day_schedules.{$weekday}.closes_at", '16:00')
                ->assertJsonPath("data.day_schedules.{$weekday}.break_minutes", 45)
                ->assertJsonPath("data.day_schedules.{$weekday}.break_paid", true)
                // The whole point of inheritance: nothing here is "custom".
                ->assertJsonPath("data.day_schedules.{$weekday}.is_custom", false);
        }
    }

    public function test_a_weekday_override_replaces_the_default_for_that_day_only(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $response = $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Late Saturday Branch',
            'timezone' => 'Australia/Sydney',
            'default_opens_at' => '09:00',
            'default_closes_at' => '17:00',
            'default_break_minutes' => 30,
            'day_schedules' => [
                'saturday' => [
                    'is_open' => true,
                    'opens_at' => '10:00',
                    'closes_at' => '14:00',
                    'break_minutes' => 15,
                    'break_paid' => true,
                ],
            ],
        ])->assertCreated();

        // Saturday uses its own figures...
        $response->assertJsonPath('data.day_schedules.saturday.opens_at', '10:00')
            ->assertJsonPath('data.day_schedules.saturday.closes_at', '14:00')
            ->assertJsonPath('data.day_schedules.saturday.break_minutes', 15)
            ->assertJsonPath('data.day_schedules.saturday.break_paid', true)
            ->assertJsonPath('data.day_schedules.saturday.is_custom', true);

        // ...while every other day is untouched by it.
        $response->assertJsonPath('data.day_schedules.monday.opens_at', '09:00')
            ->assertJsonPath('data.day_schedules.monday.closes_at', '17:00')
            ->assertJsonPath('data.day_schedules.monday.is_custom', false);
    }

    public function test_a_closed_day_reports_closed_without_inheriting_default_times(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Closed Sundays',
            'timezone' => 'Australia/Sydney',
            'default_opens_at' => '09:00',
            'default_closes_at' => '17:00',
            'day_schedules' => [
                'sunday' => ['is_open' => false],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.day_schedules.sunday.is_open', false)
            // A closed day must not advertise trading times, or a roster could
            // schedule against them.
            ->assertJsonPath('data.day_schedules.sunday.opens_at', null)
            ->assertJsonPath('data.day_schedules.sunday.closes_at', null)
            ->assertJsonPath('data.day_schedules.sunday.is_custom', true);
    }

    public function test_overnight_trading_hours_are_accepted(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        // A bar open 18:00–02:00 is ordinary; "closes before opens" is not an error.
        $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Night Bar',
            'timezone' => 'Australia/Sydney',
            'default_opens_at' => '18:00',
            'default_closes_at' => '02:00',
        ])->assertCreated();
    }

    public function test_identical_opening_and_closing_times_are_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        // A zero-length trading day, on the other hand, is always a mistake.
        $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Impossible Branch',
            'timezone' => 'Australia/Sydney',
            'default_opens_at' => '09:00',
            'default_closes_at' => '09:00',
        ])->assertUnprocessable()->assertJsonValidationErrors('default_closes_at');
    }

    public function test_break_longer_than_eight_hours_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Long Break Branch',
            'timezone' => 'Australia/Sydney',
            'default_break_minutes' => 481,
        ])->assertUnprocessable()->assertJsonValidationErrors('default_break_minutes');
    }

    public function test_malformed_weekday_time_is_rejected(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/branches', [
            'company_id' => $company->id,
            'name' => 'Bad Time Branch',
            'timezone' => 'Australia/Sydney',
            'day_schedules' => [
                'monday' => ['is_open' => true, 'opens_at' => '25:99'],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('day_schedules.monday.opens_at');
    }

    public function test_removing_an_override_returns_the_day_to_the_default(): void
    {
        $this->actingAsSuperAdmin();

        $branch = Branch::factory()->create([
            'default_opens_at' => '09:00',
            'default_closes_at' => '17:00',
            'day_schedules' => [
                'friday' => [
                    'is_open' => true,
                    'opens_at' => '11:00',
                    'closes_at' => '23:00',
                ],
            ],
        ]);

        // Sending an empty set of exceptions is how the UI says "no day differs".
        $this->putJson("/api/v1/branches/{$branch->id}", ['day_schedules' => []])
            ->assertOk()
            ->assertJsonPath('data.day_schedules.friday.opens_at', '09:00')
            ->assertJsonPath('data.day_schedules.friday.closes_at', '17:00')
            ->assertJsonPath('data.day_schedules.friday.is_custom', false);
    }
}
