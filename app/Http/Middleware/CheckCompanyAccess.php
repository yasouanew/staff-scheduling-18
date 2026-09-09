<?php

namespace App\Http\Middleware;

use App\Services\AccessStateService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckCompanyAccess
{
    /**
     * Allow operational requests only when the company has a valid trial or an
     * active subscription. Billing, session, and webhook routes are deliberately
     * kept outside this middleware so a locked company can reactivate itself.
     *
     * The decision is delegated to the authoritative {@see AccessStateService},
     * which compares every expiry boundary against the server clock — a client
     * changing its device clock/date can never re-open (or extend) access.
     */
    protected AccessStateService $access;

    public function __construct(AccessStateService $access)
    {
        $this->access = $access;
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'Authentication is required.',
            ], 401);
        }

        if ($user->hasRole('super_admin') || $user->role === 'super_admin') {
            return $next($request);
        }

        $company = $user->company;

        if (! $company) {
            return response()->json([
                'success' => false,
                'message' => 'No company is associated with this account.',
            ], 403);
        }

        if ($this->access->hasAccess($company)) {
            if ($company->locked_at !== null) {
                $company->forceFill(['locked_at' => null])->save();
            }

            return $next($request);
        }

        if ($company->locked_at === null) {
            $company->forceFill(['locked_at' => now()])->save();
        }

        // Allow access to employee management and related directory metadata routes
        // so that companies in account-locked mode can still manage their employees.
        if ($this->isEmployeeManagementRoute($request)) {
            return $next($request);
        }

        return response()->json([
            'success' => false,
            'message' => 'Your trial has ended. Activate a subscription to continue using Rosterly.',
            'code' => 'SUBSCRIPTION_REQUIRED',
            'data' => $this->access->toArray($company) + [
                'is_locked' => true,
                'locked_at' => $company->locked_at?->toIso8601String(),
            ],
        ], 423);
    }

    /**
     * Determine whether the request targets employee management or supporting
     * directory lookups (branches, departments, positions) that must remain
     * accessible when a company is locked.
     */
    protected function isEmployeeManagementRoute(Request $request): bool
    {
        if ($request->is('api/v1/employees*')) {
            return true;
        }

        if ($request->isMethod('GET') && (
            $request->is('api/v1/branches*') ||
            $request->is('api/v1/departments*') ||
            $request->is('api/v1/positions*')
        )) {
            return true;
        }

        return false;
    }
}
