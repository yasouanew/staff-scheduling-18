<?php

namespace App\Services;

use App\Models\Company;
use App\Models\CompanySetting;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class CompanyService
{
    /**
     * Get a paginated, filterable list of companies.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = [], ?int $companyId = null): LengthAwarePaginator
    {
        $perPage = min(max((int) ($filters['per_page'] ?? 15), 1), 100);

        return Company::query()
            ->withCount(['branches', 'employees', 'users'])
            ->when($companyId, fn ($query) => $query->whereKey($companyId))
            ->when(! empty($filters['search']), function ($query) use ($filters) {
                $search = $filters['search'];
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%")
                        ->orWhere('abn', 'like', "%{$search}%");
                });
            })
            ->when(! empty($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->when(! empty($filters['business_type']), fn ($query) => $query->where('business_type', $filters['business_type']))
            ->latest()
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * Create a new company.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Company
    {
        return DB::transaction(fn () => Company::create($data));
    }

    /**
     * Update an existing company.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Company $company, array $data): Company
    {
        return DB::transaction(function () use ($company, $data) {
            $company->update($data);

            return $company->refresh();
        });
    }

    /**
     * Delete a company.
     */
    public function delete(Company $company): bool
    {
        return DB::transaction(fn () => (bool) $company->delete());
    }

    /**
     * Get (and create if missing) the settings for a company.
     */
    public function getSettings(Company $company): CompanySetting
    {
        return $company->settings()->firstOrCreate(['company_id' => $company->id]);
    }

    /**
     * Update the settings for a company.
     *
     * @param  array<string, mixed>  $data
     */
    public function updateSettings(Company $company, array $data): CompanySetting
    {
        return DB::transaction(function () use ($company, $data) {
            $settings = $company->settings()->firstOrCreate(['company_id' => $company->id]);
            $settings->update($data);

            return $settings->refresh();
        });
    }
}
