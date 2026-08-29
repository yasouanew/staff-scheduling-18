<?php

namespace App\Http\Controllers\Api\Auth;

use App\Domains\Auth\Actions\ConfirmPasswordAction;
use App\Domains\Auth\Actions\ForgotPasswordAction;
use App\Domains\Auth\Actions\LoginAction;
use App\Domains\Auth\Actions\LogoutAction;
use App\Domains\Auth\Actions\RegisterAction;
use App\Domains\Auth\Actions\ResetPasswordAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ApiLoginRequest;
use App\Http\Requests\Auth\ApiRegisterRequest;
use App\Http\Requests\Auth\ConfirmPasswordRequest;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\LogoutRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Http\Resources\UserResource;
use App\Traits\ApiResponse;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    use ApiResponse;

    public function __construct(
        private LoginAction $loginAction,
        private LogoutAction $logoutAction,
        private RegisterAction $registerAction,
        private ForgotPasswordAction $forgotPasswordAction,
        private ResetPasswordAction $resetPasswordAction,
        private ConfirmPasswordAction $confirmPasswordAction,
    ) {}

    /**
     * Register a new company (tenant) and its first company_admin user,
     * returning an access token so the client can be logged straight in.
     */
    public function register(ApiRegisterRequest $request): JsonResponse
    {
        $result = $this->registerAction->execute(
            $request->validated(),
            $request->deviceName(),
        );

        return $this->successResponse([
            'user' => new UserResource($result['user']->load(['roles', 'employee'])),
            'token' => $result['token'],
            'token_type' => 'Bearer',
        ], 'Your account has been created successfully.', 201);
    }

    /**
     * Authenticate a user and issue an access token.
     */
    public function login(ApiLoginRequest $request): JsonResponse
    {
        try {
            $result = $this->loginAction->execute(
                $request->validated(),
                $request->deviceName(),
            );
        } catch (AuthenticationException $e) {
            return $this->errorResponse($e->getMessage(), 401);
        }

        return $this->successResponse([
            'user' => new UserResource($result['user']->load(['roles', 'employee'])),
            'token' => $result['token'],
            'token_type' => 'Bearer',
        ], 'Logged in successfully.');
    }

    /**
     * Get the currently authenticated user.
     */
    public function me(Request $request): JsonResponse
    {
        return $this->successResponse(
            new UserResource($request->user()->load(['roles', 'employee'])),
            'Authenticated user retrieved.'
        );
    }

    /**
     * Mark the low-friction web welcome as acknowledged for this user.
     */
    public function completeWebWelcome(Request $request): JsonResponse
    {
        abort_if($request->user()->hasRole('employee'), 403);

        $user = $request->user();
        $user->update(['web_welcome_completed_at' => now()]);

        return $this->successResponse(
            new UserResource($user->fresh()->load(['roles', 'employee'])),
            'Web welcome acknowledged.'
        );
    }

    /**
     * Persist dismissal of one small contextual web feature tip.
     */
    public function dismissWebFeatureTip(Request $request): JsonResponse
    {
        abort_if($request->user()->hasRole('employee'), 403);

        $validated = $request->validate([
            'tip' => ['required', 'string', 'in:dashboard,rosters,shifts,leave_requests,employees,settings'],
        ]);
        $user = $request->user();
        $tips = $user->web_feature_tips ?? [];
        $tips[$validated['tip']] = now()->toIso8601String();
        $user->update(['web_feature_tips' => $tips]);

        return $this->successResponse(
            new UserResource($user->fresh()->load(['roles', 'employee'])),
            'Feature tip dismissed.'
        );
    }

    /**
     * Revoke the current access token (logout).
     */
    public function logout(LogoutRequest $request): JsonResponse
    {
        $this->logoutAction->execute($request->user(), $request->validated());

        return $this->successResponse(null, 'Logged out successfully.');
    }

    /**
     * Revoke all tokens for the user (logout from all devices).
     */
    public function logoutAll(Request $request): JsonResponse
    {
        $this->logoutAction->executeAll($request->user());

        return $this->successResponse(null, 'Logged out from all devices.');
    }

    /**
     * Send a password reset link to the given email address.
     */
    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        try {
            $this->forgotPasswordAction->execute($request->validated());
        } catch (ValidationException $e) {
            return $this->errorResponse('Unable to send password reset link.', 422, $e->errors());
        }

        return $this->successResponse(null, 'A password reset link has been sent to your email address.');
    }

    /**
     * Reset the user's password using a valid token.
     */
    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        try {
            $this->resetPasswordAction->execute($request->validated());
        } catch (ValidationException $e) {
            return $this->errorResponse('Unable to reset password.', 422, $e->errors());
        }

        return $this->successResponse(null, 'Your password has been reset successfully.');
    }

    /**
     * Re-send the email verification link to the authenticated user.
     */
    public function resendVerification(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return $this->successResponse(null, 'Your email address is already verified.');
        }

        $user->sendEmailVerificationNotification();

        return $this->successResponse(null, 'A fresh verification link has been sent to your email address.');
    }

    /**
     * Confirm the authenticated user's password before a sensitive action.
     */
    public function confirmPassword(ConfirmPasswordRequest $request): JsonResponse
    {
        try {
            $this->confirmPasswordAction->execute($request->user(), $request->validated('password'));
        } catch (ValidationException $e) {
            return $this->errorResponse('The provided password is incorrect.', 422, $e->errors());
        }

        return $this->successResponse([
            'confirmed_at' => now()->toIso8601String(),
        ], 'Password confirmed successfully.');
    }
}
