<?php

namespace App\Services;

use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use App\Notifications\LeaveRequestStatusNotification;
use App\Notifications\LeaveRequestSubmittedNotification;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;


class LeaveRequestService
{
    /**
     * Get a paginated, filterable list of leave requests.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return LeaveRequest::query()
            ->with(['company', 'employee', 'leaveType', 'approver', 'rejecter'])
            ->when(! empty($filters['company_id']), fn ($query) => $query->where('company_id', $filters['company_id']))
            ->when(! empty($filters['employee_id']), fn ($query) => $query->where('employee_id', $filters['employee_id']))
            ->when(! empty($filters['leave_type_id']), fn ($query) => $query->where('leave_type_id', $filters['leave_type_id']))
            ->when(! empty($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->when(! empty($filters['date_from']), fn ($query) => $query->whereDate('start_date', '>=', $filters['date_from']))
            ->when(! empty($filters['date_to']), fn ($query) => $query->whereDate('end_date', '<=', $filters['date_to']))
            ->orderByDesc('start_date')
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * Create a new leave request.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data, ?User $creator = null): LeaveRequest
    {
        return DB::transaction(function () use ($data, $creator) {
            $data['status'] ??= 'pending';
            $data['start_session'] ??= 'full_day';
            $data['end_session'] ??= 'full_day';
            $data['total_days'] ??= $this->calculateTotalDays($data);
            $this->ensureAllowanceAvailable($data);

            if ($creator !== null) {
                $data['created_by'] = $creator->id;
            }

            $leaveRequest = LeaveRequest::create($data)->refresh();

            $this->notifyAdmins($leaveRequest);

            return $leaveRequest;
        });
    }


    /**
     * Approve a pending leave request.
     */
    public function approve(LeaveRequest $leaveRequest, User $approver, ?string $adminNotes = null): LeaveRequest
    {
        return DB::transaction(function () use ($leaveRequest, $approver, $adminNotes) {
            $leaveRequest->update([
                'status' => 'approved',
                'approved_by' => $approver->id,
                'approved_at' => now(),
                'rejected_by' => null,
                'rejected_at' => null,
                'rejection_reason' => null,
                'admin_notes' => $adminNotes ?? $leaveRequest->admin_notes,
                'updated_by' => $approver->id,
            ]);

            $leaveRequest->refresh();

            $this->notifyEmployee($leaveRequest);

            return $leaveRequest;
        });
    }


    /**
     * Reject a pending leave request.
     */
    public function reject(LeaveRequest $leaveRequest, User $rejecter, string $reason): LeaveRequest
    {
        return DB::transaction(function () use ($leaveRequest, $rejecter, $reason) {
            $leaveRequest->update([
                'status' => 'rejected',
                'rejected_by' => $rejecter->id,
                'rejected_at' => now(),
                'rejection_reason' => $reason,
                'approved_by' => null,
                'approved_at' => null,
                'updated_by' => $rejecter->id,
            ]);

            $leaveRequest->refresh();

            $this->notifyEmployee($leaveRequest);

            return $leaveRequest;
        });
    }


    /**
     * Reject a request that exceeds the employee's configured annual leave allowance.
     * Pending requests are included so the same balance cannot be requested twice while
     * approval is still outstanding. Leave types without an allowance remain unlimited.
     *
     * @param  array<string, mixed>  $data
     */
    protected function ensureAllowanceAvailable(array $data): void
    {
        $leaveType = LeaveType::query()->find($data['leave_type_id'] ?? null);

        if ($leaveType === null || $leaveType->allowance_days === null) {
            return;
        }

        $requestDays = (float) ($data['total_days'] ?? 0);
        $leaveYear = Carbon::parse($data['start_date'])->year;
        $committedDays = (float) LeaveRequest::query()
            ->where('employee_id', $data['employee_id'])
            ->where('leave_type_id', $leaveType->id)
            ->whereIn('status', ['pending', 'approved'])
            ->whereYear('start_date', $leaveYear)
            ->sum('total_days');

        if ($committedDays + $requestDays > (float) $leaveType->allowance_days) {
            throw ValidationException::withMessages([
                'leave_type_id' => ['This request exceeds the employee’s available leave allowance.'],
            ]);
        }
    }

    /**
     * Calculate the inclusive total number of days between start and end date.
     *
     * @param  array<string, mixed>  $data
     */
    protected function calculateTotalDays(array $data): float
    {
        $start = Carbon::parse($data['start_date'])->startOfDay();
        $end = Carbon::parse($data['end_date'])->startOfDay();

        $days = $start->diffInDays($end) + 1;

        // Deduct half a day for each half-day session at the boundaries.
        if (($data['start_session'] ?? 'full_day') !== 'full_day') {
            $days -= 0.5;
        }

        if (($data['end_session'] ?? 'full_day') !== 'full_day' && $start->notEqualTo($end)) {
            $days -= 0.5;
        }

        return (float) max($days, 0.5);
    }

    /**
     * Notify the requesting employee's user account of a status change.
     */
    protected function notifyEmployee(LeaveRequest $leaveRequest): void
    {
        $user = optional($leaveRequest->employee)->user;

        if ($user !== null) {
            $user->notify(new LeaveRequestStatusNotification($leaveRequest));
        }
    }

    /**
     * Notify company administrators/managers that a new request needs review.
     */
    protected function notifyAdmins(LeaveRequest $leaveRequest): void
    {
        $admins = User::query()
            ->where('company_id', $leaveRequest->company_id)
            ->whereIn('role', ['admin', 'manager', 'owner'])
            ->get();

        if ($admins->isNotEmpty()) {
            Notification::send($admins, new LeaveRequestSubmittedNotification($leaveRequest));
        }
    }
}


