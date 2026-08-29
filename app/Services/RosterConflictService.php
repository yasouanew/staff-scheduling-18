<?php

namespace App\Services;

use App\Models\LeaveRequest;
use App\Models\Roster;
use App\Models\Shift;
use Illuminate\Support\Collection;

/**
 * Derives roster validation flags (the "conflict overlays" surfaced by the
 * weekly matrix grid) for every shift inside a roster.
 *
 * The flags are transient: they are set directly on the in-memory Shift models
 * so `ShiftResource` can serialise them, and are never persisted. Keeping the
 * calculation here (instead of in the resource or the controller) means the API
 * remains the single source of truth for what counts as a conflict.
 */
class RosterConflictService
{
    /**
     * Weekly ordinary hours before a roster is considered an overtime risk.
     * Mirrors the Australian National Employment Standards (38 ordinary hours).
     */
    public const WEEKLY_ORDINARY_MINUTES = 38 * 60;

    /**
     * A single shift longer than this is flagged regardless of the weekly total.
     */
    public const DAILY_ORDINARY_MINUTES = 10 * 60;

    /**
     * Annotate every shift of the roster with its validation flags.
     *
     * Adds three transient attributes per shift:
     *  - `overtime_risk`   the employee exceeds weekly/daily ordinary hours
     *  - `leave_conflict`  the shift lands on approved (or pending) leave
     *  - `double_booked`   the employee has an overlapping shift that day
     */
    public function annotate(Roster $roster): Roster
    {
        /** @var Collection<int, Shift> $shifts */
        $shifts = $roster->shifts;

        if ($shifts->isEmpty()) {
            return $roster;
        }

        $overtimeEmployeeIds = $this->employeesExceedingOrdinaryHours($shifts);
        $leaveDatesByEmployee = $this->leaveDatesByEmployee($roster, $shifts);
        $doubleBookedShiftIds = $this->overlappingShiftIds($shifts);

        foreach ($shifts as $shift) {
            $employeeId = $shift->employee_id;
            $date = $shift->date?->toDateString();

            $exceedsDaily = $this->payableMinutes($shift) > self::DAILY_ORDINARY_MINUTES;
            $exceedsWeekly = $employeeId !== null && $overtimeEmployeeIds->contains($employeeId);

            $shift->overtime_risk = $exceedsWeekly || $exceedsDaily;

            $shift->leave_conflict = $employeeId !== null
                && $date !== null
                && in_array($date, $leaveDatesByEmployee[$employeeId] ?? [], true);

            $shift->double_booked = in_array($shift->id, $doubleBookedShiftIds, true);
        }

        return $roster;
    }

    /**
     * Employees whose total payable minutes across the roster exceed the
     * weekly ordinary-hours threshold.
     *
     * @param  Collection<int, Shift>  $shifts
     * @return Collection<int, int>
     */
    protected function employeesExceedingOrdinaryHours(Collection $shifts): Collection
    {
        return $shifts
            ->filter(fn (Shift $shift) => $shift->employee_id !== null && $shift->status !== 'cancelled')
            ->groupBy('employee_id')
            ->map(fn (Collection $group) => $group->sum(fn (Shift $shift) => $this->payableMinutes($shift)))
            ->filter(fn (int|float $minutes) => $minutes > self::WEEKLY_ORDINARY_MINUTES)
            ->keys()
            ->map(fn ($id) => (int) $id)
            ->values();
    }

    /**
     * Map of `employee_id => [ISO dates on approved/pending leave]` limited to
     * the roster's own date window.
     *
     * @param  Collection<int, Shift>  $shifts
     * @return array<int, list<string>>
     */
    protected function leaveDatesByEmployee(Roster $roster, Collection $shifts): array
    {
        $employeeIds = $shifts->pluck('employee_id')->filter()->unique()->values();

        if ($employeeIds->isEmpty()) {
            return [];
        }

        $weekStart = $roster->week_start?->toDateString()
            ?? $shifts->min(fn (Shift $shift) => $shift->date?->toDateString());
        $weekEnd = $roster->week_end?->toDateString()
            ?? $shifts->max(fn (Shift $shift) => $shift->date?->toDateString());

        if ($weekStart === null || $weekEnd === null) {
            return [];
        }

        $requests = LeaveRequest::query()
            ->whereIn('employee_id', $employeeIds)
            ->whereIn('status', ['approved', 'pending'])
            ->whereDate('start_date', '<=', $weekEnd)
            ->whereDate('end_date', '>=', $weekStart)
            ->get(['employee_id', 'start_date', 'end_date']);

        $map = [];

        foreach ($requests as $request) {
            if ($request->start_date === null || $request->end_date === null) {
                continue;
            }

            $cursor = $request->start_date->copy();

            while ($cursor->lessThanOrEqualTo($request->end_date)) {
                $map[(int) $request->employee_id][] = $cursor->toDateString();
                $cursor->addDay();
            }
        }

        return array_map(fn (array $dates) => array_values(array_unique($dates)), $map);
    }

    /**
     * Ids of shifts that overlap another shift for the same employee on the
     * same day (a double booking).
     *
     * @param  Collection<int, Shift>  $shifts
     * @return list<int>
     */
    protected function overlappingShiftIds(Collection $shifts): array
    {
        $conflicting = [];

        $candidates = $shifts
            ->filter(fn (Shift $shift) => $shift->employee_id !== null
                && $shift->date !== null
                && $shift->status !== 'cancelled')
            ->groupBy(fn (Shift $shift) => $shift->employee_id.'|'.$shift->date->toDateString());

        foreach ($candidates as $group) {
            /** @var list<Shift> $rows */
            $rows = $group->values()->all();

            for ($i = 0; $i < count($rows); $i++) {
                for ($j = $i + 1; $j < count($rows); $j++) {
                    if ($this->overlaps($rows[$i], $rows[$j])) {
                        $conflicting[] = $rows[$i]->id;
                        $conflicting[] = $rows[$j]->id;
                    }
                }
            }
        }

        return array_values(array_unique($conflicting));
    }

    /**
     * Whether two shifts share any part of the same time window.
     */
    protected function overlaps(Shift $first, Shift $second): bool
    {
        $firstStart = $this->minutes($first->start_time);
        $firstEnd = $this->minutes($first->end_time);
        $secondStart = $this->minutes($second->start_time);
        $secondEnd = $this->minutes($second->end_time);

        if ($firstStart === null || $firstEnd === null || $secondStart === null || $secondEnd === null) {
            return false;
        }

        // Treat an end before the start as an overnight shift.
        $firstEnd = $firstEnd > $firstStart ? $firstEnd : $firstEnd + 1440;
        $secondEnd = $secondEnd > $secondStart ? $secondEnd : $secondEnd + 1440;

        return $firstStart < $secondEnd && $secondStart < $firstEnd;
    }

    /**
     * Payable minutes for a shift (unpaid breaks are deducted).
     */
    protected function payableMinutes(Shift $shift): int
    {
        $start = $this->minutes($shift->start_time);
        $end = $this->minutes($shift->end_time);

        if ($start === null || $end === null) {
            return 0;
        }

        $span = $end >= $start ? $end - $start : $end + 1440 - $start;
        $break = $shift->paid_break ? 0 : max(0, (int) $shift->break_minutes);

        return max(0, $span - $break);
    }

    /**
     * Convert an `HH:mm[:ss]` wall-clock string into minutes past midnight.
     */
    protected function minutes(?string $time): ?int
    {
        if ($time === null || $time === '') {
            return null;
        }

        $parts = explode(':', $time);

        if (count($parts) < 2 || ! is_numeric($parts[0]) || ! is_numeric($parts[1])) {
            return null;
        }

        return ((int) $parts[0]) * 60 + ((int) $parts[1]);
    }
}
