<?php

namespace App\Services;

use App\Models\Plan;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class PlanService
{
    /**
     * Get a paginated, filterable list of plans.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return Plan::query()
            ->withCount('subscriptions')
            ->when(! empty($filters['search']), fn ($q) => $q->where('name', 'like', "%{$filters['search']}%"))
            ->when(isset($filters['is_active']), fn ($q) => $q->where('is_active', filter_var($filters['is_active'], FILTER_VALIDATE_BOOLEAN)))
            ->orderBy('price_monthly')
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * Create a new plan.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Plan
    {
        return DB::transaction(fn () => Plan::create($data));
    }

    /**
     * Update an existing plan.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Plan $plan, array $data): Plan
    {
        return DB::transaction(function () use ($plan, $data) {
            $plan->update($data);

            return $plan->refresh();
        });
    }

    /**
     * Delete a plan. Plans with active subscriptions cannot be removed.
     */
    public function delete(Plan $plan): bool
    {
        if ($plan->subscriptions()->whereIn('status', ['active', 'trialing'])->exists()) {
            throw new \RuntimeException('Cannot delete a plan that has active subscriptions.');
        }

        return DB::transaction(fn () => (bool) $plan->delete());
    }
}
