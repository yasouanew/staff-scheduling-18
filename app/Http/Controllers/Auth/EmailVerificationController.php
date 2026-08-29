<?php

namespace App\Http\Controllers\Auth;

use App\Domains\Auth\Actions\VerifyEmailAction;
use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class EmailVerificationController extends Controller
{
    public function __construct(private VerifyEmailAction $verifyEmailAction) {}

    /**
     * Handle a signed email-verification link opened from the user's inbox.
     *
     * The link is a browser GET (not an XHR), so rather than returning JSON we
     * verify the email and redirect into the React SPA's `/verify-email` screen
     * with a `status` query param the client can render a friendly result for.
     *
     * We validate the URL signature manually (instead of the `signed`
     * middleware) so an expired or tampered link redirects to a friendly SPA
     * screen rather than aborting with a raw 403 page.
     */
    public function verify(Request $request, int|string $id, string $hash): RedirectResponse
    {
        $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');

        $status = $request->hasValidSignature()
            ? $this->verifyEmailAction->execute($id, $hash)
            : VerifyEmailAction::RESULT_INVALID;

        return redirect()->away($frontendUrl.'/verify-email?'.http_build_query([
            'status' => $status,
        ]));
    }
}
