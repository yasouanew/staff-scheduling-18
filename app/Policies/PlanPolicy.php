<?php

namespace App\Policies;

use App\Models\Plan;
use App\Models\User;

class PlanPolicy
{
    /**
     * Super admins can do anything with plans.
     */
    public function before(User $user, string $ability): ?bool
    {
        if ($user->hasRole('super_admin')) {
            return true;
        }

        return null;
    }

    /**
     * Anyone with subscription visibility can view the plan catalogue.
     */
    public function viewAny(User $user): bool
    {
        return $user->can('subscription.view');
    }

    public function view(User $user, Plan $plan): bool
    {
        return $user->can('subscription.view');
    }

    /**
     * Only super admins (handled in before()) manage the plan catalogue.
     */
    public function create(User $user): bool
    {
        return false;
    }

    public function update(User $user, Plan $plan): bool
    {
        return false;
    }

    public function delete(User $user, Plan $plan): bool
    {
        return false;
    }
}
