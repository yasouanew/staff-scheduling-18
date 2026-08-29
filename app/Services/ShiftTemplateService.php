<?php

namespace App\Services;

use App\Models\ShiftTemplate;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class ShiftTemplateService
{
    /**
     * Get a paginated, filterable list of shift templates.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return ShiftTemplate::query()
            ->with(['company', 'branch', 'department', 'position'])
            ->when(! empty($filters['company_id']), fn ($query) => $query->where('company_id', $filters['company_id']))
            ->when(! empty($filters['branch_id']), fn ($query) => $query->where('branch_id', $filters['branch_id']))
            ->when(! empty($filters['department_id']), fn ($query) => $query->where('department_id', $filters['department_id']))
            ->when(! empty($filters['position_id']), fn ($query) => $query->where('position_id', $filters['position_id']))
            ->when(! empty($filters['search']), function ($query) use ($filters) {
                $search = $filters['search'];
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('description', 'like', "%{$search}%");
                });
            })
            ->when(! empty($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->latest()
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * Create a new shift template.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): ShiftTemplate
    {
        return DB::transaction(fn () => ShiftTemplate::create($data));
    }

    /**
     * Update an existing shift template.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(ShiftTemplate $shiftTemplate, array $data): ShiftTemplate
    {
        return DB::transaction(function () use ($shiftTemplate, $data) {
            $shiftTemplate->update($data);

            return $shiftTemplate->refresh();
        });
    }

    /**
     * Delete a shift template.
     */
    public function delete(ShiftTemplate $shiftTemplate): bool
    {
        return DB::transaction(fn () => (bool) $shiftTemplate->delete());
    }
}
