<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Employee\SendInvitationRequest;
use App\Http\Resources\EmployeeInvitationResource;
use App\Models\Employee;
use App\Services\InvitationService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;

/**
 * Admin-facing invitation endpoints used by the team page row menu.
 */
class EmployeeInvitationController extends Controller
{
    use ApiResponse;

    public function __construct(private InvitationService $invitations) {}

    /**
     * Send (or re-send) an onboarding invitation for an employee.
     *
     * The role decides the journey: company admins and schedulers get a link
     * into the web app's set-password screen, employees get a "download the
     * app" email and finish onboarding on their phone.
     */
    public function store(SendInvitationRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $invitation = $this->invitations->invite(
            $employee,
            $request->validated(),
            $request->user()
        );

        $message = $invitation->channel === 'web'
            ? 'Invitation sent. They can set their password from the emailed link.'
            : 'Invitation sent. They will be guided to download the app and verify their email.';

        return $this->successResponse(
            new EmployeeInvitationResource($invitation),
            $message,
            201
        );
    }

    /**
     * Revoke the employee's outstanding invitation.
     */
    public function destroy(Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $invitation = $employee->invitation;

        if ($invitation === null) {
            return $this->errorResponse('This employee has no outstanding invitation.', 404);
        }

        $this->invitations->revoke($invitation);

        return $this->successResponse(null, 'Invitation revoked successfully.');
    }
}
