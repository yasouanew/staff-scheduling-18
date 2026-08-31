<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveSubscription
{
    /**
     * Ensure the authenticated user's company has an active (or trialing)
     * subscription before allowing access to gated features.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->company_id) {
            return response()->json([
                'success' => false,
                'message' => 'No company associated with this account.',
            ], 403);
        }

        $hasActive = $user->company
            ->subscriptions()
            ->where(function ($query) {
                $query->where('status', 'active')
                    ->where(function ($period) {
                        $period->whereNull('ends_at')->orWhere('ends_at', '>', now());
                    });
            })
            ->orWhere(function ($query) {
                $query->where('status', 'trialing')
                    ->where(function ($trial) {
                        $trial->whereNull('trial_ends_at')->orWhere('trial_ends_at', '>', now());
                    });
            })
            ->orWhere(function ($query) {
                $query->where('status', 'grace_period')
                    ->where(function ($grace) {
                        $grace->whereNull('grace_ends_at')->orWhere('grace_ends_at', '>', now());
                    });
            })
            ->exists();

        if (! $hasActive) {
            return response()->json([
                'success' => false,
                'message' => 'An active subscription is required to access this feature.',
                'code' => 'SUBSCRIPTION_REQUIRED',
            ], 402);
        }

        return $next($request);
    }
}
