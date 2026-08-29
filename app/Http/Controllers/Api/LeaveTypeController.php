<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LeaveType\StoreLeaveTypeRequest;
use App\Http\Requests\LeaveType\UpdateLeaveTypeRequest;
use App\Http\Resources\LeaveTypeResource;
use App\Models\LeaveType;
use App\Services\LeaveTypeService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeaveTypeController extends Controller
{
    use ApiResponse;

    public function __construct(private LeaveTypeService $leaveTypeService) {}

    /**
     * Display a paginated listing of leave types.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', LeaveType::class);

        $filters = $request->only(['search', 'status', 'company_id', 'per_page']);

        // Non super admins can only see their own company's leave types.
        if (! $request->user()->hasRole('super_admin')) {
            $filters['company_id'] = $request->user()->company_id;
        }

        $leaveTypes = $this->leaveTypeService->paginate($filters);

        return $this->successResponse(
            LeaveTypeResource::collection($leaveTypes)->response()->getData(true),
            'Leave types retrieved successfully.'
        );
    }

    /**
     * Store a newly created leave type.
     */
    public function store(StoreLeaveTypeRequest $request): JsonResponse
    {
        $this->authorize('create', LeaveType::class);

        $data = $request->validated();

        // Non super admins can only create leave types for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        $data['created_by'] = $request->user()->id;
        $data['updated_by'] = $request->user()->id;

        $leaveType = $this->leaveTypeService->create($data);

        return $this->successResponse(
            new LeaveTypeResource($leaveType->load('company')),
            'Leave type created successfully.',
            201
        );
    }

    /**
     * Display the specified leave type.
     */
    public function show(LeaveType $leaveType): JsonResponse
    {
        $this->authorize('view', $leaveType);

        $leaveType->load('company');

        return $this->successResponse(
            new LeaveTypeResource($leaveType),
            'Leave type retrieved successfully.'
        );
    }

    /**
     * Update the specified leave type.
     */
    public function update(UpdateLeaveTypeRequest $request, LeaveType $leaveType): JsonResponse
    {
        $this->authorize('update', $leaveType);

        $data = $request->validated();
        $data['updated_by'] = $request->user()->id;

        $leaveType = $this->leaveTypeService->update($leaveType, $data);

        return $this->successResponse(
            new LeaveTypeResource($leaveType->load('company')),
            'Leave type updated successfully.'
        );
    }

    /**
     * Remove the specified leave type.
     */
    public function destroy(LeaveType $leaveType): JsonResponse
    {
        $this->authorize('delete', $leaveType);

        $this->leaveTypeService->delete($leaveType);

        return $this->successResponse(null, 'Leave type deleted successfully.');
    }
}
