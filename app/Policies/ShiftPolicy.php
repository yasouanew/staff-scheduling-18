<?php

namespace App\Policies;

use App\Models\Shift;
use App\Models\User;

class ShiftPolicy
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
     * Determine whether the user can view any shifts.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('shift.view');
    }

    /**
     * Determine whether the user can view the shift.
     */
    public function view(User $user, Shift $shift): bool
    {
        return $user->can('shift.view') && $this->belongsToCompany($user, $shift);
    }

    /**
     * Determine whether the user can create shifts.
     */
    public function create(User $user): bool
    {
        return $user->can('shift.create');
    }

    /**
     * Determine whether the user can update the shift.
     */
    public function update(User $user, Shift $shift): bool
    {
        return $user->can('shift.edit') && $this->belongsToCompany($user, $shift);
    }

    /**
     * Determine whether the user can delete the shift.
     */
    public function delete(User $user, Shift $shift): bool
    {
        return $user->can('shift.delete') && $this->belongsToCompany($user, $shift);
    }

    /**
     * Check that the user belongs to the shift's company.
     */
    protected function belongsToCompany(User $user, Shift $shift): bool
    {
        return (int) $user->company_id === (int) $shift->company_id;
    }
}
