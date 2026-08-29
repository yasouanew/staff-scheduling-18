<?php

namespace App\Policies;

use App\Models\Company;
use App\Models\User;

class CompanyPolicy
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
     * Determine whether the user can view any companies.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('company.view');
    }

    /**
     * Determine whether the user can view the company.
     */
    public function view(User $user, Company $company): bool
    {
        return $user->can('company.view') && $this->belongsToCompany($user, $company);
    }

    /**
     * Determine whether the user can create companies.
     *
     * Only super admins (handled in before()) may create companies.
     */
    public function create(User $user): bool
    {
        return $user->can('company.create');
    }

    /**
     * Determine whether the user can update the company.
     */
    public function update(User $user, Company $company): bool
    {
        return $user->can('company.edit') && $this->belongsToCompany($user, $company);
    }

    /**
     * Determine whether the user can delete the company.
     *
     * Only super admins (handled in before()) may delete companies.
     */
    public function delete(User $user, Company $company): bool
    {
        return $user->can('company.delete');
    }

    /**
     * Check that the user belongs to the given company.
     */
    protected function belongsToCompany(User $user, Company $company): bool
    {
        return (int) $user->company_id === (int) $company->id;
    }
}
