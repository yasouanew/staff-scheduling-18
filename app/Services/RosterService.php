<?php

namespace App\Services;

use App\Models\Roster;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class RosterService
{
    /**
     * Get a paginated, filterable list of rosters.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return Roster::query()
            ->with(['company', 'branch', 'publisher'])
            ->withCount('shifts')
            ->when(! empty($filters['company_id']), fn ($query) => $query->where('company_id', $filters['company_id']))
            ->when(! empty($filters['branch_id']), fn ($query) => $query->where('branch_id', $filters['branch_id']))
            ->when(! empty($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->when(! empty($filters['week_start']), fn ($query) => $query->whereDate('week_start', '>=', $filters['week_start']))
            ->when(! empty($filters['week_end']), fn ($query) => $query->whereDate('week_end', '<=', $filters['week_end']))
            ->orderByDesc('week_start')
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * Create a new roster.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Roster
    {
        return DB::transaction(function () use ($data) {
            $data['status'] ??= 'draft';

            return Roster::create($data)->refresh();
        });
    }


    /**
     * Update an existing roster.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Roster $roster, array $data): Roster
    {
        return DB::transaction(function () use ($roster, $data) {
            $roster->update($data);

            return $roster->refresh();
        });
    }

    /**
     * Delete a roster (and its shifts via cascade).
     */
    public function delete(Roster $roster): bool
    {
        return DB::transaction(fn () => (bool) $roster->delete());
    }

    /**
     * Create a new roster for the given week by copying the shifts of the
     * previous (or an explicitly provided source) roster.
     *
     * Shift dates are shifted forward by the number of days between the source
     * week and the new week so the schedule lines up day-for-day.
     *
     * @param  array<string, mixed>  $data
     */
    public function copyPreviousWeek(array $data): Roster
    {
        $companyId = $data['company_id'];
        $branchId = $data['branch_id'] ?? null;
        $newWeekStart = Carbon::parse($data['week_start'])->startOfDay();

        $source = $this->resolveSourceRoster($data, $companyId, $branchId, $newWeekStart);

        abort_if($source === null, 422, 'No previous roster was found to copy from.');

        return DB::transaction(function () use ($source, $companyId, $branchId, $newWeekStart) {
            $sourceWeekStart = Carbon::parse($source->week_start)->startOfDay();
            $dayOffset = $sourceWeekStart->diffInDays($newWeekStart, false);

            $newWeekEnd = (clone $newWeekStart)->addDays(
                $sourceWeekStart->diffInDays(Carbon::parse($source->week_end)->startOfDay())
            );

            $roster = Roster::create([
                'company_id' => $companyId,
                'branch_id' => $branchId,
                'week_start' => $newWeekStart->toDateString(),
                'week_end' => $newWeekEnd->toDateString(),
                'status' => 'draft',
            ]);

            foreach ($source->shifts as $shift) {
                $roster->shifts()->create([
                    'company_id' => $roster->company_id,
                    'branch_id' => $shift->branch_id,
                    'employee_id' => $shift->employee_id,
                    'position_id' => $shift->position_id,
                    'department_id' => $shift->department_id,
                    'date' => Carbon::parse($shift->date)->addDays($dayOffset)->toDateString(),
                    'start_time' => $shift->start_time,
                    'end_time' => $shift->end_time,
                    'break_minutes' => $shift->break_minutes,
                    'paid_break' => $shift->paid_break,
                    'status' => 'scheduled',
                    'notes' => $shift->notes,
                ]);
            }

            return $roster->load(['company', 'branch', 'shifts']);
        });
    }

    /**
     * Publish a roster, marking it and recording who published it.
     */
    public function publish(Roster $roster, User $publisher): Roster
    {
        return DB::transaction(function () use ($roster, $publisher) {
            $roster->update([
                'status' => 'published',
                'published_at' => now(),
                'published_by' => $publisher->id,
            ]);

            return $roster->refresh();
        });
    }

    /**
     * Locate the roster to copy shifts from.
     *
     * @param  array<string, mixed>  $data
     */
    protected function resolveSourceRoster(array $data, int $companyId, ?int $branchId, Carbon $newWeekStart): ?Roster
    {
        $query = Roster::query()
            ->with('shifts')
            ->where('company_id', $companyId)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId));

        if (! empty($data['source_roster_id'])) {
            return $query->find($data['source_roster_id']);
        }

        // Otherwise grab the most recent roster starting before the new week.
        return $query
            ->whereDate('week_start', '<', $newWeekStart->toDateString())
            ->orderByDesc('week_start')
            ->first();
    }
}
