<?php

namespace App\Services;

use App\Models\Position;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class PositionService
{
    /**
     * Get a paginated, filterable list of positions.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return Position::query()
            ->with(['company', 'department'])
            ->when(! empty($filters['company_id']), fn ($query) => $query->where('company_id', $filters['company_id']))
            ->when(! empty($filters['department_id']), fn ($query) => $query->where('department_id', $filters['department_id']))
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
     * Create a new position.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Position
    {
        return DB::transaction(fn () => Position::create($data));
    }

    /**
     * Update an existing position.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Position $position, array $data): Position
    {
        return DB::transaction(function () use ($position, $data) {
            $position->update($data);

            return $position->refresh();
        });
    }

    /**
     * Delete a position.
     */
    public function delete(Position $position): bool
    {
        return DB::transaction(fn () => (bool) $position->delete());
    }
}
