<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\EmployeeAvailability\StoreEmployeeAvailabilityRequest;
use App\Http\Requests\EmployeeAvailability\SyncWeeklyAvailabilityRequest;
use App\Http\Requests\EmployeeAvailability\UpdateEmployeeAvailabilityRequest;
use App\Http\Resources\EmployeeAvailabilityResource;
use App\Models\Employee;
use App\Models\EmployeeAvailability;
use App\Services\EmployeeAvailabilityService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;

class EmployeeAvailabilityController extends Controller
{
    use ApiResponse;

    public function __construct(private EmployeeAvailabilityService $availabilityService) {}

    /**
     * List the employee's weekly availability.
     */
    public function index(Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);

        $availabilities = $this->availabilityService->forEmployee($employee);

        return $this->successResponse(
            EmployeeAvailabilityResource::collection($availabilities),
            'Availability retrieved successfully.'
        );
    }

    /**
     * Store a new availability slot for the employee.
     */
    public function store(StoreEmployeeAvailabilityRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $availability = $this->availabilityService->create($employee, $request->validated());

        return $this->successResponse(

            new EmployeeAvailabilityResource($availability),
            'Availability slot created successfully.',
            201
        );
    }

    /**
     * Replace the employee's entire weekly availability.
     */
    public function sync(SyncWeeklyAvailabilityRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);


        $availabilities = $this->availabilityService->syncWeekly(
            $employee,
            $request->validated()['availabilities']
        );

        return $this->successResponse(
            EmployeeAvailabilityResource::collection($availabilities),
            'Weekly availability updated successfully.'
        );
    }

    /**
     * Show a single availability slot.
     */
    public function show(Employee $employee, EmployeeAvailability $availability): JsonResponse
    {
        $this->authorize('view', $employee);
        $this->ensureBelongsToEmployee($employee, $availability);

        return $this->successResponse(
            new EmployeeAvailabilityResource($availability),
            'Availability slot retrieved successfully.'
        );
    }

    /**
     * Update a single availability slot.
     */
    public function update(UpdateEmployeeAvailabilityRequest $request, Employee $employee, EmployeeAvailability $availability): JsonResponse
    {
        $this->authorize('update', $employee);

        $this->ensureBelongsToEmployee($employee, $availability);

        $availability = $this->availabilityService->update($availability, $request->validated());

        return $this->successResponse(
            new EmployeeAvailabilityResource($availability),
            'Availability slot updated successfully.'
        );
    }

    /**
     * Delete a single availability slot.
     */
    public function destroy(Employee $employee, EmployeeAvailability $availability): JsonResponse
    {
        $this->authorize('update', $employee);

        $this->ensureBelongsToEmployee($employee, $availability);

        $this->availabilityService->delete($availability);

        return $this->successResponse(null, 'Availability slot deleted successfully.');
    }

    /**
     * Ensure the availability slot belongs to the given employee.
     */
    protected function ensureBelongsToEmployee(Employee $employee, EmployeeAvailability $availability): void
    {
        abort_unless((int) $availability->employee_id === (int) $employee->id, 404);
    }
}
