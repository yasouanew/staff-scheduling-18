<?php

namespace App\Policies;

use App\Models\Roster;
use App\Models\User;

class RosterPolicy
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
     * Determine whether the user can view any rosters.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('roster.view');
    }

    /**
     * Determine whether the user can view the roster.
     */
    public function view(User $user, Roster $roster): bool
    {
        return $user->can('roster.view') && $this->belongsToCompany($user, $roster);
    }

    /**
     * Determine whether the user can create rosters.
     */
    public function create(User $user): bool
    {
        return $user->can('roster.create');
    }

    /**
     * Determine whether the user can update the roster.
     */
    public function update(User $user, Roster $roster): bool
    {
        return $user->can('roster.edit') && $this->belongsToCompany($user, $roster);
    }

    /**
     * Determine whether the user can delete the roster.
     */
    public function delete(User $user, Roster $roster): bool
    {
        return $user->can('roster.delete') && $this->belongsToCompany($user, $roster);
    }

    /**
     * Determine whether the user can publish the roster.
     */
    public function publish(User $user, Roster $roster): bool
    {
        return $user->can('roster.publish') && $this->belongsToCompany($user, $roster);
    }

    /**
     * Check that the user belongs to the roster's company.
     */
    protected function belongsToCompany(User $user, Roster $roster): bool
    {
        return (int) $user->company_id === (int) $roster->company_id;
    }
}
