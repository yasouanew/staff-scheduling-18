<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Leave\ApproveLeaveRequestRequest;
use App\Http\Requests\Leave\RejectLeaveRequestRequest;
use App\Http\Requests\Leave\StoreLeaveRequestRequest;
use App\Http\Resources\LeaveRequestResource;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Services\LeaveRequestService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeaveRequestController extends Controller
{
    use ApiResponse;

    public function __construct(private LeaveRequestService $leaveRequestService) {}

    /**
     * Display a paginated listing of leave requests.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', LeaveRequest::class);

        $filters = $request->only([
            'status', 'company_id', 'employee_id', 'leave_type_id',
            'date_from', 'date_to', 'per_page',
        ]);

        $user = $request->user();

        // Non super admins can only see their own company's leave requests.
        if (! $user->hasRole('super_admin')) {
            $filters['company_id'] = $user->company_id;
        }

        // Employee users may only list their own leave requests. Managers and
        // administrators retain the company-scoped review view.
        if ($user->hasRole('employee')) {
            $employeeId = Employee::query()->where('user_id', $user->id)->value('id');
            abort_unless($employeeId !== null, 403, 'No employee profile is linked to this account.');
            $filters['employee_id'] = $employeeId;
        }

        $leaveRequests = $this->leaveRequestService->paginate($filters);

        return $this->successResponse(
            LeaveRequestResource::collection($leaveRequests)->response()->getData(true),
            'Leave requests retrieved successfully.'
        );
    }

    /**
     * Store a newly created leave request.
     */
    public function store(StoreLeaveRequestRequest $request): JsonResponse
    {
        $this->authorize('create', LeaveRequest::class);

        $data = $request->validated();
        $user = $request->user();

        // Non super admins can only create leave requests for their own company.
        if (! $user->hasRole('super_admin')) {
            $data['company_id'] = $user->company_id;
        }

        // Employee users submit requests only for their own linked profile.
        if ($user->hasRole('employee')) {
            $employeeId = Employee::query()->where('user_id', $user->id)->value('id');
            abort_unless($employeeId !== null, 403, 'No employee profile is linked to this account.');
            $data['employee_id'] = $employeeId;
        }

        if ($request->hasFile('attachments')) {
            $paths = [];
            foreach ($request->file('attachments', []) as $attachment) {
                $paths[] = $attachment->store('leave-request-attachments', 'public');
            }
            $data['attachments'] = $paths;
            $data['attachment'] = $paths[0] ?? null;
        }

        $leaveRequest = $this->leaveRequestService->create($data, $user);

        return $this->successResponse(
            new LeaveRequestResource($leaveRequest->load(['employee', 'leaveType'])),
            'Leave request submitted successfully.',
            201
        );
    }

    /**
     * Display the specified leave request.
     */
    public function show(LeaveRequest $leaveRequest): JsonResponse
    {
        $this->authorize('view', $leaveRequest);

        $leaveRequest->load(['company', 'employee', 'leaveType', 'approver', 'rejecter']);

        return $this->successResponse(
            new LeaveRequestResource($leaveRequest),
            'Leave request retrieved successfully.'
        );
    }

    /**
     * Approve the specified leave request.
     */
    public function approve(ApproveLeaveRequestRequest $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $this->authorize('approve', $leaveRequest);

        abort_unless($leaveRequest->status === 'pending', 422, 'Only pending leave requests can be approved.');

        $leaveRequest = $this->leaveRequestService->approve(
            $leaveRequest,
            $request->user(),
            $request->validated()['admin_notes'] ?? null
        );

        return $this->successResponse(
            new LeaveRequestResource($leaveRequest->load(['employee', 'leaveType', 'approver'])),
            'Leave request approved successfully.'
        );
    }

    /**
     * Reject the specified leave request.
     */
    public function reject(RejectLeaveRequestRequest $request, LeaveRequest $leaveRequest): JsonResponse
    {
        $this->authorize('reject', $leaveRequest);

        abort_unless($leaveRequest->status === 'pending', 422, 'Only pending leave requests can be rejected.');

        $leaveRequest = $this->leaveRequestService->reject(
            $leaveRequest,
            $request->user(),
            $request->validated()['rejection_reason']
        );

        return $this->successResponse(
            new LeaveRequestResource($leaveRequest->load(['employee', 'leaveType', 'rejecter'])),
            'Leave request rejected successfully.'
        );
    }
}
