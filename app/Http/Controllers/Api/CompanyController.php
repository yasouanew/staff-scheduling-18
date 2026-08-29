<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Company\StoreCompanyRequest;
use App\Http\Requests\Company\UpdateCompanyRequest;
use App\Http\Resources\CompanyResource;
use App\Models\Company;
use App\Services\CompanyService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyController extends Controller
{
    use ApiResponse;

    public function __construct(private CompanyService $companyService) {}

    /**
     * Display a paginated listing of companies.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Company::class);

        $companyScope = $request->user()->hasRole('super_admin')
            ? null
            : $request->user()->company_id;

        $companies = $this->companyService->paginate(
            $request->only(['search', 'status', 'business_type', 'per_page']),
            $companyScope,
        );

        return $this->successResponse(
            CompanyResource::collection($companies)->response()->getData(true),
            'Companies retrieved successfully.'
        );
    }

    /**
     * Store a newly created company.
     */
    public function store(StoreCompanyRequest $request): JsonResponse
    {
        $this->authorize('create', Company::class);

        $company = $this->companyService->create($request->validated());

        return $this->successResponse(
            new CompanyResource($company),
            'Company created successfully.',
            201
        );
    }

    /**
     * Display the specified company.
     */
    public function show(Company $company): JsonResponse
    {
        $this->authorize('view', $company);

        $company->loadCount(['branches', 'employees', 'users'])->load('settings');

        return $this->successResponse(
            new CompanyResource($company),
            'Company retrieved successfully.'
        );
    }

    /**
     * Update the specified company.
     */
    public function update(UpdateCompanyRequest $request, Company $company): JsonResponse
    {
        $this->authorize('update', $company);

        $company = $this->companyService->update($company, $request->validated());

        return $this->successResponse(
            new CompanyResource($company),
            'Company updated successfully.'
        );
    }

    /**
     * Remove the specified company.
     */
    public function destroy(Company $company): JsonResponse
    {
        $this->authorize('delete', $company);

        $this->companyService->delete($company);

        return $this->successResponse(null, 'Company deleted successfully.');
    }
}
