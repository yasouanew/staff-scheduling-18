<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Branch\StoreBranchRequest;
use App\Http\Requests\Branch\UpdateBranchRequest;
use App\Http\Resources\BranchResource;
use App\Models\Branch;
use App\Services\BranchService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    use ApiResponse;

    public function __construct(private BranchService $branchService) {}

    /**
     * Display a paginated listing of branches.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Branch::class);

        $filters = $request->only(['search', 'status', 'company_id', 'per_page']);

        // Non super admins can only see their own company's branches.
        if (! $request->user()->hasRole('super_admin')) {
            $filters['company_id'] = $request->user()->company_id;
        }

        $branches = $this->branchService->paginate($filters);

        return $this->successResponse(
            BranchResource::collection($branches)->response()->getData(true),
            'Branches retrieved successfully.'
        );
    }

    /**
     * Store a newly created branch.
     */
    public function store(StoreBranchRequest $request): JsonResponse
    {
        $this->authorize('create', Branch::class);

        $data = $request->validated();

        // Non super admins can only create branches for their own company.
        if (! $request->user()->hasRole('super_admin')) {
            $data['company_id'] = $request->user()->company_id;
        }

        $branch = $this->branchService->create($data);

        return $this->successResponse(
            new BranchResource($branch->load(['company', 'manager'])),
            'Branch created successfully.',
            201
        );
    }

    /**
     * Display the specified branch.
     */
    public function show(Branch $branch): JsonResponse
    {
        $this->authorize('view', $branch);

        // `employees` is the authoritative staff count for a branch; `users` only
        // covers directly provisioned accounts and is kept for backwards compatibility.
        $branch->loadCount(['users', 'employees', 'shifts'])->load(['company', 'manager']);


        return $this->successResponse(
            new BranchResource($branch),
            'Branch retrieved successfully.'
        );
    }

    /**
     * Update the specified branch.
     */
    public function update(UpdateBranchRequest $request, Branch $branch): JsonResponse
    {
        $this->authorize('update', $branch);

        $branch = $this->branchService->update($branch, $request->validated());

        return $this->successResponse(
            new BranchResource($branch->load(['company', 'manager'])),
            'Branch updated successfully.'
        );
    }

    /**
     * Remove the specified branch.
     */
    public function destroy(Branch $branch): JsonResponse
    {
        $this->authorize('delete', $branch);

        $this->branchService->delete($branch);

        return $this->successResponse(null, 'Branch deleted successfully.');
    }
}
