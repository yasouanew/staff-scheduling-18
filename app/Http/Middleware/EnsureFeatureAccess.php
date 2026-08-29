<?php

namespace App\Http\Middleware;

use App\Enums\Feature;
use App\Services\EntitlementService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate a route (or route group) behind a plan feature.
 *
 * Usage:
 *   Route::middleware('feature:advanced_reporting')->group(...);
 *   Route::middleware('feature:shift_swap,123')->get(...); // branch-aware
 *
 * Super admins bypass the check, matching the other account/subscription
 * middleware in this application.
 */
class EnsureFeatureAccess
{
    public function __construct(private EntitlementService $entitlements) {}

    public function handle(Request $request, Closure $next, string $feature, ?string $branchParam = null): Response
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

        $featureEnum = Feature::tryFrom($feature);

        if (! $featureEnum) {
            return response()->json([
                'success' => false,
                'message' => 'Unknown feature requested.',
            ], 422);
        }

        $branch = null;

        if ($featureEnum->isBranchScoped() && $branchParam) {
            $branch = $company->branches()->find($branchParam);
        }

        if (! $this->entitlements->allows($company, $featureEnum, $branch)) {
            return response()->json([
                'success' => false,
                'message' => 'Your current plan does not include access to this feature.',
                'code' => 'feature_not_available',
            ], 403);
        }

        return $next($request);
    }
}
