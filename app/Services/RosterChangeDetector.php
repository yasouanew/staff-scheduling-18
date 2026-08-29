<?php

namespace App\Services;

use App\Enums\RosterChangeType;
use App\Models\Shift;

/**
 * Turns an old shift state and an intended new state into one or more
 * normalized change records.
 *
 * Pure / side-effect free: both {@see RosterChangeService::preview()} and
 * {@see RosterChangeService::apply()} feed it the same pairs so the preview is
 * always a faithful reflection of what the apply will record.
 */
class RosterChangeDetector
{
    /**
     * Detect the change(s) between an existing shift (or none) and the new data.
     *
     * @param  array<string, mixed>  $newData
     * @return list<array{action: string, shift_id: int|null, employee_id: int|null, old_data: array<string, mixed>|null, new_data: array<string, mixed>|null}>
     */
    public function detect(?Shift $old, array $newData): array
    {
        $oldSnapshot = $old !== null ? $this->snapshot($old) : null;
        $newSnapshot = $this->snapshotFromData($newData);
        $shiftId = $old?->id ?? (isset($newData['id']) ? (int) $newData['id'] : null);

        // Brand-new shift on a published roster is always "added". The
        // SHIFT_ASSIGNED type is reserved for the second effect of a
        // reassignment (the employee who gains the shift), not for new shifts.
        if ($old === null) {
            return [[
                'action' => RosterChangeType::ShiftAdded->value,
                'shift_id' => $shiftId,
                'employee_id' => $newData['employee_id'] ?? null,
                'old_data' => null,
                'new_data' => $newSnapshot,
            ]];
        }

        $oldEmployee = $old->employee_id;
        $newEmployee = $newData['employee_id'] ?? null;

        // Cancellation.
        if (isset($newData['status']) && $newData['status'] === 'cancelled' && $old->status !== 'cancelled') {
            return [[
                'action' => RosterChangeType::ShiftCancelled->value,
                'shift_id' => $shiftId,
                'employee_id' => $oldEmployee,
                'old_data' => $oldSnapshot,
                'new_data' => $newSnapshot,
            ]];
        }

        // Location / branch change.
        if (
            array_key_exists('branch_id', $newData)
            && (int) $newData['branch_id'] !== (int) $old->branch_id
        ) {
            return [[
                'action' => RosterChangeType::ShiftLocationChanged->value,
                'shift_id' => $shiftId,
                'employee_id' => $oldEmployee,
                'old_data' => $oldSnapshot,
                'new_data' => $newSnapshot,
            ]];
        }

        // Reassignment — two effects: the previous employee is removed, the
        // new employee is assigned.
        if ($newEmployee !== null && (int) $newEmployee !== (int) $oldEmployee) {
            return [
                [
                    'action' => RosterChangeType::ShiftReassigned->value,
                    'shift_id' => $shiftId,
                    'employee_id' => $oldEmployee,
                    'old_data' => $oldSnapshot,
                    'new_data' => $newSnapshot,
                ],
                [
                    'action' => RosterChangeType::ShiftAssigned->value,
                    'shift_id' => $shiftId,
                    'employee_id' => $newEmployee,
                    'old_data' => null,
                    'new_data' => $newSnapshot,
                ],
            ];
        }

        // Employee removed (left unassigned).
        if ($oldEmployee !== null && $newEmployee === null) {
            return [[
                'action' => RosterChangeType::ShiftReassigned->value,
                'shift_id' => $shiftId,
                'employee_id' => $oldEmployee,
                'old_data' => $oldSnapshot,
                'new_data' => $newSnapshot,
            ]];
        }

        // Plain update — affected employee is the one on the shift.
        return [[
            'action' => RosterChangeType::ShiftUpdated->value,
            'shift_id' => $shiftId,
            'employee_id' => $oldEmployee ?? $newEmployee,
            'old_data' => $oldSnapshot,
            'new_data' => $newSnapshot,
        ]];
    }

    /**
     * Canonical snapshot of a persisted shift.
     *
     * @return array<string, mixed>
     */
    public function snapshot(Shift $shift): array
    {
        return [
            'id' => $shift->id,
            'branch_id' => $shift->branch_id,
            'employee_id' => $shift->employee_id,
            'position_id' => $shift->position_id,
            'department_id' => $shift->department_id,
            'date' => optional($shift->date)->toDateString(),
            'start_time' => $shift->start_time,
            'end_time' => $shift->end_time,
            'break_minutes' => $shift->break_minutes,
            'paid_break' => $shift->paid_break,
            'required_staff' => $shift->required_staff,
            'status' => $shift->status,
            'notes' => $shift->notes,
        ];
    }

    /**
     * Canonical snapshot from raw write data.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function snapshotFromData(array $data): array
    {
        return [
            'id' => $data['id'] ?? null,
            'branch_id' => $data['branch_id'] ?? null,
            'employee_id' => $data['employee_id'] ?? null,
            'position_id' => $data['position_id'] ?? null,
            'department_id' => $data['department_id'] ?? null,
            'date' => $data['date'] ?? null,
            'start_time' => $data['start_time'] ?? null,
            'end_time' => $data['end_time'] ?? null,
            'break_minutes' => $data['break_minutes'] ?? null,
            'paid_break' => $data['paid_break'] ?? null,
            'required_staff' => $data['required_staff'] ?? null,
            'status' => $data['status'] ?? 'scheduled',
            'notes' => $data['notes'] ?? null,
        ];
    }
}
