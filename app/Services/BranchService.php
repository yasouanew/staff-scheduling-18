<?php

namespace App\Services;

use App\Models\Branch;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class BranchService
{
    /**
     * Get a paginated, filterable list of branches.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return Branch::query()
            ->with(['company', 'manager'])
            // employees_count drives the "Staff" figure on every branch card,
            // so it must be counted in the list query, not only on show().
            ->withCount(['users', 'employees', 'shifts'])

            ->when(! empty($filters['company_id']), fn ($query) => $query->where('company_id', $filters['company_id']))
            ->when(! empty($filters['search']), function ($query) use ($filters) {
                $search = $filters['search'];
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%")
                        ->orWhere('address', 'like', "%{$search}%");
                });
            })
            ->when(! empty($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->latest()
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * Create a new branch.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Branch
    {
        return DB::transaction(fn () => Branch::create($data));
    }

    /**
     * Update an existing branch.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Branch $branch, array $data): Branch
    {
        return DB::transaction(function () use ($branch, $data) {
            $branch->update($data);

            return $branch->refresh();
        });
    }

    /**
     * Delete a branch.
     */
    public function delete(Branch $branch): bool
    {
        return DB::transaction(fn () => (bool) $branch->delete());
    }
}
