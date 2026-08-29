<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ShiftTemplate\StoreShiftTemplateRequest;
use App\Http\Requests\ShiftTemplate\UpdateShiftTemplateRequest;
use App\Http\Resources\ShiftTemplateResource;
use App\Models\ShiftTemplate;
use App\Services\ShiftTemplateService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShiftTemplateController extends Controller
{
    use ApiResponse;

    public function __construct(private ShiftTemplateService $shiftTemplateService) {}

    /**
     * Display a paginated listing of shift templates.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', ShiftTemplate::class);

        $filters = $request->only(['search', 'status', 'company_id', 'branch_id', 'department_id', 'position_id', 'per_page']);

        // Non super admins can only see their own company's shift templates.
        if (! $request->user()->hasRole('super_admin')) {
            $filters['company_id'] = $request->user()->company_id;
        }

        $shiftTemplates = $this->shiftTemplateService->paginate($filters);

        return $this->successResponse(
            ShiftTemplateResource::collection($shiftTemplates)->response()->getData(true),
            'Shift templates retrieved successfully.'
        );
    }

    /**
     * Store a newly created shift template.
     */
    public function store(StoreShiftTemplateRequest $request): JsonResponse
    {
        $this->authorize('create', ShiftTemplate::class);

        $data = $request->validated();

        // Non super admins can only create shift templates for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        $data['created_by'] = $request->user()->id;

        $shiftTemplate = $this->shiftTemplateService->create($data);

        return $this->successResponse(
            new ShiftTemplateResource($shiftTemplate->load(['company', 'branch', 'department', 'position'])),
            'Shift template created successfully.',
            201
        );
    }

    /**
     * Display the specified shift template.
     */
    public function show(ShiftTemplate $shiftTemplate): JsonResponse
    {
        $this->authorize('view', $shiftTemplate);

        $shiftTemplate->load(['company', 'branch', 'department', 'position']);

        return $this->successResponse(
            new ShiftTemplateResource($shiftTemplate),
            'Shift template retrieved successfully.'
        );
    }

    /**
     * Update the specified shift template.
     */
    public function update(UpdateShiftTemplateRequest $request, ShiftTemplate $shiftTemplate): JsonResponse
    {
        $this->authorize('update', $shiftTemplate);

        $shiftTemplate = $this->shiftTemplateService->update($shiftTemplate, $request->validated());

        return $this->successResponse(
            new ShiftTemplateResource($shiftTemplate->load(['company', 'branch', 'department', 'position'])),
            'Shift template updated successfully.'
        );
    }

    /**
     * Remove the specified shift template.
     */
    public function destroy(ShiftTemplate $shiftTemplate): JsonResponse
    {
        $this->authorize('delete', $shiftTemplate);

        $this->shiftTemplateService->delete($shiftTemplate);

        return $this->successResponse(null, 'Shift template deleted successfully.');
    }
}
