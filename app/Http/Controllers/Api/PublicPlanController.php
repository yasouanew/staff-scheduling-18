<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;

class PublicPlanController extends Controller
{
    use ApiResponse;

    /**
     * Return the active public plan catalogue used by the marketing site.
     * Stripe implementation identifiers remain private to the billing console.
     */
    public function index(): JsonResponse
    {
        $plans = Plan::query()
            ->where('is_active', true)
            ->orderBy('price_monthly')
            ->get()
            ->map(fn (Plan $plan): array => [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'price_monthly' => $plan->price_monthly,
                'price_yearly' => $plan->price_yearly,
                'max_employees' => $plan->max_employees,
                'max_branches' => $plan->max_branches,
                'features' => $plan->features ?? [],
            ]);

        return $this->successResponse($plans, 'Public plans retrieved successfully.');
    }
}
