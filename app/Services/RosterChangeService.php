<?php

namespace App\Services;

use App\Enums\RosterChangeType;
use App\Jobs\DispatchRosterNotifications;
use App\Models\Employee;
use App\Models\Roster;
use App\Models\RosterChange;
use App\Models\Shift;
use App\Models\User;
use App\Notifications\RosterChangeNotification;
use App\Notifications\RosterPublishedNotification;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Orchestrates roster publishing and post-publication change management.
 *
 * Both the publish flow and the post-publication "Save Changes & Notify" flow
 * share one transaction strategy:
 *
 *   1. acquire a row lock on the roster,
 *   2. verify the optimistic-lock `version` the client supplied still matches,
 *   3. apply mutations (cancel instead of hard-delete once published),
 *   4. write one `roster_changes` row per detected change,
 *   5. bump `version`,
 *   6. persist ONE grouped database notification per affected employee,
 *   7. commit,
 *   8. dispatch a queued job that sends only the realtime/broadcast + FCM push
 *      (never blocking or rolling back the committed transaction).
 *
 * `preview()` runs the identical detection pipeline without writing anything,
 * so the affected-employee summary shown to the manager is always a faithful
 * reflection of what `apply()` will record.
 */
class RosterChangeService
{
    public function __construct(
        private RosterChangeDetector $detector,
    ) {}

    /**
     * Publish a roster, notifying every employee with shifts on it.
     */
    public function publish(Roster $roster, User $publisher): Roster
    {
        return DB::transaction(function () use ($roster, $publisher) {
            $roster = Roster::query()->lockForUpdate()->findOrFail($roster->id);

            $roster->update([
                'status' => 'published',
                'published_at' => now(),
                'published_by' => $publisher->id,
            ]);
            $roster->increment('version');

            // Record the publish in the change history (one row, no employee).
            RosterChange::create([
                'roster_id' => $roster->id,
                'action' => RosterChangeType::RosterPublished->value,
                'old_data' => null,
                'new_data' => ['status' => 'published'],
                'performed_by' => $publisher->id,
            ]);

            $employees = $roster->shifts()
                ->whereNotNull('employee_id')
                ->with('employee.user')
                ->get()
                ->pluck('employee')
                ->filter()
                ->unique('id')
                ->values();

            $rosterFresh = $roster->refresh();
            $this->persistDatabaseNotifications(
                $employees,
                RosterPublishedNotification::class,
                fn (Employee $employee) => (new RosterPublishedNotification($rosterFresh))->toArray($employee->user ?? new User),
            );

            // Push + broadcast are delivered on the queue only AFTER the
            // transaction commits, so a push failure can never roll back (or
            // block) the publish.
            DB::afterCommit(fn () => dispatch(new DispatchRosterNotifications(
                rosterId: $roster->id,
                employeeIds: $employees->pluck('id')->all(),
                changeIds: [],
                isPublish: true,
            )));

            return $rosterFresh;
        });
    }

    /**
     * Compute the affected-employee summary for a set of mutations without
     * writing anything (backend is the source of truth for the UI preview).
     *
     * @param  array<string, mixed>  $mutations
     * @return array<string, mixed>
     */
    public function preview(Roster $roster, array $mutations): array
    {
        $this->assertOwnedShifts($roster, $mutations);

        $changes = collect($mutations)
            ->flatMap(fn (array $mutation) => $this->detectForMutation($roster, $mutation))
            ->values();

        return [
            'roster_id' => $roster->id,
            'version' => (int) $roster->version,
            'affected_employee_count' => $changes->pluck('employee_id')->filter()->unique()->count(),
            'change_count' => $changes->count(),
            'changes' => $changes->all(),
            'employees' => $this->groupedByEmployee($changes),
        ];
    }

    /**
     * Apply a set of mutations to a published roster inside a single
     * transaction, record every change, notify affected employees (grouped)
     * and bump the optimistic-lock version.
     *
     * The caller MUST pass `version` equal to the roster's current version;
     * `assertVersion()` raises {@see RuntimeException} (mapped to HTTP 409)
     * when it no longer matches, protecting against concurrent stale edits.
     *
     * @param  array<string, mixed>  $mutations
     * @return array<string, mixed>
     */
    public function apply(Roster $roster, array $mutations, User $performer, ?int $expectedVersion = null): array
    {
        return DB::transaction(function () use ($roster, $mutations, $performer, $expectedVersion) {
            $roster = Roster::query()->lockForUpdate()->findOrFail($roster->id);

            $this->assertVersion($roster, $expectedVersion);
            $this->assertOwnedShifts($roster, $mutations);

            $changes = collect();
            $changeIds = [];

            foreach ($mutations as $mutation) {
                [$detected, $ids] = $this->applyMutation($roster, $mutation, $performer);
                $changes = $changes->concat($detected);
                $changeIds = array_merge($changeIds, $ids);
            }

            $roster->increment('version');

            $employees = $this->employeesByIds($changes->pluck('employee_id')->filter()->unique()->all());
            $grouped = $this->groupedByEmployee($changes);

            $rosterFresh = $roster->refresh();

            // The notification serializes RosterChange models, so load the rows
            // we just persisted and group them by employee.
            $persistedChanges = RosterChange::query()->whereIn('id', $changeIds)->get();

            $this->persistDatabaseNotifications(
                $employees,
                RosterChangeNotification::class,
                function (Employee $employee) use ($rosterFresh, $persistedChanges) {
                    $myChanges = $persistedChanges->where('employee_id', $employee->id)->values();

                    return (new RosterChangeNotification(
                        $rosterFresh,
                        $myChanges,
                        $this->summaryFor($myChanges),
                    ))->toArray($employee->user ?? new User);
                },
            );

            // Push + broadcast are delivered on the queue only AFTER the
            // transaction commits, so a push failure can never roll back (or
            // block) the change save.
            DB::afterCommit(fn () => dispatch(new DispatchRosterNotifications(
                rosterId: $roster->id,
                employeeIds: $employees->pluck('id')->all(),
                changeIds: $changeIds,
                isPublish: false,
            )));

            return [
                'roster_id' => $roster->id,
                'version' => (int) $roster->version,
                'affected_employee_count' => $employees->count(),
                'change_count' => $changes->count(),
                'changes' => $changes->all(),
                'employees' => $grouped,
            ];
        });
    }

    /**
     * Paginated change/audit history for a roster.
     */
    public function history(Roster $roster, int $perPage = 25): LengthAwarePaginator
    {
        return RosterChange::query()
            ->with(['employee', 'performer'])
            ->where('roster_id', $roster->id)
            ->orderByDesc('created_at')
            ->paginate($perPage)
            ->withQueryString();
    }

    /* ------------------------------------------------------------------ */
    /* Mutation application                                                */
    /* ------------------------------------------------------------------ */

    /**
     * Apply a single mutation, returning its detected change record(s) plus the
     * persisted change ids.
     *
     * @param  array<string, mixed>  $mutation
     * @return array{0: Collection<int, array<string, mixed>>, 1: list<int>}
     */
    protected function applyMutation(Roster $roster, array $mutation, User $performer): array
    {
        $type = $mutation['type'] ?? 'update';

        $old = null;
        if (isset($mutation['id']) && $this->isRealShiftId($mutation['id'])) {
            $old = $roster->shifts()->findOrFail($mutation['id']);
        }

        $data = $mutation['shift'] ?? [];
        $data['roster_id'] = $roster->id;
        $data['company_id'] = $roster->company_id;
        $data['branch_id'] ??= $roster->branch_id;

        // Keep `$old` pristine (the before-state) and apply to a separate
        // instance: Eloquent's update() mutates the model in place, which would
        // otherwise corrupt the before-state used for change detection.
        $shift = $old !== null ? $old->fresh() : null;
        $isCancel = false;

        switch ($type) {
            case 'add':
                $shift = $roster->shifts()->create($data);
                break;

            case 'cancel':
                if ($shift !== null) {
                    // Soft-cancel: mark the shift cancelled and persist it so it
                    // stays visible (greyed out) in the roster grid. The
                    // cancellation is recorded as an audit row (with the shift's
                    // id + before snapshot) so the history and the per-employee
                    // notification remain intact.
                    $data['status'] = 'cancelled';
                    $shift->update($data);
                    $isCancel = true;
                }
                break;

            case 'reassign':
                if ($shift !== null) {
                    $data['employee_id'] = $mutation['employee_id'] ?? null;
                    $shift->update($data);
                }
                break;

            case 'update':
            default:
                if ($shift !== null) {
                    $shift->update($data);
                }
                break;
        }

        // Detect against the applied state. For a cancellation the "after" is
        // the shift marked cancelled, but detection is run against the
        // synthetic cancelled snapshot (with unchanged fields carried over) so
        // it yields exactly the ShiftCancelled record the preview reported.
        $after = $isCancel ? null : ($shift !== null ? $shift->fresh() : null);

        // Mirror detectForMutation(): carry the current shift's unchanged
        // fields into $data so the audit new_data snapshot for a cancellation
        // matches exactly what the preview reported.
        if ($isCancel && $old !== null) {
            foreach ($this->detector->snapshot($old) as $key => $value) {
                $data[$key] ??= $value;
            }
            $data['id'] = $old->id;
        }

        $detected = $after !== null
            ? $this->detector->detect($old, $this->detector->snapshot($after))
            : $this->detector->detect($old, $data);
        $ids = [];

        $records = collect($detected)->map(function (array $change) use ($roster, $shift, $performer, &$ids) {
            if ($shift !== null) {
                $change['shift_id'] = $shift->id;
                if (isset($change['new_data'])) {
                    $change['new_data']['id'] = $shift->id;
                }
            }

            $record = RosterChange::create([
                'roster_id' => $roster->id,
                'shift_id' => $change['shift_id'],
                'employee_id' => $change['employee_id'],
                'action' => $change['action'],
                'old_data' => $change['old_data'],
                'new_data' => $change['new_data'],
                'performed_by' => $performer->id,
            ]);

            $ids[] = $record->id;

            return [
                'id' => $record->id,
                'roster_id' => $record->roster_id,
                'shift_id' => $record->shift_id,
                'employee_id' => $record->employee_id,
                'action' => $record->action,
                'old_data' => $record->old_data,
                'new_data' => $record->new_data,
                'created_at' => optional($record->created_at)->toIso8601String(),
            ];
        });

        return [$records, $ids];
    }

    /**
     * Run the detector for a mutation without touching the database (preview).
     *
     * @param  array<string, mixed>  $mutation
     * @return array<int, array<string, mixed>>
     */
    protected function detectForMutation(Roster $roster, array $mutation): array
    {
        $old = null;
        if (isset($mutation['id']) && $this->isRealShiftId($mutation['id'])) {
            $old = $roster->shifts()->find($mutation['id']);
        }

        $data = $mutation['shift'] ?? [];
        $data['roster_id'] = $roster->id;
        $data['company_id'] = $roster->company_id;
        $data['branch_id'] ??= $roster->branch_id;

        if (($mutation['type'] ?? 'update') === 'cancel' && $old !== null) {
            $data['status'] = 'cancelled';
        }
        if (($mutation['type'] ?? 'update') === 'reassign') {
            $data['employee_id'] = $mutation['employee_id'] ?? null;
        }

        // Carry over unchanged fields from the current shift so a partial
        // update (e.g. only start_time) previews exactly like apply() records.
        if ($old !== null) {
            foreach ($this->detector->snapshot($old) as $key => $value) {
                $data[$key] ??= $value;
            }
            $data['id'] = $old->id;
        }

        return $this->detector->detect($old, $data);
    }

    /* ------------------------------------------------------------------ */
    /* Grouping + notifications                                            */
    /* ------------------------------------------------------------------ */

    /**
     * @param  Collection<int, array<string, mixed>>  $changes
     * @return list<array<string, mixed>>
     */
    protected function groupedByEmployee(Collection $changes): array
    {
        $employees = $this->employeesByIds($changes->pluck('employee_id')->filter()->unique()->all());

        return $changes->groupBy('employee_id')->map(
            fn (Collection $group, $employeeId) => [
                'employee_id' => (int) $employeeId,
                'employee_name' => optional($employees->firstWhere('id', (int) $employeeId))->full_name,
                'changes' => $group->values()->all(),
            ]
        )->values()->all();
    }

    /**
     * @param  list<int>  $ids
     * @return Collection<int, Employee>
     */
    protected function employeesByIds(array $ids): Collection
    {
        if (empty($ids)) {
            return collect();
        }

        return Employee::query()->whereIn('id', $ids)->get();
    }

    /**
     * Persist one database notification row per affected employee inside the
     * current transaction. Only the database channel is written here; the
     * queued push job handles broadcast + FCM after commit.
     *
     * @param  Collection<int, Employee>  $employees
     * @param  class-string  $class
     * @param  callable(Employee): array<string, mixed>  $payload
     */
    protected function persistDatabaseNotifications(Collection $employees, string $class, callable $payload): void
    {
        foreach ($employees as $employee) {
            $user = $employee->user;

            if ($user === null) {
                continue;
            }

            // `id` is a UUID primary key. Laravel's normal notify() flow fills it
            // from Str::uuid() in NotificationSender, so we mirror that here since
            // these rows are written directly (inside the transaction).
            $user->notifications()->create([
                'id' => (string) Str::uuid(),
                'type' => $class,
                'data' => $payload($employee),
            ]);
        }
    }

    /**
     * Human-readable per-employee summary, e.g. "3 changes to your roster".
     *
     * @param  Collection<int, array<string, mixed>>  $changes
     */
    protected function summaryFor(Collection $changes): string
    {
        $count = $changes->count();
        $noun = $count === 1 ? 'change' : 'changes';

        return "{$count} {$noun} to your roster for the week.";
    }

    /* ------------------------------------------------------------------ */
    /* Guards                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Whether a mutation id refers to a real persisted shift.
     *
     * `add` mutations carry a client-generated placeholder id (e.g. `temp-...`)
     * that does not exist in the database yet. Only numeric ids may be matched
     * against the `shifts` table — the id column is a bigint, and feeding a
     * non-numeric placeholder into a whereIn()/find() makes PostgreSQL throw
     * "SQLSTATE[22P02]: invalid input syntax for type bigint", which surfaced
     * as a failed preview/apply in the "Review Changes" dialog.
     */
    protected function isRealShiftId(mixed $id): bool
    {
        return is_int($id) || (is_string($id) && $id !== '' && ctype_digit($id));
    }

    /**
     * Reject mutations that reference shifts outside the given roster.
     *
     * @param  array<string, mixed>  $mutations
     */
    protected function assertOwnedShifts(Roster $roster, array $mutations): void
    {
        $shiftIds = collect($mutations)
            ->pluck('id')
            ->filter(fn ($id) => $this->isRealShiftId($id))
            ->unique();

        if ($shiftIds->isEmpty()) {
            return;
        }

        $owned = $roster->shifts()->whereIn('id', $shiftIds)->pluck('id');
        $missing = $shiftIds->diff($owned);

        if ($missing->isNotEmpty()) {
            throw new RuntimeException('One or more shifts do not belong to this roster.');
        }
    }

    /**
     * Enforce optimistic locking.
     */
    protected function assertVersion(Roster $roster, ?int $expectedVersion): void
    {
        if ($expectedVersion === null) {
            return;
        }

        if ((int) $roster->version !== $expectedVersion) {
            throw new RuntimeException(
                "Roster version mismatch: expected {$expectedVersion}, current {$roster->version}.",
            );
        }
    }
}
