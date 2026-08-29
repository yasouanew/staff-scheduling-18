<?php

namespace App\Policies;

use App\Models\Company;
use App\Models\Subscription;
use App\Models\User;

class SubscriptionPolicy
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
     * Determine whether the user can view the company's subscriptions.
     */
    public function viewAny(User $user, Company $company): bool
    {
        return $user->can('subscription.view') && $this->belongsToCompany($user, $company);
    }

    /**
     * Determine whether the user can view the subscription.
     */
    public function view(User $user, Subscription $subscription, Company $company): bool
    {
        return $user->can('subscription.view')
            && $this->belongsToCompany($user, $company)
            && (int) $subscription->company_id === (int) $company->id;
    }

    /**
     * Determine whether the user can create a subscription for the company.
     */
    public function create(User $user, Company $company): bool
    {
        return $user->can('subscription.manage') && $this->belongsToCompany($user, $company);
    }

    /**
     * Determine whether the user can update / cancel / resume / swap the subscription.
     */
    public function update(User $user, Subscription $subscription, Company $company): bool
    {
        return $user->can('subscription.manage')
            && $this->belongsToCompany($user, $company)
            && (int) $subscription->company_id === (int) $company->id;
    }

    /**
     * Determine whether the user can refund payments for the subscription.
     */
    public function refund(User $user, Subscription $subscription, Company $company): bool
    {
        return $user->can('subscription.refund')
            && $this->belongsToCompany($user, $company)
            && (int) $subscription->company_id === (int) $company->id;
    }

    /**
     * Check that the user belongs to the given company.
     */
    protected function belongsToCompany(User $user, Company $company): bool
    {
        return (int) $user->company_id === (int) $company->id;
    }
}
