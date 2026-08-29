<?php

namespace Tests\Feature\Roster;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Roster;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class RosterManagementTest extends TestCase
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

        foreach (['roster.view', 'roster.create', 'roster.edit', 'roster.delete', 'roster.publish'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['roster.view', 'roster.create', 'roster.edit', 'roster.delete', 'roster.publish']);

        // Employees can only view rosters.
        $employee = Role::findOrCreate('employee', 'web');
        $employee->syncPermissions(['roster.view']);
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

    public function test_guest_cannot_access_rosters(): void
    {
        $this->getJson('/api/v1/rosters')->assertUnauthorized();
    }

    public function test_super_admin_can_list_rosters(): void
    {
        $this->actingAsSuperAdmin();
        Roster::factory()->count(3)->create();

        $this->getJson('/api/v1/rosters')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_super_admin_can_create_a_roster(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $start = Carbon::parse('2026-01-05'); // Monday
        $end = (clone $start)->addDays(6);

        $response = $this->postJson('/api/v1/rosters', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'week_start' => $start->toDateString(),
            'week_end' => $end->toDateString(),
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.week_start', $start->toDateString());
        $this->assertDatabaseHas('rosters', [
            'company_id' => $company->id,
            'status' => 'draft',
        ]);
    }

    public function test_creating_a_roster_requires_week_dates(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/rosters', ['company_id' => $company->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['week_start', 'week_end']);
    }

    public function test_week_end_must_be_after_or_equal_week_start(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/rosters', [
            'company_id' => $company->id,
            'week_start' => '2026-01-10',
            'week_end' => '2026-01-05',
        ])->assertUnprocessable()->assertJsonValidationErrors('week_end');
    }

    public function test_super_admin_can_view_a_roster_with_shifts(): void
    {
        $this->actingAsSuperAdmin();
        $roster = Roster::factory()->create();
        Shift::factory()->count(2)->create([
            'company_id' => $roster->company_id,
            'roster_id' => $roster->id,
        ]);

        $this->getJson("/api/v1/rosters/{$roster->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $roster->id)
            ->assertJsonCount(2, 'data.shifts');
    }

    public function test_super_admin_can_update_a_roster(): void
    {
        $this->actingAsSuperAdmin();
        $roster = Roster::factory()->create(['status' => 'draft']);

        $this->putJson("/api/v1/rosters/{$roster->id}", ['status' => 'archived'])
            ->assertOk()
            ->assertJsonPath('data.status', 'archived');
    }

    public function test_super_admin_can_delete_a_roster(): void
    {
        $this->actingAsSuperAdmin();
        $roster = Roster::factory()->create();

        $this->deleteJson("/api/v1/rosters/{$roster->id}")->assertOk();
        $this->assertDatabaseMissing('rosters', ['id' => $roster->id]);
    }

    public function test_can_publish_a_roster(): void
    {
        $admin = $this->actingAsSuperAdmin();
        $roster = Roster::factory()->create(['status' => 'draft']);

        $this->postJson("/api/v1/rosters/{$roster->id}/publish")
            ->assertOk()
            ->assertJsonPath('data.status', 'published')
            ->assertJsonPath('data.published_by', $admin->id);

        $this->assertDatabaseHas('rosters', [
            'id' => $roster->id,
            'status' => 'published',
            'published_by' => $admin->id,
        ]);
    }

    public function test_cannot_publish_an_already_published_roster(): void
    {
        $this->actingAsSuperAdmin();
        $roster = Roster::factory()->create(['status' => 'published', 'published_at' => now()]);

        $this->postJson("/api/v1/rosters/{$roster->id}/publish")->assertStatus(422);
    }

    public function test_can_copy_previous_week(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        $previousStart = Carbon::parse('2026-01-05'); // Monday
        $previous = Roster::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'week_start' => $previousStart->toDateString(),
            'week_end' => (clone $previousStart)->addDays(6)->toDateString(),
        ]);

        // Two shifts within the previous week.
        Shift::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'roster_id' => $previous->id,
            'date' => $previousStart->toDateString(),
        ]);
        Shift::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'roster_id' => $previous->id,
            'date' => (clone $previousStart)->addDays(2)->toDateString(),
        ]);

        $newStart = (clone $previousStart)->addDays(7); // next Monday

        $response = $this->postJson('/api/v1/rosters/copy-previous-week', [
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'week_start' => $newStart->toDateString(),
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.week_start', $newStart->toDateString())
            ->assertJsonCount(2, 'data.shifts');

        $newRosterId = $response->json('data.id');
        // Shift dates should be shifted forward by 7 days.
        $this->assertDatabaseHas('shifts', [
            'roster_id' => $newRosterId,
        ]);
        $this->assertEquals(2, \App\Models\Shift::where('roster_id', $newRosterId)->count());
    }

    public function test_copy_previous_week_fails_when_no_source_exists(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();

        $this->postJson('/api/v1/rosters/copy-previous-week', [
            'company_id' => $company->id,
            'week_start' => '2026-02-02',
        ])->assertStatus(422);
    }

    public function test_company_admin_only_sees_own_company_rosters(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        Roster::factory()->count(2)->create(['company_id' => $company->id]);
        Roster::factory()->count(3)->create(['company_id' => $otherCompany->id]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/rosters')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');
    }

    public function test_company_admin_creates_roster_scoped_to_own_company(): void
    {
        $company = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $response = $this->postJson('/api/v1/rosters', [
            'company_id' => $otherCompany->id,
            'week_start' => '2026-01-05',
            'week_end' => '2026-01-11',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.company_id', $company->id);
    }

    public function test_company_admin_cannot_view_other_company_roster(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $roster = Roster::factory()->create(['company_id' => $otherCompany->id]);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->getJson("/api/v1/rosters/{$roster->id}")->assertForbidden();
    }

    public function test_company_admin_cannot_publish_other_company_roster(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();
        $roster = Roster::factory()->create(['company_id' => $otherCompany->id, 'status' => 'draft']);
        $this->actingAsCompanyAdmin($ownCompany);

        $this->postJson("/api/v1/rosters/{$roster->id}/publish")->assertForbidden();
    }

    public function test_employee_cannot_create_roster(): void
    {
        $company = Company::factory()->create();
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/rosters', [
            'week_start' => '2026-01-05',
            'week_end' => '2026-01-11',
        ])->assertForbidden();
    }

    public function test_employee_cannot_publish_roster(): void
    {
        $company = Company::factory()->create();
        $roster = Roster::factory()->create(['company_id' => $company->id, 'status' => 'draft']);
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/rosters/{$roster->id}/publish")->assertForbidden();
    }
}
