<?php

use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\BranchSubscriptionController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\CompanySettingController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\DeviceTokenController;
use App\Http\Controllers\Api\EmployeeAvailabilityController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\EmployeeInvitationController;
use App\Http\Controllers\Api\InvitationController;

use App\Http\Controllers\Api\LeaveRequestController;
use App\Http\Controllers\Api\LeaveTypeController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PositionController;


use App\Http\Controllers\Api\RosterChangesController;
use App\Http\Controllers\Api\RosterController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\ShiftTemplateController;
use App\Http\Controllers\Api\FeatureController;






use App\Http\Controllers\Api\PlanController;
use App\Http\Controllers\Api\PlanSubscriptionController;
use App\Http\Controllers\Api\PlatformTrialSettingController;
use App\Http\Controllers\Api\PublicPlanController;

use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\SubscriptionPaymentController;
use App\Http\Controllers\Api\StripeBillingWebhookController;
use Illuminate\Support\Facades\Route;


/*
|--------------------------------------------------------------------------
| API Routes (v1)
|--------------------------------------------------------------------------
|
| These routes are consumed by the React web app and the React Native
| mobile app. Authentication is handled via Laravel Sanctum tokens.
|
*/

Route::prefix('v1')->group(function () {
    // Public authentication endpoints
    Route::post('auth/register', [AuthController::class, 'register'])
        ->middleware('throttle:6,1')
        ->name('api.auth.register');

    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:6,1')
        ->name('api.auth.login');

    Route::post('auth/forgot-password', [AuthController::class, 'forgotPassword'])
        ->middleware('throttle:6,1')
        ->name('api.auth.forgot-password');

    Route::post('auth/reset-password', [AuthController::class, 'resetPassword'])
        ->middleware('throttle:6,1')
        ->name('api.auth.reset-password');

    /*
    | Public onboarding endpoints for invited team members. These are reached
    | before an account has a password, so the emailed token/code is the only
    | credential — hence the tight throttles on every route.
    |
    | Web channel (company admin / scheduler): preview the link, then set a
    | password. Mobile channel (employee): request a code, verify it, then set a
    | password using the returned short-lived setup token.
    */
    Route::get('invitations', [InvitationController::class, 'show'])
        ->middleware('throttle:10,1')
        ->name('api.invitations.show');

    Route::post('invitations/accept', [InvitationController::class, 'accept'])
        ->middleware('throttle:6,1')
        ->name('api.invitations.accept');

    Route::post('invitations/mobile/request-code', [InvitationController::class, 'requestCode'])
        ->middleware('throttle:6,1')
        ->name('api.invitations.mobile.request-code');

    Route::post('invitations/mobile/verify-code', [InvitationController::class, 'verifyCode'])
        ->middleware('throttle:10,1')
        ->name('api.invitations.mobile.verify-code');

    Route::post('invitations/mobile/complete-setup', [InvitationController::class, 'completeSetup'])
        ->middleware('throttle:6,1')
        ->name('api.invitations.mobile.complete-setup');

    // Store links rendered by the public "download the app" landing page that
    // employee invitation emails point at.
    Route::get('mobile-app/links', [InvitationController::class, 'appLinks'])
        ->middleware('throttle:30,1')
        ->name('api.mobile-app.links');


    // Authenticated endpoints
    Route::post('webhooks/stripe/billing', [StripeBillingWebhookController::class, 'handle'])
    ->name('api.webhooks.stripe.billing');

Route::get('public/plans', [PublicPlanController::class, 'index'])
    ->name('api.public.plans.index');

    // Every authenticated endpoint re-checks that the account is still active,
    // so deactivating someone on the team page locks them out on their next
    // request rather than whenever their session happens to expire.
    Route::middleware(['auth:sanctum', 'account.active'])->group(function () {

        Route::get('auth/me', [AuthController::class, 'me'])->name('api.auth.me');
        Route::post('auth/web-welcome/complete', [AuthController::class, 'completeWebWelcome'])
            ->name('api.auth.web-welcome.complete');
        Route::post('auth/web-feature-tips/dismiss', [AuthController::class, 'dismissWebFeatureTip'])
            ->name('api.auth.web-feature-tips.dismiss');
        Route::post('auth/logout', [AuthController::class, 'logout'])->name('api.auth.logout');
        Route::post('auth/logout-all', [AuthController::class, 'logoutAll'])->name('api.auth.logout-all');

        // Re-send the email verification link to the authenticated user.
        Route::post('auth/email/resend', [AuthController::class, 'resendVerification'])
            ->middleware('throttle:6,1')
            ->name('api.auth.email.resend');

        // Confirm the authenticated user's password before a sensitive action.
        Route::post('auth/confirm-password', [AuthController::class, 'confirmPassword'])
            ->middleware('throttle:6,1')
            ->name('api.auth.confirm-password');

        // Platform settings are managed only by the super administrator.
        Route::get('platform-settings/trial', [PlatformTrialSettingController::class, 'show'])
            ->name('api.platform-settings.trial.show');
        Route::put('platform-settings/trial', [PlatformTrialSettingController::class, 'update'])
            ->name('api.platform-settings.trial.update');

        // Kept available to render the locked-company billing and reactivation view.
        Route::get('companies/{company}', [CompanyController::class, 'show'])
            ->name('api.companies.show');

        Route::middleware('company.access')->group(function (): void {
            // Dashboard analytics overview (role-aware)
            Route::get('dashboard/overview', [DashboardController::class, 'overview'])
            ->name('api.dashboard.overview');

        // Plan entitlements for the authenticated business (see FeatureController)
        Route::get('entitlements', [FeatureController::class, 'index'])
            ->name('api.entitlements.index');

        // Reference example of feature-gated middleware: advanced reporting is
        // only reachable on a plan that enables it. Other endpoints gate with
        // the `feature:` middleware alias, e.g. `feature:shift_swap,{branch}`.
        Route::get('entitlements/reporting', [FeatureController::class, 'reporting'])
            ->middleware('feature:advanced_reporting')
            ->name('api.entitlements.reporting');

        // Company settings (profile + operational policies)
        Route::get('companies/{company}/settings', [CompanySettingController::class, 'show'])
            ->name('api.companies.settings.show');
        Route::put('companies/{company}/settings', [CompanySettingController::class, 'update'])
            ->name('api.companies.settings.update');

        // Company management
        Route::apiResource('companies', CompanyController::class)->except(['show']);

        // Branch management
        Route::apiResource('branches', BranchController::class);

        // Branch subscription lifecycle + capacity (see BranchSubscriptionController)
        Route::post('branches/{branch}/activate', [BranchSubscriptionController::class, 'activate'])
            ->name('api.branches.activate');
        Route::post('branches/{branch}/deactivate', [BranchSubscriptionController::class, 'deactivate'])
            ->name('api.branches.deactivate');
        Route::put('branches/{branch}/capacity', [BranchSubscriptionController::class, 'updateCapacity'])
            ->name('api.branches.capacity');
        Route::get('usage', [BranchSubscriptionController::class, 'usage'])
            ->name('api.usage');

        // Subscription management for the authenticated business (see
        // PlanSubscriptionController). Reads require `subscription.view`;
        // upgrade/downgrade/cancel require `subscription.manage`. Pricing is
        // always resolved from the backend plan records — never from the client.
        Route::get('subscription', [PlanSubscriptionController::class, 'show'])
            ->name('api.subscription.show');
        Route::get('subscription/plans', [PlanSubscriptionController::class, 'plans'])
            ->name('api.subscription.plans');
        Route::get('subscription/usage', [PlanSubscriptionController::class, 'usage'])
            ->name('api.subscription.usage');
        Route::get('subscription/features', [PlanSubscriptionController::class, 'features'])
            ->name('api.subscription.features');
        Route::post('subscription/upgrade', [PlanSubscriptionController::class, 'upgrade'])
            ->name('api.subscription.upgrade');
        Route::post('subscription/downgrade', [PlanSubscriptionController::class, 'downgrade'])
            ->name('api.subscription.downgrade');
        Route::post('subscription/cancel', [PlanSubscriptionController::class, 'cancel'])
            ->name('api.subscription.cancel');

        // Department management
        Route::apiResource('departments', DepartmentController::class);

        // Position management
        Route::apiResource('positions', PositionController::class);

        // Employee management
        Route::post('employees/invite', [EmployeeController::class, 'invite'])
            ->name('api.employees.invite');
        Route::post('employees/{employee}/role', [EmployeeController::class, 'assignRole'])
            ->name('api.employees.assign-role');
        Route::post('employees/{employee}/department', [EmployeeController::class, 'assignDepartment'])
            ->name('api.employees.assign-department');
        Route::post('employees/{employee}/position', [EmployeeController::class, 'assignPosition'])
            ->name('api.employees.assign-position');
        Route::post('employees/{employee}/photo', [EmployeeController::class, 'uploadPhoto'])
            ->name('api.employees.upload-photo');
        Route::post('employees/{employee}/transfer', [EmployeeController::class, 'transfer'])
            ->name('api.employees.transfer');

        // Send / revoke an onboarding invitation from the team page row menu.
        Route::post('employees/{employee}/invitation', [EmployeeInvitationController::class, 'store'])
            ->name('api.employees.invitation.store');
        Route::delete('employees/{employee}/invitation', [EmployeeInvitationController::class, 'destroy'])
            ->name('api.employees.invitation.destroy');

        Route::apiResource('employees', EmployeeController::class);

        // Employee weekly availability (nested under employees)
        Route::get('employees/{employee}/availabilities', [EmployeeAvailabilityController::class, 'index'])
            ->name('api.employees.availabilities.index');
        Route::post('employees/{employee}/availabilities', [EmployeeAvailabilityController::class, 'store'])
            ->name('api.employees.availabilities.store');
        Route::put('employees/{employee}/availabilities/sync', [EmployeeAvailabilityController::class, 'sync'])
            ->name('api.employees.availabilities.sync');
        Route::get('employees/{employee}/availabilities/{availability}', [EmployeeAvailabilityController::class, 'show'])
            ->name('api.employees.availabilities.show');
        Route::put('employees/{employee}/availabilities/{availability}', [EmployeeAvailabilityController::class, 'update'])
            ->name('api.employees.availabilities.update');
        Route::delete('employees/{employee}/availabilities/{availability}', [EmployeeAvailabilityController::class, 'destroy'])
            ->name('api.employees.availabilities.destroy');






        // Shift template management (CRUD)
        Route::apiResource('shift-templates', ShiftTemplateController::class);

        // Roster management (CRUD + copy previous week + publish)
        Route::post('rosters/copy-previous-week', [RosterController::class, 'copyPreviousWeek'])
            ->name('api.rosters.copy-previous-week');
        Route::post('rosters/{roster}/publish', [RosterController::class, 'publish'])
            ->name('api.rosters.publish');

        // Post-publication change management (preview → confirm → apply → history)
        Route::post('rosters/{roster}/changes/preview', [RosterChangesController::class, 'preview'])
            ->name('api.rosters.changes.preview');
        Route::post('rosters/{roster}/changes/apply', [RosterChangesController::class, 'apply'])
            ->name('api.rosters.changes.apply');
        Route::get('rosters/{roster}/changes', [RosterChangesController::class, 'index'])
            ->name('api.rosters.changes.index');
        Route::get('rosters/{roster}/changes/latest', [RosterChangesController::class, 'latest'])
            ->name('api.rosters.changes.latest');

        Route::apiResource('rosters', RosterController::class);

        // Shift management (CRUD + assign employee)
        Route::post('shifts/{shift}/assign-employee', [ShiftController::class, 'assignEmployee'])
            ->name('api.shifts.assign-employee');
        Route::apiResource('shifts', ShiftController::class);

        // Leave type management (CRUD)
        Route::apiResource('leave-types', LeaveTypeController::class);

        // Leave management (request + approve + reject)
        Route::post('leave-requests/{leaveRequest}/approve', [LeaveRequestController::class, 'approve'])
            ->name('api.leave-requests.approve');
        Route::post('leave-requests/{leaveRequest}/reject', [LeaveRequestController::class, 'reject'])
            ->name('api.leave-requests.reject');
        Route::apiResource('leave-requests', LeaveRequestController::class)
            ->only(['index', 'store', 'show']);

        // Push notification device tokens (mobile app registers/unregisters)
        Route::post('device-tokens', [DeviceTokenController::class, 'store'])
            ->name('api.device-tokens.store');
        Route::delete('device-tokens', [DeviceTokenController::class, 'destroy'])
            ->name('api.device-tokens.destroy');

        // In-app notifications (database channel, web + mobile)
        Route::get('notifications', [NotificationController::class, 'index'])
            ->name('api.notifications.index');
        Route::post('notifications/read-all', [NotificationController::class, 'markAllAsRead'])
            ->name('api.notifications.read-all');
        Route::post('notifications/{notification}/read', [NotificationController::class, 'markAsRead'])
            ->name('api.notifications.read');
        Route::delete('notifications/{notification}', [NotificationController::class, 'destroy'])
            ->name('api.notifications.destroy');
        });

        // Billing: plan catalogue (managed by super admins)

        Route::apiResource('plans', PlanController::class);

        // Billing: company subscriptions
        Route::prefix('companies/{company}')->group(function () {
            Route::get('subscriptions', [SubscriptionController::class, 'index'])
                ->name('api.subscriptions.index');
            Route::post('subscriptions', [SubscriptionController::class, 'store'])
                ->name('api.subscriptions.store');
            Route::get('subscriptions/{subscription}', [SubscriptionController::class, 'show'])
                ->name('api.subscriptions.show');
            Route::post('subscriptions/{subscription}/cancel', [SubscriptionController::class, 'cancel'])
                ->name('api.subscriptions.cancel');
            Route::post('subscriptions/{subscription}/resume', [SubscriptionController::class, 'resume'])
                ->name('api.subscriptions.resume');
            Route::post('subscriptions/{subscription}/swap', [SubscriptionController::class, 'swap'])
                ->name('api.subscriptions.swap');

            // Subscription payments
            Route::get('subscriptions/{subscription}/payments', [SubscriptionPaymentController::class, 'index'])
                ->name('api.subscription-payments.index');
            Route::post('subscriptions/{subscription}/payments/{payment}/refund', [SubscriptionPaymentController::class, 'refund'])
                ->name('api.subscription-payments.refund');
        });
    });
});
