<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))

    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
        apiPrefix: 'api',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);

        // Ensure API requests always receive JSON responses.
        $middleware->statefulApi();

        // The SPA owns the `/login` screen client-side, so there is no
        // server-side route named "login". Point the auth middleware at the
        // SPA path directly, otherwise it throws "Route [login] not defined"
        // while building the AuthenticationException for guest requests.
        $middleware->redirectGuestsTo('/login');


        // Route middleware aliases.
        $middleware->alias([
            'subscription.active' => \App\Http\Middleware\EnsureActiveSubscription::class,
            'company.access' => \App\Http\Middleware\CheckCompanyAccess::class,
            'account.active' => \App\Http\Middleware\EnsureActiveAccount::class,
            'feature' => \App\Http\Middleware\EnsureFeatureAccess::class,
        ]);

    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // The frontend is a React Router SPA, so there is no server-side
        // `login` named route for Laravel to redirect guests to. Without this,
        // an unauthenticated API request that does not send an
        // `Accept: application/json` header would fail with a 500
        // ("Route [login] not defined") instead of a proper 401.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request, Throwable $e) => $request->is('api/*') || $request->expectsJson()
        );

        // Branch capacity / branch limit violations translate into a structured
        // error the SPA can render without relying on fragile string matching:
        //
        //     {
        //         "success": false,
        //         "message": "This branch has reached its employee capacity.",
        //         "code": "EMPLOYEE_CAPACITY_REACHED",
        //         "errors": { "used": 10, "capacity": 10, "remaining": 0 }
        //     }
        $exceptions->render(function (\App\Exceptions\BranchCapacityException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
                'errors' => $e->context,
            ], $e->getCode() ?: 422);
        });

        // Subscription plan-change (upgrade/downgrade) violations translate into
        // the same structured error shape as branch capacity errors:
        //
        //     {
        //         "success": false,
        //         "message": "Your business currently uses more active branches ...",
        //         "code": "DOWNGRADE_BRANCH_LIMIT_EXCEEDED",
        //         "errors": { "used": 6, "limit": 3 }
        //     }
        $exceptions->render(function (\App\Exceptions\BillingLimitException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
                'errors' => $e->context,
            ], $e->getCode() ?: 422);
        });
    })->create();

