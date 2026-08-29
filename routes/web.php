<?php

use App\Http\Controllers\Auth\EmailVerificationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| The frontend is a React Router single-page application. Every non-API
| path returns the SPA shell (`app.blade.php`) and React Router takes over
| client-side routing (/login, /dashboard, /employees, /super-admin, ...).
|
| The negative lookahead keeps API, Sanctum, storage and build asset paths
| from being swallowed by the catch-all so they resolve to their real
| handlers / static files.
|
*/

/*
| Signed email-verification link (opened directly from the user's inbox).
| Must be a stateless web GET so the framework's default `verification.verify`
| named route resolves; the controller validates the signature and redirects
| into the SPA's `/verify-email` screen with a status.
*/
Route::get('email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->middleware('throttle:6,1')
    ->name('verification.verify');

Route::view('/{any?}', 'app')
    ->where('any', '^(?!api|sanctum|storage|build|vendor|email/verify).*$')
    ->name('spa');

