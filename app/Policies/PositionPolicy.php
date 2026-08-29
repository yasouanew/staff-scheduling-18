<?php

namespace App\Policies;

use App\Models\Position;
use App\Models\User;

class PositionPolicy
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
     * Determine whether the user can view any positions.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('position.view');
    }

    /**
     * Determine whether the user can view the position.
     */
    public function view(User $user, Position $position): bool
    {
        return $user->can('position.view') && $this->belongsToCompany($user, $position);
    }

    /**
     * Determine whether the user can create positions.
     */
    public function create(User $user): bool
    {
        return $user->can('position.create');
    }

    /**
     * Determine whether the user can update the position.
     */
    public function update(User $user, Position $position): bool
    {
        return $user->can('position.edit') && $this->belongsToCompany($user, $position);
    }

    /**
     * Determine whether the user can delete the position.
     */
    public function delete(User $user, Position $position): bool
    {
        return $user->can('position.delete') && $this->belongsToCompany($user, $position);
    }

    /**
     * Check that the user belongs to the position's company.
     */
    protected function belongsToCompany(User $user, Position $position): bool
    {
        return (int) $user->company_id === (int) $position->company_id;
    }
}
