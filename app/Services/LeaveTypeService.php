<?php

namespace App\Services;

use App\Models\LeaveType;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class LeaveTypeService
{
    /**
     * Get a paginated, filterable list of leave types.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return LeaveType::query()
            ->with(['company'])
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
     * Create a new leave type.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): LeaveType
    {
        return DB::transaction(fn () => LeaveType::create($data));
    }

    /**
     * Update an existing leave type.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(LeaveType $leaveType, array $data): LeaveType
    {
        return DB::transaction(function () use ($leaveType, $data) {
            $leaveType->update($data);

            return $leaveType->refresh();
        });
    }

    /**
     * Delete a leave type.
     */
    public function delete(LeaveType $leaveType): bool
    {
        return DB::transaction(fn () => (bool) $leaveType->delete());
    }
}
