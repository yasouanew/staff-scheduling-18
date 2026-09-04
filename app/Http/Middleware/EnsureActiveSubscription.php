<?php

namespace App\Http\Middleware;

use App\Services\AccessStateService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveSubscription
{
    /**
     * Ensure the authenticated user's company has an active (or trialing)
     * subscription before allowing access to gated features.
     *
     * Delegates to the authoritative {@see AccessStateService} so the decision
     * uses the server clock and the exact same entitlement rule as every other
     * access check — a client changing its device clock cannot affect it.
     */
    protected AccessStateService $access;

    public function __construct(AccessStateService $access)
    {
        $this->access = $access;
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->company_id) {
            return response()->json([
                'success' => false,
                'message' => 'No company associated with this account.',
            ], 403);
        }

        if (! $this->access->hasEntitledSubscription($user->company)) {
            return response()->json([
                'success' => false,
                'message' => 'An active subscription is required to access this feature.',
                'code' => 'SUBSCRIPTION_REQUIRED',
            ], 402);
        }

        return $next($request);
    }
}
