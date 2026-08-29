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
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Shift
    {
        return DB::transaction(function () use ($data) {
            $data['status'] ??= 'scheduled';

            return Shift::create($this->inheritRosterScope($data))->refresh();
        });
    }

    /**
     * Update an existing shift.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Shift $shift, array $data): Shift
    {
        return DB::transaction(function () use ($shift, $data) {
            // Moving a shift to a roster in another branch must carry the branch
            // across, otherwise the shift would keep pointing at its old one.
            $shift->update($this->inheritRosterScope($data));

            return $shift->refresh();
        });
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


