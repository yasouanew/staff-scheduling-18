<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SubscriptionPaymentResource;
use App\Models\Company;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Services\PaymentService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionPaymentController extends Controller
{
    use ApiResponse;

    public function __construct(private PaymentService $paymentService) {}

    /**
     * List payments for a subscription.
     */
    public function index(Request $request, Company $company, Subscription $subscription): JsonResponse
    {
        $this->authorize('view', [$subscription, $company]);

        $payments = $subscription->payments()
            ->latest()
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        return $this->successResponse(
            SubscriptionPaymentResource::collection($payments)->response()->getData(true),
            'Payments retrieved successfully.'
        );
    }

    /**
     * Refund a subscription payment.
     */
    public function refund(Request $request, Company $company, Subscription $subscription, SubscriptionPayment $payment): JsonResponse
    {
        $this->authorize('refund', [$subscription, $company]);

        if ((int) $payment->subscription_id !== (int) $subscription->id) {
            return $this->errorResponse('Payment does not belong to this subscription.', 404);
        }

        $validated = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:0.01'],
        ]);

        try {
            $payment = $this->paymentService->refund($payment, $validated['amount'] ?? null);
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(
            new SubscriptionPaymentResource($payment),
            'Payment refunded successfully.'
        );
    }
}
