<?php

namespace App\Services;

use App\Enums\RosterChangeType;
use App\Jobs\DispatchRosterNotifications;
use App\Models\Roster;
use App\Models\RosterChange;
use App\Models\Shift;
use App\Models\User;
use App\Notifications\RosterChangeNotification;
use App\Notifications\ShiftAssignedNotification;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;



class ShiftService
{
    public function __construct(private RosterChangeDetector $detector) {}
    /**
     * Get a paginated, filterable list of shifts.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return Shift::query()
            ->with(['company', 'branch', 'roster', 'employee', 'position', 'department'])
            ->when(! empty($filters['company_id']), fn ($query) => $query->where('company_id', $filters['company_id']))
            ->when(! empty($filters['branch_id']), fn ($query) => $query->where('branch_id', $filters['branch_id']))
            ->when(! empty($filters['roster_id']), fn ($query) => $query->where('roster_id', $filters['roster_id']))
            ->when(! empty($filters['employee_id']), fn ($query) => $query->where('employee_id', $filters['employee_id']))
            ->when(! empty($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->when(! empty($filters['date_from']), fn ($query) => $query->whereDate('date', '>=', $filters['date_from']))
            ->when(! empty($filters['date_to']), fn ($query) => $query->whereDate('date', '<=', $filters['date_to']))
            ->orderBy('date')
            ->orderBy('start_time')
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * Create a new shift.
     *
     * Enforces the month-grid branch-day rule: one branch may only occupy a
     * calendar day once. If an active (non-cancelled) shift already exists for
     * the same `branch_id` + `date`, the create is rejected with 422 so the
     * caller edits that branch-day instead of opening a duplicate. Shifts with
     * no branch (`null`) live in the "unassigned" bucket and are exempt.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Shift
    {
        return DB::transaction(function () use ($data) {
            $data['status'] ??= 'scheduled';
            $scoped = $this->inheritRosterScope($data);

            $this->assertBranchDayAvailable(
                $scoped['branch_id'] ?? null,
                $scoped['date'] ?? null,
            );

            return Shift::create($scoped)->refresh();
        });
    }

    /**
     * Create a whole branch-day in one atomic batch.
     *
     * The Add-Shift wizard creates N shifts (one per employee) for a single
     * `(branch, date)`. Checking the branch-day rule once per batch — instead
     * of once per shift — lets the initial multi-employee burst succeed while
     * still rejecting a second wizard run on an already-covered day with 422.
     * Either all shifts are created or none are.
     *
     * @param  array<string, mixed>  $common  Shared attributes (roster_id, date, ...).
     * @param  list<array<string, mixed>>  $shifts  Per-shift attributes.
     * @return list<Shift>
     */
    public function createMany(array $common, array $shifts): array
    {
        return DB::transaction(function () use ($common, $shifts) {
            $first = $this->inheritRosterScope(array_merge($common, $shifts[0] ?? []));
            $branchId = $first['branch_id'] ?? null;
            $date = $first['date'] ?? $common['date'] ?? null;

            $this->assertBranchDayAvailable($branchId, $date);

            $created = [];
            foreach ($shifts as $item) {
                $merged = $this->inheritRosterScope(array_merge($common, $item));
                $merged['status'] ??= 'scheduled';
                $created[] = Shift::create($merged)->refresh();
            }

            return $created;
        });
    }

    /**
     * Update an existing shift.
     *
     * Edits *within* the same branch-day (same branch + date, e.g. changing
     * times or assignee while colleagues remain on that day) are always
     * allowed. Moving a shift onto a *different* branch-day that is already
     * covered by another active shift is rejected with 422.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Shift $shift, array $data): Shift
    {
        return DB::transaction(function () use ($shift, $data) {
            // Moving a shift to a roster in another branch must carry the branch
            // across, otherwise the shift would keep pointing at its old one.
            $scoped = $this->inheritRosterScope($data);

            $targetBranchId = $scoped['branch_id'] ?? $shift->branch_id;
            $targetDate = $scoped['date'] ?? $shift->getAttribute('date');

            // `date` casts to Carbon — normalise both sides to Y-m-d for compare.
            $targetDateString = $targetDate instanceof \DateTimeInterface
                ? $targetDate->format('Y-m-d')
                : (is_string($targetDate) ? substr($targetDate, 0, 10) : null);
            $currentDateString = $shift->getAttribute('date') instanceof \DateTimeInterface
                ? $shift->getAttribute('date')->format('Y-m-d')
                : (is_string($shift->getAttribute('date')) ? substr((string) $shift->getAttribute('date'), 0, 10) : null);

            $isSameBranchDay = (int) $targetBranchId === (int) $shift->branch_id
                && $targetDateString !== null
                && $targetDateString === $currentDateString;

            if (! $isSameBranchDay) {
                $this->assertBranchDayAvailable($targetBranchId, $targetDateString, $shift->id);
            }

            $shift->update($scoped);

            return $shift->refresh();
        });
    }

    /**
     * Whether a branch-day cell already has active shifts.
     */
    protected function branchDayCovered(mixed $branchId, mixed $date, ?int $ignoreShiftId = null): bool
    {
        if (empty($branchId) || empty($date)) {
            return false;
        }

        $dateString = $date instanceof \DateTimeInterface
            ? $date->format('Y-m-d')
            : substr((string) $date, 0, 10);

        return Shift::query()
            ->where('branch_id', $branchId)
            ->whereDate('date', $dateString)
            ->where('status', '!=', 'cancelled')
            ->when($ignoreShiftId !== null, fn ($q) => $q->where('id', '!=', $ignoreShiftId))
            ->exists();
    }

    /**
     * Reject with 422 when the target branch-day is already covered.
     *
     * Mirrors the frontend month-grid rule (`coveredBranchIds` disables the
     * branch in Step 1): the correction path is editing that branch-day, not
     * creating a second one on top of it.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    protected function assertBranchDayAvailable(mixed $branchId, mixed $date, ?int $ignoreShiftId = null): void
    {
        if ($this->branchDayCovered($branchId, $date, $ignoreShiftId)) {
            throw ValidationException::withMessages([
                'branch_id' => ['This branch already has shifts on this day. Edit that branch day instead of adding a duplicate.'],
            ]);
        }
    }

    /**
     * Fill in `branch_id` / `company_id` from the shift's parent roster.
     *
     * A shift belongs to a branch only *through* its roster — rosters are stored
     * per branch per ISO week — so callers legitimately submit just a
     * `roster_id`. Denormalising the branch onto the shift keeps the
     * `branch_id` filter and per-branch grouping cheap, but it means the column
     * has to be derived here rather than trusted from the request. Without this
     * every shift persists with a null branch and collapses into a single
     * "unassigned" bucket in the calendar.
     *
     * An explicitly supplied branch is left untouched so callers can still
     * override it.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function inheritRosterScope(array $data): array
    {
        if (empty($data['roster_id'])) {
            return $data;
        }

        if (! empty($data['branch_id']) && ! empty($data['company_id'])) {
            return $data;
        }

        $roster = Roster::query()
            ->select(['id', 'branch_id', 'company_id'])
            ->find($data['roster_id']);

        if ($roster === null) {
            return $data;
        }

        $data['branch_id'] ??= $roster->branch_id;
        $data['company_id'] ??= $roster->company_id;

        return $data;
    }

    /**
     * Delete a shift.
     *
     * Shifts on *published* rosters are never hard-deleted: they are marked
     * `cancelled` instead, recorded in the roster change history and the
     * affected employee is notified — so a post-publication removal can never
     * happen silently.
     */
    public function delete(Shift $shift, ?User $performer = null): bool
    {
        return DB::transaction(function () use ($shift, $performer) {
            $roster = $shift->roster;

            if ($roster !== null && $roster->isPublished()) {
                $oldSnapshot = $this->detector->snapshot($shift);

                $shift->update(['status' => 'cancelled']);

                $record = RosterChange::create([
                    'roster_id' => $roster->id,
                    'shift_id' => $shift->id,
                    'employee_id' => $shift->employee_id,
                    'action' => RosterChangeType::ShiftCancelled->value,
                    'old_data' => $oldSnapshot,
                    'new_data' => $this->detector->snapshot($shift),
                    'performed_by' => $performer?->id,
                ]);

                $roster->increment('version');

                $employee = $shift->employee;
                if ($employee?->user !== null) {
                    $changes = collect([$record]);
                    $notification = new RosterChangeNotification($roster, $changes, '1 change to your roster for the week.');

                    // The `notifications` table uses a UUID primary key with no
                    // default. Direct `->create()` on the morphMany (unlike the
                    // normal `notify()` flow) does not generate the UUID, so it
                    // must be supplied explicitly — otherwise the insert fails
                    // with "null value in column \"id\"" on PostgreSQL.
                    $employee->user->notifications()->create([
                        'id' => (string) Str::uuid(),
                        'type' => RosterChangeNotification::class,
                        'data' => $notification->toArray($employee->user),
                    ]);

                    DB::afterCommit(fn () => dispatch(new DispatchRosterNotifications(
                        rosterId: $roster->id,
                        employeeIds: [$employee->id],
                        changeIds: [$record->id],
                        isPublish: false,
                    )));
                }

                return true;
            }

            return (bool) $shift->delete();
        });
    }

    /**
     * Assign an employee to a shift.
     */
    public function assignEmployee(Shift $shift, int $employeeId): Shift
    {
        return DB::transaction(function () use ($shift, $employeeId) {
            $shift->update(['employee_id' => $employeeId]);

            $shift->refresh()->load('employee.user');

            $this->notifyAssignedEmployee($shift);

            return $shift;
        });
    }

    /**
     * Notify the assigned employee's user account about the new shift.
     */
    protected function notifyAssignedEmployee(Shift $shift): void
    {
        $user = optional($shift->employee)->user;

        if ($user !== null) {
            $user->notify(new ShiftAssignedNotification($shift));
        }
    }
}


