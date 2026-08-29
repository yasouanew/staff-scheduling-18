<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Position\StorePositionRequest;
use App\Http\Requests\Position\UpdatePositionRequest;
use App\Http\Resources\PositionResource;
use App\Models\Position;
use App\Services\PositionService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PositionController extends Controller
{
    use ApiResponse;

    public function __construct(private PositionService $positionService) {}

    /**
     * Display a paginated listing of positions.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Position::class);

        $filters = $request->only(['search', 'status', 'company_id', 'department_id', 'per_page']);

        // Non super admins can only see their own company's positions.
        if (! $request->user()->hasRole('super_admin')) {
            $filters['company_id'] = $request->user()->company_id;
        }

        $positions = $this->positionService->paginate($filters);

        return $this->successResponse(
            PositionResource::collection($positions)->response()->getData(true),
            'Positions retrieved successfully.'
        );
    }

    /**
     * Store a newly created position.
     */
    public function store(StorePositionRequest $request): JsonResponse
    {
        $this->authorize('create', Position::class);

        $data = $request->validated();

        // Non super admins can only create positions for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        $data['created_by'] = $request->user()->id;
        $data['updated_by'] = $request->user()->id;

        $position = $this->positionService->create($data);

        return $this->successResponse(
            new PositionResource($position->load(['company', 'department'])),
            'Position created successfully.',
            201
        );
    }

    /**
     * Display the specified position.
     */
    public function show(Position $position): JsonResponse
    {
        $this->authorize('view', $position);

        $position->load(['company', 'department']);

        return $this->successResponse(
            new PositionResource($position),
            'Position retrieved successfully.'
        );
    }

    /**
     * Update the specified position.
     */
    public function update(UpdatePositionRequest $request, Position $position): JsonResponse
    {
        $this->authorize('update', $position);

        $data = $request->validated();
        $data['updated_by'] = $request->user()->id;

        $position = $this->positionService->update($position, $data);

        return $this->successResponse(
            new PositionResource($position->load(['company', 'department'])),
            'Position updated successfully.'
        );
    }

    /**
     * Remove the specified position.
     */
    public function destroy(Position $position): JsonResponse
    {
        $this->authorize('delete', $position);

        $this->positionService->delete($position);

        return $this->successResponse(null, 'Position deleted successfully.');
    }
}
