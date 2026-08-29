<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Plan\StorePlanRequest;
use App\Http\Requests\Plan\UpdatePlanRequest;
use App\Http\Resources\PlanResource;
use App\Models\Plan;
use App\Services\PlanService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlanController extends Controller
{
    use ApiResponse;

    public function __construct(private PlanService $planService) {}

    /**
     * Display a paginated listing of plans.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Plan::class);

        $plans = $this->planService->paginate(
            $request->only(['search', 'is_active', 'per_page'])
        );

        return $this->successResponse(
            PlanResource::collection($plans)->response()->getData(true),
            'Plans retrieved successfully.'
        );
    }

    /**
     * Store a newly created plan.
     */
    public function store(StorePlanRequest $request): JsonResponse
    {
        $this->authorize('create', Plan::class);

        $plan = $this->planService->create($request->validated());

        return $this->successResponse(new PlanResource($plan), 'Plan created successfully.', 201);
    }

    /**
     * Display the specified plan.
     */
    public function show(Plan $plan): JsonResponse
    {
        $this->authorize('view', $plan);

        $plan->loadCount('subscriptions');

        return $this->successResponse(new PlanResource($plan), 'Plan retrieved successfully.');
    }

    /**
     * Update the specified plan.
     */
    public function update(UpdatePlanRequest $request, Plan $plan): JsonResponse
    {
        $this->authorize('update', $plan);

        $plan = $this->planService->update($plan, $request->validated());

        return $this->successResponse(new PlanResource($plan), 'Plan updated successfully.');
    }

    /**
     * Remove the specified plan.
     */
    public function destroy(Plan $plan): JsonResponse
    {
        $this->authorize('delete', $plan);

        try {
            $this->planService->delete($plan);
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(null, 'Plan deleted successfully.');
    }
}
