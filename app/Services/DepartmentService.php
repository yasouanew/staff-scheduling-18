<?php

namespace App\Services;

use App\Models\Department;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class DepartmentService
{
    /**
     * Get a paginated, filterable list of departments.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return Department::query()
            ->with('company')
            ->withCount('positions')
            ->when(! empty($filters['company_id']), fn ($query) => $query->where('company_id', $filters['company_id']))
            ->when(! empty($filters['search']), function ($query) use ($filters) {
                $search = $filters['search'];
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('code', 'like', "%{$search}%")
                        ->orWhere('description', 'like', "%{$search}%");
                });
            })
            ->when(! empty($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->latest()
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * Create a new department.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Department
    {
        return DB::transaction(fn () => Department::create($data));
    }

    /**
     * Update an existing department.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Department $department, array $data): Department
    {
        return DB::transaction(function () use ($department, $data) {
            $department->update($data);

            return $department->refresh();
        });
    }

    /**
     * Delete a department.
     */
    public function delete(Department $department): bool
    {
        return DB::transaction(fn () => (bool) $department->delete());
    }
}
