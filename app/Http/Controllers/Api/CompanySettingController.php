<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Company\UpdateCompanySettingRequest;
use App\Http\Resources\CompanySettingResource;
use App\Models\Company;
use App\Services\CompanyService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;

class CompanySettingController extends Controller
{
    use ApiResponse;

    public function __construct(private CompanyService $companyService) {}

    /**
     * Display the settings for the given company.
     */
    public function show(Company $company): JsonResponse
    {
        $this->authorize('view', $company);

        $settings = $this->companyService->getSettings($company);

        return $this->successResponse(
            new CompanySettingResource($settings),
            'Company settings retrieved successfully.'
        );
    }

    /**
     * Update the settings for the given company.
     */
    public function update(UpdateCompanySettingRequest $request, Company $company): JsonResponse
    {
        $this->authorize('update', $company);

        $settings = $this->companyService->updateSettings($company, $request->validated());

        return $this->successResponse(
            new CompanySettingResource($settings),
            'Company settings updated successfully.'
        );
    }
}
