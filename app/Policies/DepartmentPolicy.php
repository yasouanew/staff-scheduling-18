<?php

namespace App\Policies;

use App\Models\Department;
use App\Models\User;

class DepartmentPolicy
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
     * Determine whether the user can view any departments.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('department.view');
    }

    /**
     * Determine whether the user can view the department.
     */
    public function view(User $user, Department $department): bool
    {
        return $user->can('department.view') && $this->belongsToCompany($user, $department);
    }

    /**
     * Determine whether the user can create departments.
     */
    public function create(User $user): bool
    {
        return $user->can('department.create');
    }

    /**
     * Determine whether the user can update the department.
     */
    public function update(User $user, Department $department): bool
    {
        return $user->can('department.edit') && $this->belongsToCompany($user, $department);
    }

    /**
     * Determine whether the user can delete the department.
     */
    public function delete(User $user, Department $department): bool
    {
        return $user->can('department.delete') && $this->belongsToCompany($user, $department);
    }

    /**
     * Check that the user belongs to the department's company.
     */
    protected function belongsToCompany(User $user, Department $department): bool
    {
        return (int) $user->company_id === (int) $department->company_id;
    }
}
