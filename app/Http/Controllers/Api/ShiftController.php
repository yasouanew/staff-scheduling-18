<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Shift\AssignEmployeeRequest;
use App\Http\Requests\Shift\StoreBulkShiftRequest;
use App\Http\Requests\Shift\StoreShiftRequest;
use App\Http\Requests\Shift\UpdateShiftRequest;
use App\Http\Resources\ShiftResource;
use App\Models\Shift;
use App\Services\ShiftService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShiftController extends Controller
{
    use ApiResponse;

    public function __construct(private ShiftService $shiftService) {}

    /**
     * Display a paginated listing of shifts.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Shift::class);

        $filters = $request->only([
            'status', 'company_id', 'branch_id', 'roster_id',
            'employee_id', 'date_from', 'date_to', 'per_page',
        ]);

        // Non super admins can only see their own company's shifts.
        if (! $request->user()->hasRole('super_admin')) {
            $filters['company_id'] = $request->user()->company_id;
        }

        $shifts = $this->shiftService->paginate($filters);

        return $this->successResponse(
            ShiftResource::collection($shifts)->response()->getData(true),
            'Shifts retrieved successfully.'
        );
    }

    /**
     * Store a newly created shift.
     */
    public function store(StoreShiftRequest $request): JsonResponse
    {
        $this->authorize('create', Shift::class);

        $data = $request->validated();

        // Non super admins can only create shifts for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        $shift = $this->shiftService->create($data);

        return $this->successResponse(
            new ShiftResource($shift->load(['company', 'branch', 'roster', 'employee'])),
            'Shift created successfully.',
            201
        );
    }

    /**
     * Store a whole branch-day (one branch + one date, N shifts) atomically.
     *
     * The month-grid Add-Shift wizard creates one shift per employee for a
     * single cell. The branch-day rule is checked once per batch, so the first
     * wizard run succeeds while a second run on the already-covered day gets
     * 422 with a `branch_id` validation error.
     */
    public function storeBulk(StoreBulkShiftRequest $request): JsonResponse
    {
        $this->authorize('create', Shift::class);

        $validated = $request->validated();

        $common = [
            'roster_id' => $validated['roster_id'],
            'date' => $validated['date'],
        ];

        if (array_key_exists('branch_id', $validated)) {
            $common['branch_id'] = $validated['branch_id'];
        }

        // Non super admins can only create shifts for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $common['company_id'] = $request->user()->company_id;
        } elseif (array_key_exists('company_id', $validated)) {
            $common['company_id'] = $validated['company_id'];
        }

        $shifts = $this->shiftService->createMany($common, $validated['shifts']);

        foreach ($shifts as $shift) {
            $shift->load(['company', 'branch', 'roster', 'employee']);
        }

        return $this->successResponse(
            ShiftResource::collection($shifts),
            'Shifts created successfully.',
            201
        );
    }

    /**
     * Display the specified shift.
     */
    public function show(Shift $shift): JsonResponse
    {
        $this->authorize('view', $shift);

        $shift->load(['company', 'branch', 'roster', 'employee', 'position', 'department']);

        return $this->successResponse(
            new ShiftResource($shift),
            'Shift retrieved successfully.'
        );
    }

    /**
     * Update the specified shift.
     */
    public function update(UpdateShiftRequest $request, Shift $shift): JsonResponse
    {
        $this->authorize('update', $shift);

        $shift = $this->shiftService->update($shift, $request->validated());

        return $this->successResponse(
            new ShiftResource($shift->load(['company', 'branch', 'roster', 'employee'])),
            'Shift updated successfully.'
        );
    }

    /**
     * Assign an employee to the shift.
     */
    public function assignEmployee(AssignEmployeeRequest $request, Shift $shift): JsonResponse
    {
        $this->authorize('update', $shift);

        $shift = $this->shiftService->assignEmployee($shift, (int) $request->validated()['employee_id']);

        return $this->successResponse(
            new ShiftResource($shift->load(['company', 'branch', 'roster', 'employee'])),
            'Employee assigned to shift successfully.'
        );
    }

    /**
     * Remove the specified shift.
     *
     * On a published roster this cancels the shift (recording the change and
     * notifying the affected employee) rather than physically deleting it.
     */
    public function destroy(Request $request, Shift $shift): JsonResponse
    {
        $this->authorize('delete', $shift);

        $this->shiftService->delete($shift, $request->user());

        return $this->successResponse(null, 'Shift deleted successfully.');
    }
}
