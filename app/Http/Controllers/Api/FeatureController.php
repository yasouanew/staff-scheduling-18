<?php

namespace App\Http\Controllers\Api;

use App\Enums\Feature;
use App\Http\Controllers\Controller;
use App\Services\EntitlementService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Exposes the authenticated business's plan entitlements.
 *
 * This is the reference integration for the entitlement system: it returns
 * the resolved plan plus every feature the business can use, including
 * per-feature configuration and limits. The frontend reads this endpoint to
 * render/hide UI, but the backend enforcement happens in the EntitlementService
 * (via middleware, services, policies and jobs) — never on the client.
 */
class FeatureController extends Controller
{
    use ApiResponse;

    public function __construct(private EntitlementService $entitlements) {}

    /**
     * Return the entitlements for the authenticated user's company.
     */
    public function index(Request $request): JsonResponse
    {
        $company = $request->user()->company;

        if (! $company) {
            return $this->errorResponse('No company is associated with this account.', 403);
        }

        $plan = $this->entitlements->entitledPlan($company);

        $features = collect(Feature::cases())->map(function (Feature $feature) use ($company): array {
            $configuration = $this->entitlements->configuration($company, $feature);

            return [
                'key' => $feature->value,
                'label' => $feature->label(),
                'branch_scoped' => $feature->isBranchScoped(),
                'enabled' => $configuration !== null && $configuration['enabled'],
                'limit' => $configuration['limit'] ?? null,
            ];
        })->values();

        return $this->successResponse([
            'plan' => $plan ? [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'max_employees' => $plan->max_employees,
                'max_branches' => $plan->max_branches,
            ] : null,
            'entitled' => $this->entitlements->hasEntitledSubscription($company),
            'features' => $features,
        ], 'Entitlements retrieved successfully.');
    }

    /**
     * Reference endpoint demonstrating feature-gated middleware.
     *
     * Only reachable when the business plan enables ADVANCED_REPORTING; the
     * `feature:advanced_reporting` middleware rejects the request otherwise.
     */
    public function reporting(Request $request): JsonResponse
    {
        return $this->successResponse([
            'available' => true,
            'feature' => Feature::AdvancedReporting->value,
        ], 'Advanced reporting is enabled for your plan.');
    }

    /**
     * Shared 403 payload used when a feature is not available.
     */
    public static function unavailableResponse(string $feature): Response
    {
        return response()->json([
            'success' => false,
            'message' => 'Your current plan does not include access to this feature.',
            'code' => 'FEATURE_NOT_AVAILABLE',
            'data' => ['feature' => $feature],
        ], 403);
    }
}
