<?php

namespace Tests\Feature\Roster;

use App\Enums\RosterChangeType;
use App\Models\Branch;
use App\Models\Company;
use App\Models\Employee;
use App\Models\Position;
use App\Models\Roster;
use App\Models\RosterChange;
use App\Models\Shift;
use App\Models\User;
use App\Notifications\RosterChangeNotification;
use App\Notifications\RosterPublishedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Feature tests for the post-publication roster change system:
 *
 *  - preview is read-only and backend-computed,
 *  - every mutation type (add / update / cancel / reassign) records the right
 *    change row(s) with old/new snapshots,
 *  - the roster version bumps and the optimistic lock rejects stale saves (409),
 *  - each affected employee gets exactly one grouped notification per save,
 *  - the change history endpoint returns the audit trail.
 *
 * Runs against the same permissions/middleware used by {@see RosterManagementTest}
 * so the two suites stay consistent.
 */
class RosterChangesTest extends TestCase
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

    /** Build a published roster with an employee + user + one assigned shift. */
    protected function makePublishedRoster(): array
    {
        $company = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $company->id]);
        $position = Position::factory()->create(['company_id' => $company->id]);

        $employeeUser = User::factory()->create(['company_id' => $company->id]);
        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'user_id' => $employeeUser->id,
            'branch_id' => $branch->id,
            'position_id' => $position->id,
        ]);

        $roster = Roster::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'status' => 'published',
            'published_at' => now(),
            'published_by' => $employeeUser->id,
        ]);

        $shift = Shift::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'roster_id' => $roster->id,
            'employee_id' => $employee->id,
            'position_id' => $position->id,
            'date' => $roster->week_start,
            'start_time' => '09:00:00',
            'end_time' => '17:00:00',
            'break_minutes' => 30,
            'status' => 'scheduled',
            'notes' => null,
        ]);

        return compact('company', 'branch', 'position', 'employeeUser', 'employee', 'roster', 'shift');
    }

    /* ------------------------------------------------------------------ */
    /* Preview                                                             */
    /* ------------------------------------------------------------------ */

    public function test_guest_cannot_preview_changes(): void
    {
        $roster = Roster::factory()->create(['status' => 'published', 'published_at' => now()]);

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/preview", [
            'mutations' => [['type' => 'add', 'shift' => ['date' => '2026-01-05', 'start_time' => '09:00', 'end_time' => '17:00']]],
        ])->assertUnauthorized();
    }

    public function test_preview_is_rejected_for_a_draft_roster(): void
    {
        $this->actingAsSuperAdmin();
        $roster = Roster::factory()->create(['status' => 'draft']);

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/preview", [
            'mutations' => [['type' => 'add', 'shift' => ['date' => '2026-01-05', 'start_time' => '09:00', 'end_time' => '17:00']]],
        ])->assertStatus(422);
    }

    public function test_preview_returns_the_affected_employee_summary_without_writing(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift] = $this->makePublishedRoster();

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/preview", [
            'mutations' => [[
                'type' => 'update',
                'id' => $shift->id,
                'shift' => [
                    'employee_id' => $shift->employee_id,
                    'start_time' => '10:00',
                    'end_time' => '18:00',
                ],
            ]],
        ])
            ->assertOk()
            ->assertJsonPath('data.roster_id', $roster->id)
            ->assertJsonPath('data.change_count', 1)
            ->assertJsonPath('data.affected_employee_count', 1)
            ->assertJsonPath('data.changes.0.action', RosterChangeType::ShiftUpdated->value)
            ->assertJsonPath('data.changes.0.employee_id', $shift->employee_id);

        // Preview must be read-only: no change rows and the version is untouched.
        $this->assertDatabaseCount('roster_changes', 0);
        $this->assertSame(1, $roster->fresh()->version);
    }

    public function test_preview_requires_mutations(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster] = $this->makePublishedRoster();

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/preview", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('mutations');
    }

    public function test_preview_rejects_shifts_not_owned_by_the_roster(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster] = $this->makePublishedRoster();

        $foreignRoster = Roster::factory()->create(['status' => 'published', 'published_at' => now()]);
        $foreignShift = Shift::factory()->create(['roster_id' => $foreignRoster->id]);

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/preview", [
            'mutations' => [['type' => 'cancel', 'id' => $foreignShift->id]],
        ])->assertStatus(409);
    }

    /* ------------------------------------------------------------------ */
    /* Apply — change recording                                            */
    /* ------------------------------------------------------------------ */

    public function test_apply_adds_a_new_shift_and_records_shift_added(): void
    {
        $admin = $this->actingAsSuperAdmin();
        ['roster' => $roster, 'employee' => $employee] = $this->makePublishedRoster();

        $versionBefore = $roster->version;

        $response = $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $versionBefore,
            'mutations' => [[
                'type' => 'add',
                'shift' => [
                    'employee_id' => $employee->id,
                    'date' => $roster->week_start,
                    'start_time' => '13:00',
                    'end_time' => '21:00',
                    'break_minutes' => 30,
                    'paid_break' => false,
                    'required_staff' => 1,
                ],
            ]],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.change_count', 1)
            ->assertJsonPath('data.changes.0.action', RosterChangeType::ShiftAdded->value);

        $this->assertDatabaseHas('shifts', [
            'roster_id' => $roster->id,
            'employee_id' => $employee->id,
            'start_time' => '13:00',
            'end_time' => '21:00',
        ]);
        $this->assertDatabaseHas('roster_changes', [
            'roster_id' => $roster->id,
            'action' => RosterChangeType::ShiftAdded->value,
            'performed_by' => $admin->id,
        ]);
        $this->assertSame($versionBefore + 1, $roster->fresh()->version);
    }

    public function test_apply_updates_a_shift_and_records_shift_updated_with_snapshots(): void
    {
        $admin = $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift, 'employee' => $employee] = $this->makePublishedRoster();

        $response = $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $roster->version,
            'mutations' => [[
                'type' => 'update',
                'id' => $shift->id,
                'shift' => ['start_time' => '08:00', 'end_time' => '16:00', 'break_minutes' => 45],
            ]],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.change_count', 1)
            ->assertJsonPath('data.changes.0.action', RosterChangeType::ShiftUpdated->value)
            ->assertJsonPath('data.changes.0.employee_id', $employee->id);

        $this->assertDatabaseHas('shifts', ['id' => $shift->id, 'start_time' => '08:00', 'end_time' => '16:00', 'break_minutes' => 45]);

        $change = RosterChange::where('roster_id', $roster->id)->where('action', RosterChangeType::ShiftUpdated->value)->firstOrFail();
        $this->assertSame($shift->id, $change->shift_id);
        $this->assertSame($admin->id, $change->performed_by);
        $this->assertSame('09:00:00', $change->old_data['start_time']);
        $this->assertSame('08:00', $change->new_data['start_time']);
        $this->assertSame('17:00:00', $change->old_data['end_time']);
        $this->assertSame('16:00', $change->new_data['end_time']);
    }

    public function test_apply_cancels_a_shift_instead_of_deleting_it(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift, 'employee' => $employee] = $this->makePublishedRoster();

        $response = $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $roster->version,
            'mutations' => [['type' => 'cancel', 'id' => $shift->id]],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.change_count', 1)
            ->assertJsonPath('data.changes.0.action', RosterChangeType::ShiftCancelled->value)
            ->assertJsonPath('data.changes.0.employee_id', $employee->id);

        // The shift still exists, now cancelled — never hard-deleted.
        $this->assertDatabaseHas('shifts', ['id' => $shift->id, 'status' => 'cancelled']);
        $this->assertDatabaseHas('roster_changes', [
            'roster_id' => $roster->id,
            'shift_id' => $shift->id,
            'action' => RosterChangeType::ShiftCancelled->value,
        ]);
    }

    public function test_apply_reassignment_records_two_effects_for_old_and_new_employee(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift, 'employee' => $employee, 'company' => $company] = $this->makePublishedRoster();

        $newEmployeeUser = User::factory()->create(['company_id' => $company->id]);
        $newEmployee = Employee::factory()->create([
            'company_id' => $company->id,
            'user_id' => $newEmployeeUser->id,
            'branch_id' => $roster->branch_id,
        ]);

        $response = $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $roster->version,
            'mutations' => [['type' => 'reassign', 'id' => $shift->id, 'employee_id' => $newEmployee->id]],
        ]);

        $response->assertOk()->assertJsonPath('data.change_count', 2);

        $actions = collect($response->json('data.changes'))->pluck('action')->all();
        $this->assertContains(RosterChangeType::ShiftReassigned->value, $actions);
        $this->assertContains(RosterChangeType::ShiftAssigned->value, $actions);

        // Two change rows: the old employee was removed, the new one assigned.
        $this->assertDatabaseHas('roster_changes', [
            'roster_id' => $roster->id,
            'shift_id' => $shift->id,
            'action' => RosterChangeType::ShiftReassigned->value,
            'employee_id' => $employee->id,
        ]);
        $this->assertDatabaseHas('roster_changes', [
            'roster_id' => $roster->id,
            'shift_id' => $shift->id,
            'action' => RosterChangeType::ShiftAssigned->value,
            'employee_id' => $newEmployee->id,
        ]);
        $this->assertDatabaseHas('shifts', ['id' => $shift->id, 'employee_id' => $newEmployee->id]);
    }

    public function test_apply_records_an_unassignment_when_employee_is_removed(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift, 'employee' => $employee] = $this->makePublishedRoster();

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $roster->version,
            'mutations' => [[
                'type' => 'update',
                'id' => $shift->id,
                'shift' => ['employee_id' => null],
            ]],
        ])
            ->assertOk()
            ->assertJsonPath('data.change_count', 1)
            ->assertJsonPath('data.changes.0.action', RosterChangeType::ShiftReassigned->value)
            ->assertJsonPath('data.changes.0.employee_id', $employee->id);

        $this->assertDatabaseHas('shifts', ['id' => $shift->id, 'employee_id' => null]);
    }

    public function test_apply_records_a_location_change_when_branch_changes(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift, 'company' => $company] = $this->makePublishedRoster();

        $newBranch = Branch::factory()->create(['company_id' => $company->id]);

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $roster->version,
            'mutations' => [[
                'type' => 'update',
                'id' => $shift->id,
                'shift' => ['branch_id' => $newBranch->id],
            ]],
        ])
            ->assertOk()
            ->assertJsonPath('data.changes.0.action', RosterChangeType::ShiftLocationChanged->value);

        $this->assertDatabaseHas('shifts', ['id' => $shift->id, 'branch_id' => $newBranch->id]);
    }

    /* ------------------------------------------------------------------ */
    /* Concurrency / optimistic locking                                     */
    /* ------------------------------------------------------------------ */

    public function test_apply_rejects_a_stale_version_with_409(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift] = $this->makePublishedRoster();

        // Simulate another editor having bumped the version since this client
        // last loaded the roster.
        $roster->increment('version');
        $staleVersion = $roster->fresh()->version - 1;

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $staleVersion,
            'mutations' => [['type' => 'cancel', 'id' => $shift->id]],
        ])->assertStatus(409);
    }

    public function test_apply_with_a_current_version_succeeds(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift] = $this->makePublishedRoster();

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $roster->version,
            'mutations' => [['type' => 'cancel', 'id' => $shift->id]],
        ])->assertOk();

        $this->assertSame($roster->version + 1, $roster->fresh()->version);
    }

    public function test_apply_requires_a_version(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift] = $this->makePublishedRoster();

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'mutations' => [['type' => 'cancel', 'id' => $shift->id]],
        ])->assertUnprocessable()->assertJsonValidationErrors('version');
    }

    /* ------------------------------------------------------------------ */
    /* Notifications (grouped per employee)                                */
    /* ------------------------------------------------------------------ */

    public function test_applying_changes_notifies_each_affected_employee_once(): void
    {
        Notification::fake();
        $this->actingAsSuperAdmin();

        $company = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        // Two employees, each with a shift on the published roster.
        $users = [];
        $employees = [];
        for ($i = 0; $i < 2; $i++) {
            $users[$i] = User::factory()->create(['company_id' => $company->id]);
            $employees[$i] = Employee::factory()->create([
                'company_id' => $company->id,
                'user_id' => $users[$i]->id,
                'branch_id' => $branch->id,
            ]);
        }

        $roster = Roster::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'status' => 'published',
            'published_at' => now(),
        ]);

        $shifts = [];
        foreach ($employees as $index => $employee) {
            $shifts[$index] = Shift::factory()->create([
                'company_id' => $company->id,
                'branch_id' => $branch->id,
                'roster_id' => $roster->id,
                'employee_id' => $employee->id,
                'date' => $roster->week_start,
                'start_time' => '09:00:00',
                'end_time' => '17:00:00',
            ]);
        }

        // Both employees get one update each in the same batch.
        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $roster->version,
            'mutations' => [
                ['type' => 'update', 'id' => $shifts[0]->id, 'shift' => ['start_time' => '10:00', 'end_time' => '18:00']],
                ['type' => 'update', 'id' => $shifts[1]->id, 'shift' => ['start_time' => '11:00', 'end_time' => '19:00']],
            ],
        ])->assertOk()->assertJsonPath('data.affected_employee_count', 2);

        // Exactly one grouped notification per employee per save.
        Notification::assertSentTo($users[0], RosterChangeNotification::class, 1);
        Notification::assertSentTo($users[1], RosterChangeNotification::class, 1);
    }

    public function test_publish_notifies_each_rostered_employee(): void
    {
        Notification::fake();
        $admin = $this->actingAsSuperAdmin();

        $company = Company::factory()->create();
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        $employeeUser = User::factory()->create(['company_id' => $company->id]);
        $employee = Employee::factory()->create([
            'company_id' => $company->id,
            'user_id' => $employeeUser->id,
            'branch_id' => $branch->id,
        ]);

        $roster = Roster::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'status' => 'draft',
        ]);

        Shift::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'roster_id' => $roster->id,
            'employee_id' => $employee->id,
            'date' => $roster->week_start,
            'start_time' => '09:00:00',
            'end_time' => '17:00:00',
        ]);

        $this->postJson("/api/v1/rosters/{$roster->id}/publish")
            ->assertOk()
            ->assertJsonPath('data.status', 'published');

        Notification::assertSentTo($employeeUser, RosterPublishedNotification::class, 1);

        // The publish is also recorded in the change history with the performer.
        $this->assertDatabaseHas('roster_changes', [
            'roster_id' => $roster->id,
            'action' => RosterChangeType::RosterPublished->value,
            'performed_by' => $admin->id,
        ]);
    }

    /* ------------------------------------------------------------------ */
    /* History / audit                                                     */
    /* ------------------------------------------------------------------ */

    public function test_change_history_lists_recorded_changes_in_reverse_order(): void
    {
        $admin = $this->actingAsSuperAdmin();
        ['roster' => $roster, 'shift' => $shift] = $this->makePublishedRoster();

        // Publish + one change so the history has multiple rows.
        RosterChange::create([
            'roster_id' => $roster->id,
            'shift_id' => null,
            'employee_id' => null,
            'action' => RosterChangeType::RosterPublished->value,
            'old_data' => null,
            'new_data' => ['status' => 'published'],
            'performed_by' => $admin->id,
        ]);
        RosterChange::create([
            'roster_id' => $roster->id,
            'shift_id' => $shift->id,
            'employee_id' => $shift->employee_id,
            'action' => RosterChangeType::ShiftUpdated->value,
            'old_data' => [],
            'new_data' => [],
            'performed_by' => $admin->id,
        ]);

        $this->getJson("/api/v1/rosters/{$roster->id}/changes")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data.data');

        $first = $this->getJson("/api/v1/rosters/{$roster->id}/changes")->json('data.data.0');
        $this->assertSame(RosterChangeType::ShiftUpdated->value, $first['action']);
        $this->assertSame($admin->id, $first['performed_by']);
    }

    public function test_guest_cannot_read_change_history(): void
    {
        $roster = Roster::factory()->create(['status' => 'published', 'published_at' => now()]);

        $this->getJson("/api/v1/rosters/{$roster->id}/changes")->assertUnauthorized();
    }

    /* ------------------------------------------------------------------ */
    /* Permissions                                                         */
    /* ------------------------------------------------------------------ */

    public function test_employee_cannot_apply_changes(): void
    {
        $company = Company::factory()->create();
        $roster = Roster::factory()->create(['company_id' => $company->id, 'status' => 'published', 'published_at' => now()]);
        $shift = Shift::factory()->create(['company_id' => $company->id, 'roster_id' => $roster->id]);

        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => 1,
            'mutations' => [['type' => 'cancel', 'id' => $shift->id]],
        ])->assertForbidden();
    }

    public function test_company_admin_cannot_change_another_companys_roster(): void
    {
        $ownCompany = Company::factory()->create();
        $otherCompany = Company::factory()->create();

        $roster = Roster::factory()->create(['company_id' => $otherCompany->id, 'status' => 'published', 'published_at' => now()]);
        $shift = Shift::factory()->create(['company_id' => $otherCompany->id, 'roster_id' => $roster->id]);

        $user = User::factory()->create(['company_id' => $ownCompany->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => 1,
            'mutations' => [['type' => 'cancel', 'id' => $shift->id]],
        ])->assertForbidden();
    }

    public function test_cancel_mutation_requires_a_valid_shift_id(): void
    {
        $this->actingAsSuperAdmin();
        ['roster' => $roster] = $this->makePublishedRoster();

        $this->postJson("/api/v1/rosters/{$roster->id}/changes/apply", [
            'version' => $roster->version,
            'mutations' => [['type' => 'cancel']],
        ])->assertUnprocessable()->assertJsonValidationErrors('mutations.0.id');
    }
}
