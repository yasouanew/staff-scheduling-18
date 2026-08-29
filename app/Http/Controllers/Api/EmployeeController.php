<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Employee\AssignAttributeRequest;
use App\Http\Requests\Employee\AssignRoleRequest;
use App\Http\Requests\Employee\InviteEmployeeRequest;
use App\Http\Requests\Employee\StoreEmployeeRequest;
use App\Http\Requests\Employee\TransferEmployeeRequest;
use App\Http\Requests\Employee\UpdateEmployeeRequest;
use App\Http\Requests\Employee\UploadPhotoRequest;
use App\Http\Resources\EmployeeResource;
use App\Models\Branch;
use App\Models\Employee;
use App\Services\BranchSubscriptionService;
use App\Services\EmployeeService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeController extends Controller
{
    use ApiResponse;

    public function __construct(
        private EmployeeService $employeeService,
        private BranchSubscriptionService $branchSubscriptions,
    ) {}

    /**
     * Display a paginated listing of employees.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Employee::class);

        $filters = $request->only([
            'search', 'status', 'company_id', 'department_id',
            'position_id', 'branch_id', 'employment_type', 'per_page',
        ]);

        // Non super admins can only see their own company's employees.
        if (! $request->user()->hasRole('super_admin')) {
            $filters['company_id'] = $request->user()->company_id;
        }

        $employees = $this->employeeService->paginate($filters);

        return $this->successResponse(
            EmployeeResource::collection($employees)->response()->getData(true),
            'Employees retrieved successfully.'
        );
    }

    /**
     * Store a newly created employee.
     */
    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $this->authorize('create', Employee::class);

        $data = $request->validated();

        // Non super admins can only create employees for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        if ($request->hasFile('photo')) {
            $data['photo'] = $request->file('photo');
        }

        $employee = $this->employeeService->create($data);

        return $this->successResponse(
            new EmployeeResource($employee),
            'Employee created successfully.',
            201
        );
    }

    /**
     * Invite a new employee (creates a user account and emails an invitation).
     */
    public function invite(InviteEmployeeRequest $request): JsonResponse
    {
        $this->authorize('create', Employee::class);

        $data = $request->validated();

        // Non super admins can only invite into their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        $data['company_name'] = $request->user()->company?->name;

        $employee = $this->employeeService->invite($data);

        return $this->successResponse(
            new EmployeeResource($employee),
            'Employee invited successfully.',
            201
        );
    }

    /**
     * Display the specified employee.
     */
    public function show(Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);

        $employee->load(['company', 'user', 'department', 'position', 'branch']);

        return $this->successResponse(
            new EmployeeResource($employee),
            'Employee retrieved successfully.'
        );
    }

    /**
     * Update the specified employee.
     */
    public function update(UpdateEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $employee = $this->employeeService->update($employee, $request->validated());

        return $this->successResponse(
            new EmployeeResource($employee),
            'Employee updated successfully.'
        );
    }

    /**
     * Remove the specified employee.
     */
    public function destroy(Employee $employee): JsonResponse
    {
        $this->authorize('delete', $employee);

        $this->employeeService->delete($employee);

        return $this->successResponse(null, 'Employee deleted successfully.');
    }

    /**
     * Assign a role to the employee's linked user account.
     */
    public function assignRole(AssignRoleRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $employee = $this->employeeService->assignRole($employee, $request->validated()['role']);

        return $this->successResponse(
            new EmployeeResource($employee),
            'Role assigned successfully.'
        );
    }

    /**
     * Assign a department to the employee.
     */
    public function assignDepartment(AssignAttributeRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $employee = $this->employeeService->assignDepartment($employee, $request->validated()['department_id'] ?? null);

        return $this->successResponse(
            new EmployeeResource($employee),
            'Department assigned successfully.'
        );
    }

    /**
     * Assign a position to the employee.
     */
    public function assignPosition(AssignAttributeRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $employee = $this->employeeService->assignPosition($employee, $request->validated()['position_id'] ?? null);

        return $this->successResponse(
            new EmployeeResource($employee),
            'Position assigned successfully.'
        );
    }

    /**
     * Upload (or replace) the employee's profile photo.
     */
    public function uploadPhoto(UploadPhotoRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $employee = $this->employeeService->uploadPhoto($employee, $request->file('photo'));

        return $this->successResponse(
            new EmployeeResource($employee),
            'Photo uploaded successfully.'
        );
    }

    /**
     * Transfer an employee to another branch.
     *
     * The destination branch capacity is validated before anything changes, and
     * the whole operation is transactional, so a full destination branch never
     * leaves a partially-updated employee record.
     */
    public function transfer(TransferEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('transfer', $employee);

        $destination = Branch::findOrFail((int) $request->validated()['branch_id']);

        $employee = $this->branchSubscriptions->transferEmployee(
            $employee,
            $destination,
            $request->user(),
        );

        return $this->successResponse(
            new EmployeeResource($employee),
            'Employee transferred successfully.'
        );
    }
}
