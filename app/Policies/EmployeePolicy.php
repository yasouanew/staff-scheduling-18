<?php

namespace App\Policies;

use App\Models\Employee;
use App\Models\User;

class EmployeePolicy
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
     * Determine whether the user can view any employees.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('employee.view');
    }

    /**
     * Determine whether the user can view the employee.
     */
    public function view(User $user, Employee $employee): bool
    {
        return $user->can('employee.view') && $this->belongsToCompany($user, $employee);
    }

    /**
     * Determine whether the user can create employees.
     */
    public function create(User $user): bool
    {
        return $user->can('employee.create');
    }

    /**
     * Determine whether the user can update the employee.
     */
    public function update(User $user, Employee $employee): bool
    {
        return $user->can('employee.edit') && $this->belongsToCompany($user, $employee);
    }

    /**
     * Determine whether the user can transfer the employee to another branch.
     */
    public function transfer(User $user, Employee $employee): bool
    {
        return $user->can('employee.edit') && $this->belongsToCompany($user, $employee);
    }

    /**
     * Determine whether the user can delete the employee.
     */
    public function delete(User $user, Employee $employee): bool
    {
        return $user->can('employee.delete') && $this->belongsToCompany($user, $employee);
    }

    /**
     * Check that the user belongs to the employee's company.
     */
    protected function belongsToCompany(User $user, Employee $employee): bool
    {
        return (int) $user->company_id === (int) $employee->company_id;
    }
}
