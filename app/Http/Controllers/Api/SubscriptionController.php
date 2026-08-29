<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SubscriptionResource;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Services\SubscriptionService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    use ApiResponse;

    public function __construct(private SubscriptionService $subscriptionService) {}

    /**
     * List subscriptions for a company.
     */
    public function index(Request $request, Company $company): JsonResponse
    {
        $this->authorize('viewAny', [Subscription::class, $company]);

        $subscriptions = $company->subscriptions()
            ->with('plan')
            ->latest()
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        return $this->successResponse(
            SubscriptionResource::collection($subscriptions)->response()->getData(true),
            'Subscriptions retrieved successfully.'
        );
    }

    /**
     * Subscribe a company to a plan.
     */
    public function store(Request $request, Company $company): JsonResponse
    {
        $this->authorize('create', [Subscription::class, $company]);

        $validated = $request->validate([
            'plan_id' => ['required', 'integer', 'exists:plans,id'],
            'billing_cycle' => ['required', 'in:monthly,six_month,yearly'],
            'payment_method' => ['nullable', 'string'],
            'checkout' => ['nullable', 'boolean'],
            'trial_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $plan = Plan::findOrFail($validated['plan_id']);

        if ($request->boolean('checkout')) {
            try {
                $checkout = $this->subscriptionService->startCheckout(
                    $company,
                    $request->user(),
                    $plan,
                    $validated['billing_cycle'],
                    $validated['trial_days'] ?? null,
                );
            } catch (\RuntimeException $e) {
                return $this->errorResponse($e->getMessage(), 422);
            }

            return $this->successResponse([
                'subscription' => new SubscriptionResource($checkout['subscription']->load('plan')),
                'checkout_url' => $checkout['checkout_url'],
                'checkout_session_id' => $checkout['checkout_session_id'],
            ], 'Stripe Checkout session created successfully.', 201);
        }

        $subscription = $this->subscriptionService->subscribe(
            $company,
            $request->user(),
            $plan,
            $validated
        );

        return $this->successResponse(
            new SubscriptionResource($subscription->load('plan')),
            'Subscription created successfully.',
            201
        );
    }

    /**
     * Show a single subscription.
     */
    public function show(Company $company, Subscription $subscription): JsonResponse
    {
        $this->authorize('view', [$subscription, $company]);

        return $this->successResponse(
            new SubscriptionResource($subscription->load(['plan', 'payments'])),
            'Subscription retrieved successfully.'
        );
    }

    /**
     * Cancel a subscription.
     */
    public function cancel(Request $request, Company $company, Subscription $subscription): JsonResponse
    {
        $this->authorize('update', [$subscription, $company]);

        $immediately = $request->boolean('immediately', false);

        $subscription = $this->subscriptionService->cancel($subscription, $immediately);

        return $this->successResponse(
            new SubscriptionResource($subscription->load('plan')),
            'Subscription cancelled successfully.'
        );
    }

    /**
     * Resume a cancelled subscription.
     */
    public function resume(Company $company, Subscription $subscription): JsonResponse
    {
        $this->authorize('update', [$subscription, $company]);

        if (! $subscription->isCancelled()) {
            return $this->errorResponse('Subscription is not cancelled.', 422);
        }

        $subscription = $this->subscriptionService->resume($subscription);

        return $this->successResponse(
            new SubscriptionResource($subscription->load('plan')),
            'Subscription resumed successfully.'
        );
    }

    /**
     * Swap the subscription to a different plan.
     */
    public function swap(Request $request, Company $company, Subscription $subscription): JsonResponse
    {
        $this->authorize('update', [$subscription, $company]);

        $validated = $request->validate([
            'plan_id' => ['required', 'integer', 'exists:plans,id'],
            'billing_cycle' => ['nullable', 'in:monthly,six_month,yearly'],
        ]);

        $plan = Plan::findOrFail($validated['plan_id']);

        $subscription = $this->subscriptionService->swap(
            $subscription,
            $plan,
            $validated['billing_cycle'] ?? null
        );

        return $this->successResponse(
            new SubscriptionResource($subscription->load('plan')),
            'Subscription swapped successfully.'
        );
    }
}
