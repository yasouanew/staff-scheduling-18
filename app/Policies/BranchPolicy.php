<?php

namespace App\Policies;

use App\Models\Branch;
use App\Models\User;

class BranchPolicy
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
     * Determine whether the user can view any branches.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('branch.view');
    }

    /**
     * Determine whether the user can view the branch.
     */
    public function view(User $user, Branch $branch): bool
    {
        return $user->can('branch.view') && $this->belongsToCompany($user, $branch);
    }

    /**
     * Determine whether the user can create branches.
     */
    public function create(User $user): bool
    {
        return $user->can('branch.create');
    }

    /**
     * Determine whether the user can update the branch.
     */
    public function update(User $user, Branch $branch): bool
    {
        return $user->can('branch.edit') && $this->belongsToCompany($user, $branch);
    }

    /**
     * Determine whether the user can delete the branch.
     */
    public function delete(User $user, Branch $branch): bool
    {
        return $user->can('branch.delete') && $this->belongsToCompany($user, $branch);
    }

    /**
     * Determine whether the user can activate a branch under the business
     * subscription.
     */
    public function activate(User $user, Branch $branch): bool
    {
        return $user->can('branch.edit') && $this->belongsToCompany($user, $branch);
    }

    /**
     * Determine whether the user can deactivate a branch under the business
     * subscription.
     */
    public function deactivate(User $user, Branch $branch): bool
    {
        return $user->can('branch.edit') && $this->belongsToCompany($user, $branch);
    }

    /**
     * Determine whether the user can manage a branch's employee capacity.
     */
    public function manageCapacity(User $user, Branch $branch): bool
    {
        return $user->can('branch.edit') && $this->belongsToCompany($user, $branch);
    }

    /**
     * Check that the user belongs to the branch's company.
     */
    protected function belongsToCompany(User $user, Branch $branch): bool
    {
        return (int) $user->company_id === (int) $branch->company_id;
    }
}
