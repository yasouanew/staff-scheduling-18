<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Invitation\AcceptInvitationRequest;
use App\Http\Requests\Invitation\CompleteMobileSetupRequest;
use App\Http\Requests\Invitation\RequestMobileCodeRequest;
use App\Http\Requests\Invitation\VerifyMobileCodeRequest;
use App\Http\Resources\UserResource;
use App\Services\InvitationService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public (guest) invitation endpoints.
 *
 * Two journeys are served here:
 *
 *  - Web: `GET show` previews the invitation behind the emailed link so the SPA
 *    can greet the person by name, then `POST accept` sets their password.
 *  - Mobile: `requestCode` → `verifyCode` → `completeSetup`, matching the three
 *    screens in the app after an employee installs it.
 *
 * All routes are guest-accessible and throttled, since the caller has no session
 * yet — the emailed secret is the only credential they hold.
 */
class InvitationController extends Controller
{
    use ApiResponse;

    public function __construct(private InvitationService $invitations) {}

    /* ---------------------------------------------------------------------- */
    /* Web channel (company admin / scheduler)                                */
    /* ---------------------------------------------------------------------- */

    /**
     * Preview the invitation behind an emailed link.
     *
     * Lets the SPA render a real "Welcome, Jane — set your password for
     * Acme Pty Ltd" screen, and fail fast with a clear message when the link
     * has already been used or has expired.
     */
    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
        ]);

        $invitation = $this->invitations->resolveWebInvitation(
            $validated['token'],
            $validated['email']
        );

        return $this->successResponse([
            'email' => $invitation->email,
            'name' => $invitation->user?->name,
            'role' => $invitation->role,
            'company_name' => $invitation->company?->name,
            'expires_at' => $invitation->expires_at?->toIso8601String(),
        ], 'Invitation retrieved successfully.');
    }

    /**
     * Accept a web invitation by choosing a password.
     *
     * No token is issued: the SPA sends the user to the login screen so the
     * brand-new password is exercised immediately.
     */
    public function accept(AcceptInvitationRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = $this->invitations->acceptWebInvitation(
            $data['token'],
            $data['email'],
            $data['password']
        );

        return $this->successResponse(
            new UserResource($user),
            'Your password has been set. You can now sign in.'
        );
    }

    /* ---------------------------------------------------------------------- */
    /* Mobile channel (employee)                                              */
    /* ---------------------------------------------------------------------- */

    /**
     * Step 1: the app posts the employee's email and we send a one-time code.
     *
     * The response is intentionally identical whether or not the address is
     * known, so the endpoint cannot be used to enumerate staff email addresses.
     */
    public function requestCode(RequestMobileCodeRequest $request): JsonResponse
    {
        $this->invitations->sendMobileCode($request->validated()['email']);

        return $this->successResponse(
            ['expires_in_minutes' => (int) config('invitations.code_expires_in_minutes', 15)],
            'If that email is registered, we have sent a verification code to it.'
        );
    }

    /**
     * Step 2: the app submits the emailed code and receives a setup token.
     */
    public function verifyCode(VerifyMobileCodeRequest $request): JsonResponse
    {
        $data = $request->validated();

        $setupToken = $this->invitations->verifyMobileCode($data['email'], $data['code']);

        return $this->successResponse([
            'setup_token' => $setupToken,
            'expires_in_minutes' => (int) config('invitations.setup_token_expires_in_minutes', 30),
        ], 'Email verified. Please choose your password.');
    }

    /**
     * Step 3: the app sets the password using the verified setup token.
     */
    public function completeSetup(CompleteMobileSetupRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = $this->invitations->completeMobileSetup(
            $data['email'],
            $data['setup_token'],
            $data['password']
        );

        return $this->successResponse(
            new UserResource($user),
            'Your password has been set. You can now sign in.'
        );
    }

    /**
     * Publish the mobile app store links for the "download the app" page.
     *
     * Served from config rather than hard-coded in the SPA so the URLs can be
     * changed per environment (and before the apps are actually published)
     * without a frontend deploy. Empty strings are normalised to `null` so the
     * page can cleanly fall back to a "coming soon" message.
     */
    public function appLinks(): JsonResponse
    {
        $ios = (string) config('invitations.ios_app_url', '');
        $android = (string) config('invitations.android_app_url', '');

        return $this->successResponse([
            'ios_url' => $ios !== '' ? $ios : null,
            'android_url' => $android !== '' ? $android : null,
        ], 'App links retrieved successfully.');
    }
}
