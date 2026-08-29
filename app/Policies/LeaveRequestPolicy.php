<?php

namespace App\Policies;

use App\Models\LeaveRequest;
use App\Models\User;

class LeaveRequestPolicy
{
    /**
     * Perform pre-authorization checks. Super admins can do anything.
     */
    public function before(User $user, string $ability): ?bool
    {
        if ($user->hasRole('super_admin')) {
            return true;
        }

        return null;
    }

    /**
     * Determine whether the user can view any leave requests.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('leave_request.view');
    }


    /**
     * Determine whether the user can view the leave request.
     */
    public function view(User $user, LeaveRequest $leaveRequest): bool
    {
        if (! $user->can('leave_request.view') || ! $this->belongsToCompany($user, $leaveRequest)) {

            return false;
        }

        if ($user->hasRole('employee')) {
            return (int) $leaveRequest->employee?->user_id === (int) $user->id;
        }

        return true;
    }

    /**
     * Determine whether the user can create leave requests.
     */
    public function create(User $user): bool
    {
        return $user->can('leave_request.create');

    }

    /**
     * Determine whether the user can approve the leave request.
     */
    public function approve(User $user, LeaveRequest $leaveRequest): bool
    {
        return $user->can('leave_request.approve') && $this->belongsToCompany($user, $leaveRequest);

    }

    /**
     * Determine whether the user can reject the leave request.
     */
    public function reject(User $user, LeaveRequest $leaveRequest): bool
    {
        return $user->can('leave_request.reject') && $this->belongsToCompany($user, $leaveRequest);

    }

    /**
     * Check that the user belongs to the leave request's company.
     */
    protected function belongsToCompany(User $user, LeaveRequest $leaveRequest): bool
    {
        return (int) $user->company_id === (int) $leaveRequest->company_id;
    }
}
