<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stops a deactivated account from continuing to use a session it already holds.
 *
 * Deactivation happens while the person is very likely still using the product,
 * so checking their status only at sign-in would leave them working normally
 * until their token happened to expire. `EmployeeService` deletes their tokens on
 * deactivation, but this middleware is the backstop that makes the rule hold for
 * any credential issued another way (or restored from a cached client), and it
 * returns a specific code so the apps can tell "signed out" from "locked out".
 */
class EnsureActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Unauthenticated requests are the auth middleware's business, not ours.
        if (! $user) {
            return $next($request);
        }

        if ($user->status === 'active') {
            return $next($request);
        }

        // Drop whatever they authenticated with, so a retry cannot get further
        // than this point either.
        $user->tokens()->delete();

        // `invited` means the invitation was never completed: they must finish
        // setting a password rather than be told to contact an administrator.
        if ($user->status === 'invited') {
            return response()->json([
                'success' => false,
                'message' => 'Finish setting up your account before signing in.',
                'code' => 'account_setup_incomplete',
            ], 401);
        }

        return response()->json([
            'success' => false,
            'message' => 'Your account has been deactivated. Please contact your administrator.',
            'code' => 'account_deactivated',
        ], 401);
    }
}
