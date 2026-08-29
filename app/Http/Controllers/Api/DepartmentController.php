<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Department\StoreDepartmentRequest;
use App\Http\Requests\Department\UpdateDepartmentRequest;
use App\Http\Resources\DepartmentResource;
use App\Models\Department;
use App\Services\DepartmentService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{
    use ApiResponse;

    public function __construct(private DepartmentService $departmentService) {}

    /**
     * Display a paginated listing of departments.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Department::class);

        $filters = $request->only(['search', 'status', 'company_id', 'per_page']);

        // Non super admins can only see their own company's departments.
        if (! $request->user()->hasRole('super_admin')) {
            $filters['company_id'] = $request->user()->company_id;
        }

        $departments = $this->departmentService->paginate($filters);

        return $this->successResponse(
            DepartmentResource::collection($departments)->response()->getData(true),
            'Departments retrieved successfully.'
        );
    }

    /**
     * Store a newly created department.
     */
    public function store(StoreDepartmentRequest $request): JsonResponse
    {
        $this->authorize('create', Department::class);

        $data = $request->validated();

        // Non super admins can only create departments for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        $data['created_by'] = $request->user()->id;
        $data['updated_by'] = $request->user()->id;

        $department = $this->departmentService->create($data);

        return $this->successResponse(
            new DepartmentResource($department->load('company')),
            'Department created successfully.',
            201
        );
    }

    /**
     * Display the specified department.
     */
    public function show(Department $department): JsonResponse
    {
        $this->authorize('view', $department);

        $department->loadCount('positions')->load('company');

        return $this->successResponse(
            new DepartmentResource($department),
            'Department retrieved successfully.'
        );
    }

    /**
     * Update the specified department.
     */
    public function update(UpdateDepartmentRequest $request, Department $department): JsonResponse
    {
        $this->authorize('update', $department);

        $data = $request->validated();
        $data['updated_by'] = $request->user()->id;

        $department = $this->departmentService->update($department, $data);

        return $this->successResponse(
            new DepartmentResource($department->load('company')),
            'Department updated successfully.'
        );
    }

    /**
     * Remove the specified department.
     */
    public function destroy(Department $department): JsonResponse
    {
        $this->authorize('delete', $department);

        $this->departmentService->delete($department);

        return $this->successResponse(null, 'Department deleted successfully.');
    }
}
