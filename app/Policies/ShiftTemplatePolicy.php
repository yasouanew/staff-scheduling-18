<?php

namespace App\Policies;

use App\Models\ShiftTemplate;
use App\Models\User;

class ShiftTemplatePolicy
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
     * Determine whether the user can view any shift templates.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('shift_template.view');
    }

    /**
     * Determine whether the user can view the shift template.
     */
    public function view(User $user, ShiftTemplate $shiftTemplate): bool
    {
        return $user->can('shift_template.view') && $this->belongsToCompany($user, $shiftTemplate);
    }

    /**
     * Determine whether the user can create shift templates.
     */
    public function create(User $user): bool
    {
        return $user->can('shift_template.create');
    }

    /**
     * Determine whether the user can update the shift template.
     */
    public function update(User $user, ShiftTemplate $shiftTemplate): bool
    {
        return $user->can('shift_template.edit') && $this->belongsToCompany($user, $shiftTemplate);
    }

    /**
     * Determine whether the user can delete the shift template.
     */
    public function delete(User $user, ShiftTemplate $shiftTemplate): bool
    {
        return $user->can('shift_template.delete') && $this->belongsToCompany($user, $shiftTemplate);
    }

    /**
     * Check that the user belongs to the shift template's company.
     */
    protected function belongsToCompany(User $user, ShiftTemplate $shiftTemplate): bool
    {
        return (int) $user->company_id === (int) $shiftTemplate->company_id;
    }
}
