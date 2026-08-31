<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Activitylog\Models\Activity;

class SuperAdminController extends Controller
{
    use ApiResponse;

    /**
     * Global subscriptions list for the platform administration surface.
     *
     * Super-admin only. Returns paginated subscriptions with the owning
     * company and plan loaded, plus aggregate branch usage (number of active
     * branch subscriptions) and seat capacity. This is a platform view, not a
     * company self-service surface.
     */
    public function subscriptions(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $query = Subscription::query()
            ->with(['company', 'plan'])
            ->withCount([
                'branchSubscriptions as active_branches_count' => function ($q) {
                    $q->where('status', 'active');
                },
            ])
            ->latest();

        // Optional filters (super-admin convenience).
        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('plan_id')) {
            $query->where('plan_id', $request->integer('plan_id'));
        }
        if ($request->filled('search')) {
            $search = $request->string('search');
            $query->whereHas('company', function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%");
            });
        }

        $subscriptions = $query->paginate($request->integer('per_page', 15))->withQueryString();

        return $this->successResponse(
            $this->paginatedEnvelope($subscriptions, function (Subscription $subscription) {
                $company = $subscription->company;
                $plan = $subscription->plan;

                return [
                    'id' => $subscription->id,
                    'company_id' => $subscription->company_id,
                    'user_id' => $subscription->user_id,
                    'plan_id' => $subscription->plan_id,
                    'stripe_id' => $subscription->stripe_id,
                    'stripe_status' => $subscription->stripe_status,
                    'stripe_price' => $subscription->stripe_price,
                    'quantity' => $subscription->quantity,
                    'status' => $subscription->status,
                    'billing_cycle' => $subscription->billing_cycle,
                    'on_trial' => $subscription->onTrial(),
                    'is_active' => $subscription->isActive(),
                    'is_cancelled' => $subscription->isCancelled(),
                    'starts_at' => $subscription->starts_at?->toIso8601String(),
                    'ends_at' => $subscription->ends_at?->toIso8601String(),
                    'trial_ends_at' => $subscription->trial_ends_at?->toIso8601String(),
                    'cancelled_at' => $subscription->cancelled_at?->toIso8601String(),
                    'company' => $company ? [
                        'id' => $company->id,
                        'name' => $company->name,
                        'status' => $company->status,
                    ] : null,
                    'plan' => $plan ? [
                        'id' => $plan->id,
                        'name' => $plan->name,
                        'slug' => $plan->slug,
                    ] : null,
                    'plan_name' => $plan?->name,
                    'active_branches_count' => (int) $subscription->active_branches_count,
                    'created_at' => $subscription->created_at?->toIso8601String(),
                    'updated_at' => $subscription->updated_at?->toIso8601String(),
                ];
            }),
            'Subscriptions retrieved successfully.'
        );
    }

    /**
     * Global payments list for the platform billing surface.
     *
     * Super-admin only. Returns paginated payments with the owning company,
     * subscription and plan resolved so a platform operator can trace an
     * invoice to its tenant and plan. `is_refundable` is preserved so a refund
     * action is only surfaced where the provider flow supports it.
     */
    public function payments(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $query = SubscriptionPayment::query()
            ->with(['subscription.company', 'subscription.plan'])
            ->latest('paid_at');

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('search')) {
            $search = $request->string('search');
            $query->whereHas('subscription.company', function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%");
            });
        }

        $payments = $query->paginate($request->integer('per_page', 15))->withQueryString();

        return $this->successResponse(
            $this->paginatedEnvelope($payments, function (SubscriptionPayment $payment) {
                $company = $payment->subscription?->company;
                $plan = $payment->subscription?->plan;

                return [
                    'id' => $payment->id,
                    'subscription_id' => $payment->subscription_id,
                    'amount' => $payment->amount,
                    'amount_refunded' => $payment->amount_refunded,
                    'currency' => $payment->currency,
                    'payment_provider' => $payment->payment_provider,
                    'provider_reference' => $payment->provider_reference,
                    'status' => $payment->status,
                    'is_refundable' => $payment->isRefundable(),
                    'is_refunded' => $payment->isRefunded(),
                    'paid_at' => $payment->paid_at?->toIso8601String(),
                    'refunded_at' => $payment->refunded_at?->toIso8601String(),
                    'company' => $company ? [
                        'id' => $company->id,
                        'name' => $company->name,
                        'status' => $company->status,
                    ] : null,
                    'plan' => $plan ? [
                        'id' => $plan->id,
                        'name' => $plan->name,
                    ] : null,
                    'created_at' => $payment->created_at?->toIso8601String(),
                ];
            }),
            'Payments retrieved successfully.'
        );
    }

    /**
     * Platform-level audit log.
     *
     * Super-admin only. Returns the platform-relevant events recorded through
     * the Spatie activity log: plan changed, subscription changed, payment
     * failed, refund issued, company suspended/reactivated, etc. Only the
     * high-level event rows are returned (not the per-entity change diffs
     * recorded for company admins).
     */
    public function audit(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $platformEvents = [
            'plan_changed',
            'plan_created',
            'plan_updated',
            'plan_deactivated',
            'plan_activated',
            'subscription_created',
            'subscription_cancelled',
            'subscription_resumed',
            'subscription_swapped',
            'payment_failed',
            'payment_succeeded',
            'refund_issued',
            'company_suspended',
            'company_reactivated',
            'company_created',
        ];

        $query = Activity::query()
            ->with(['causer', 'subject'])
            ->whereIn('event', $platformEvents)
            ->latest();

        if ($request->filled('event')) {
            $query->where('event', $request->string('event'));
        }
        if ($request->filled('search')) {
            $search = $request->string('search');
            $query->where(function ($q) use ($search) {
                $q->where('description', 'ilike', "%{$search}%")
                    ->orWhere('log_name', 'ilike', "%{$search}%");
            });
        }

        $logs = $query->paginate($request->integer('per_page', 20))->withQueryString();

        return $this->successResponse(
            $this->paginatedEnvelope($logs, function (Activity $log) {
                $subject = $log->subject;

                return [
                    'id' => $log->id,
                    'log_name' => $log->log_name,
                    'event' => $log->event,
                    'description' => $log->description,
                    'properties' => $log->properties?->toArray(),
                    'causer' => $log->causer ? [
                        'id' => $log->causer->id,
                        'name' => $log->causer->name,
                        'email' => $log->causer->email,
                    ] : null,
                    'subject' => $subject ? [
                        'type' => class_basename($subject),
                        'id' => $subject->getKey(),
                    ] : null,
                    'company' => $this->resolveCompanyFromSubject($log),
                    'created_at' => $log->created_at?->toIso8601String(),
                ];
            }),
            'Audit log retrieved successfully.'
        );
    }

    /**
     * Extended platform metrics for the super-admin dashboard.
     *
     * Computes MRR, ARR, recognized revenue and churn from real billing data
     * only (there is no fabricated data). MRR/ARR are derived from active
     * subscriptions' plan price for the subscription's billing cycle; revenue
     * is the sum of succeeded payments; churn counts active subscriptions
     * cancelled within the trailing 30-day window.
     */
    public function metrics(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $mrr = $this->computeMrr();
        $arr = $this->computeArr();
        $revenue = $this->computeRevenue();
        $churn = $this->computeChurn();

        return $this->successResponse([
            'scope' => 'platform',
            'metrics' => [
                'mrr' => $mrr,
                'arr' => $arr,
                'revenue' => $revenue,
                'churn' => $churn,
            ],
        ], 'Platform metrics retrieved successfully.');
    }

    /**
     * Ensure the request is made by a super administrator.
     */
    protected function ensureSuperAdmin(Request $request): void
    {
        $user = $request->user();

        abort_unless(
            $user && ($user->hasRole('super_admin') || $user->role === 'super_admin'),
            403,
            'Only super administrators can access platform administration.'
        );
    }

    /**
     * Build a standard paginated envelope (`data`, `links`, `meta`) from a
     * LengthAwarePaginator whose items are mapped through the given callback.
     *
     * @param  \Illuminate\Pagination\LengthAwarePaginator  $paginator
     * @param  callable  $mapper
     * @return array<string, mixed>
     */
    protected function paginatedEnvelope($paginator, callable $mapper): array
    {
        return [
            'data' => collect($paginator->items())->map($mapper)->values()->all(),
            'links' => $paginator->linkCollection()->toArray(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'from' => $paginator->firstItem(),
                'last_page' => $paginator->lastPage(),
                'links' => $paginator->linkCollection()->toArray(),
                'path' => $paginator->path(),
                'per_page' => $paginator->perPage(),
                'to' => $paginator->lastItem(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /**
     * Resolve the owning company for an audit row from its subject / properties.
     *
     * @return array<string, mixed>|null
     */
    protected function resolveCompanyFromSubject(Activity $log): ?array
    {
        $subject = $log->subject;
        if (! $subject) {
            return null;
        }

        if ($subject instanceof Company) {
            return ['id' => $subject->id, 'name' => $subject->name];
        }

        if ($subject instanceof Subscription) {
            $company = $subject->company;
            return $company ? ['id' => $company->id, 'name' => $company->name] : null;
        }

        if ($subject instanceof SubscriptionPayment) {
            $company = $subject->subscription?->company;
            return $company ? ['id' => $company->id, 'name' => $company->name] : null;
        }

        $properties = $log->properties;
        $companyId = $properties?->get('company_id');
        if ($companyId) {
            $company = Company::find($companyId);
            return $company ? ['id' => $company->id, 'name' => $company->name] : null;
        }

        return null;
    }

    /**
     * Compute monthly recurring revenue from active / trialing subscriptions.
     */
    protected function computeMrr(): float
    {
        $rows = Subscription::query()
            ->whereIn('status', ['active', 'trialing'])
            ->with('plan')
            ->get();

        $mrr = 0.0;
        foreach ($rows as $subscription) {
            $plan = $subscription->plan;
            if (! $plan) {
                continue;
            }
            $mrr += $this->cycleMonthlyPrice($plan, $subscription->billing_cycle);
        }

        return round($mrr, 2);
    }

    /**
     * Compute annual recurring revenue from the monthly recurring revenue.
     */
    protected function computeArr(): float
    {
        return round($this->computeMrr() * 12, 2);
    }

    /**
     * Compute recognized revenue as the sum of all succeeded payments.
     */
    protected function computeRevenue(): float
    {
        return round(
            (float) SubscriptionPayment::query()->where('status', 'succeeded')->sum('amount'),
            2
        );
    }

    /**
     * Compute trailing-30-day churn as a percentage of active subscriptions.
     */
    protected function computeChurn(): array
    {
        $activeTotal = Subscription::where('status', 'active')->count();
        $churned = Subscription::where('status', 'active')
            ->where('cancelled_at', '>=', now()->subDays(30))
            ->count();

        $rate = $activeTotal > 0
            ? round(($churned / $activeTotal) * 100, 2)
            : 0.0;

        return [
            'churned_count' => $churned,
            'active_base' => $activeTotal,
            'rate' => $rate,
        ];
    }

    /**
     * Normalize a plan's configured price to a monthly equivalent for the
     * subscription's billing cycle.
     */
    protected function cycleMonthlyPrice(Plan $plan, ?string $cycle): float
    {
        return match ($cycle) {
            'yearly' => (float) $plan->price_yearly / 12,
            'six_month' => (float) $plan->price_six_monthly / 6,
            default => (float) $plan->price_monthly,
        };
    }
}
