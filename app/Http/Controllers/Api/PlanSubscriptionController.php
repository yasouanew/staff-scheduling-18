<?php

namespace App\Http\Controllers\Api;

use App\Enums\Feature;
use App\Http\Controllers\Controller;
use App\Http\Requests\Billing\ChangeSubscriptionPlanRequest;
use App\Http\Resources\SubscriptionPaymentResource;
use App\Http\Resources\SubscriptionResource;
use App\Http\Resources\SubscriptionSummaryResource;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Services\BillingLifecycleService;
use App\Services\EntitlementService;
use App\Services\SubscriptionService;
use App\Services\UsageService;
use App\Traits\ApiResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Cashier\Cashier;

/**
 * The authenticated business's own subscription management surface.
 *
 * Unlike the super-admin `SubscriptionController` (which operates on an
 * explicit `companies/{company}` path), every endpoint here is scoped to the
 * caller's own company — the SPA never has to thread a company id through the
 * URL and a user can never target another business.
 *
 * Endpoints:
 *
 *   GET    subscription            → current plan, status, trial, usage, features
 *   GET    subscription/plans      → the active plan catalogue (billing values)
 *   GET    subscription/usage      → branch + per-branch employee usage
 *   GET    subscription/features   → feature access for the current plan
 *   POST   subscription/checkout   → open a hosted Stripe Checkout session
 *   POST   subscription/checkout/confirm → activate the local subscription after
 *                                          a paid Stripe Checkout redirect
 *   POST   subscription/upgrade    → switch to a larger / equal plan
 *   POST   subscription/downgrade  → switch to a smaller plan (usage-validated)
 *   POST   subscription/cancel     → cancel the subscription
 *   POST   subscription/resume     → resume a cancelled subscription
 *   POST   subscription/billing-period → change only the billing cycle
 *   POST   subscription/billing-portal → open the Stripe Customer Portal
 *   GET    subscription/payments   → the business's payment history
 *   GET    subscription/invoices   → the business's invoice history (payment rows)
 *
 * The whole self-service billing surface is intentionally registered outside
 * the `company.access` middleware so a locked company can still reach it to
 * reactivate (mirroring how the frontend allows `/subscription` for locked
 * companies). Permissions are enforced per-ability through SubscriptionPolicy,
 * never by route placement.
 *
 * Reads are guarded by `subscription.view`; mutations by `subscription.manage`
 * (both enforced through the existing SubscriptionPolicy). Employees and
 * ordinary branch managers never carry those permissions, so they cannot reach
 * billing mutations. Plan pricing is resolved from the database in the service
 * layer — the backend never trusts a client-supplied price.
 */
class PlanSubscriptionController extends Controller
{
    use ApiResponse;

    public function __construct(
        private SubscriptionService $subscriptionService,
        private EntitlementService $entitlements,
        private UsageService $usage,
        private BillingLifecycleService $lifecycle,
    ) {}

    /**
     * The business's current subscription summary.
     *
     * Resolves the entitled subscription, falling back to the company's most
     * recent subscription of any status, so a business whose subscription has
     * expired still receives its summary and full subscription history (and
     * can reactivate).
     */
    public function show(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('viewAny', [Subscription::class, $company]);

        $subscription = $this->resolveSubscriptionOrLatest($company);

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription),
            'Subscription retrieved successfully.'
        );
    }

    /**
     * The active plan catalogue with database pricing values.
     *
     * Stripe implementation ids are intentionally excluded — the SPA only needs
     * the display name, description, price, currency and allowances.
     */
    public function plans(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('viewAny', [Subscription::class, $company]);

        $plans = Plan::query()
            ->active()
            ->orderBy('sort_order')
            ->orderBy('price_monthly')
            ->get()
            ->map(fn (Plan $plan): array => [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'description' => $plan->description,
                'currency' => $plan->currency ?? 'AUD',
                'price_monthly' => $plan->price_monthly,
                'price_six_monthly' => $plan->price_six_monthly,
                'price_yearly' => $plan->price_yearly,
                'interval' => ['monthly', 'six_month', 'yearly'],
                'max_branches' => $plan->max_branches,
                'max_employees' => $plan->max_employees,
                'max_seats' => $plan->maxSeats(),
                'features' => $plan->features ?? [],
            ]);

        return $this->successResponse($plans, 'Plans retrieved successfully.');
    }

    /**
     * Seat + branch usage against the plan's allowances.
     *
     * Returns the per-seat (active-user) usage under `seats`, the billing
     * authority for the overhauled model:
     *
     *     { "seats": { "used": 4, "limit": 5 } }
     *
     * `used` is the count of active user accounts in the company (any role
     * except super_admin, with or without an employee profile — the founding
     * admin included). The legacy `branches` / `branches_usage` shape is
     * retained until the branch subsystem is removed.
     */
    public function usage(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('viewAny', [Subscription::class, $company]);

        $plan = $this->usage->entitledPlan($company);

        $branchesUsage = $company->branches()
            ->withCount(['employees as employees_used' => fn ($query) => $query->active()])
            ->get()
            ->map(fn ($branch) => [
                'id' => $branch->id,
                'name' => $branch->name,
                'active' => $this->entitlements->branchIsEntitled($branch),
                'employees_used' => (int) $branch->employees_used,
                'employee_capacity' => $this->entitlements->branchEmployeeCapacity($branch),
                'remaining' => $this->usage->remainingEmployeeCapacity($branch),
            ])
            ->values();

        return $this->successResponse([
            'seats' => $this->usage->seatUsage($company),
            'branches' => [
                'used' => $this->usage->activeBranches($company),
                'limit' => $plan?->max_branches,
            ],
            'branches_usage' => $branchesUsage,
        ], 'Usage retrieved successfully.');
    }

    /**
     * Feature access for the business's current plan.
     */
    public function features(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('viewAny', [Subscription::class, $company]);

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
            ] : null,
            'entitled' => $this->entitlements->hasEntitledSubscription($company),
            'features' => $features,
        ], 'Features retrieved successfully.');
    }

    /**
     * Server-computed proration estimate for switching to a selected plan/cycle.
     *
     * This powers the UpgradePlanDialog before any mutation: it reports the
     * "rest of the money" the business needs to pay now to match the target
     * plan for the current billing period (`amount_due`; negative = credit
     * back on a downgrade), plus the preserved renewal date (`renews_at`).
     *
     * The estimate is informational only — the billing provider remains
     * authoritative for the final charge. It is a read (no DB writes), so it
     * is safe to call repeatedly as the user changes the selected plan/cycle.
     */
    public function planChangeEstimate(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->requireSubscription($company);

        $this->authorize('viewAny', [Subscription::class, $company]);

        $validated = $request->validate([
            'plan_id' => ['required', 'integer', 'exists:plans,id'],
            'billing_cycle' => ['nullable', 'in:monthly,six_month,yearly'],
        ]);

        $plan = Plan::findOrFail($validated['plan_id']);

        $estimate = $this->subscriptionService->planChangeEstimate(
            $subscription,
            $plan,
            $validated['billing_cycle'] ?? null,
        );

        return $this->successResponse($estimate, 'Plan change estimate retrieved successfully.');
    }

    /**
     * Upgrade the subscription to a larger (or equal) plan.
     *
     * The target plan is resolved from the database by id; the backend decides
     * whether the change is an upgrade based on the plan's allowances, never on
     * a client-supplied price. Billing cycle may change in the same request.
     */
    public function upgrade(ChangeSubscriptionPlanRequest $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->requireSubscription($company);

        $this->authorize('update', [$subscription, $company]);

        $plan = Plan::findOrFail($request->validated()['plan_id']);

        $result = $this->subscriptionService->changePlanWithPayment(
            $subscription,
            $plan,
            $request->validated()['billing_cycle'] ?? null,
            $request->user(),
        );

        // When the Stripe customer has no default payment method the upgrade
        // cannot be charged in place — the response carries a hosted Checkout
        // URL for the prorated difference and the SPA redirects to it.
        if ($result['checkout_url']) {
            return $this->successResponse([
                'subscription' => new SubscriptionSummaryResource($result['subscription']),
                'plan_changed' => false,
                'charge' => null,
                'refund' => null,
                'checkout_url' => $result['checkout_url'],
            ], 'Payment required to complete the upgrade.', 200);
        }

        return $this->successResponse([
            'subscription' => new SubscriptionSummaryResource($result['subscription']),
            'plan_changed' => true,
            'charge' => $result['charge'],
            'refund' => $result['refund'],
            'checkout_url' => null,
        ], $result['charge']
            ? 'Subscription upgraded successfully. '.number_format($result['charge']['amount'], 2).' '.$result['charge']['currency'].' charged for the rest of the current period.'
            : 'Subscription upgraded successfully.');
    }

    /**
     * Downgrade the subscription to a smaller plan.
     *
     * Rejected (structured BillingLimitException, 422) when the business
     * currently uses more active branches than the target plan's max_branches,
     * or has more active employees than the target plan's max_employees.
     */
    public function downgrade(ChangeSubscriptionPlanRequest $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->requireSubscription($company);

        $this->authorize('update', [$subscription, $company]);

        $plan = Plan::findOrFail($request->validated()['plan_id']);

        $result = $this->subscriptionService->changePlanWithPayment(
            $subscription,
            $plan,
            $request->validated()['billing_cycle'] ?? null,
            $request->user(),
        );

        $refund = $result['refund'];

        return $this->successResponse([
            'subscription' => new SubscriptionSummaryResource($result['subscription']),
            'plan_changed' => true,
            'charge' => $result['charge'],
            'refund' => $refund,
            'checkout_url' => $result['checkout_url'],
        ], $refund
            ? 'Subscription downgraded successfully. '.number_format($refund['amount'], 2).' '.$refund['currency'].' refunded for the rest of the current period.'
            : 'Subscription downgraded successfully.');
    }

    /**
     * Change only the billing cycle while keeping the current plan.
     *
     * Routes through {@see SubscriptionService::changeBillingPeriod()} (and thus
     * the same validated plan-change path as upgrade/downgrade), so the cycle
     * change is reconciled with Stripe and never bypasses the domain rules.
     */
    public function billingPeriod(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->requireSubscription($company);

        $this->authorize('update', [$subscription, $company]);

        $validated = $request->validate([
            'billing_cycle' => ['required', 'in:monthly,six_month,yearly'],
        ]);

        $subscription = $this->subscriptionService->changeBillingPeriod(
            $subscription,
            $validated['billing_cycle'],
            $request->user(),
        );

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription),
            'Subscription billing period updated successfully.'
        );
    }

    /**
     * Cancel the business's subscription.
     *
     * Cancels at the end of the current billing period by default; pass
     * `immediately = true` to cancel right away.
     */
    public function cancel(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->requireSubscription($company);

        $this->authorize('update', [$subscription, $company]);

        $subscription = $this->subscriptionService->cancel(
            $subscription,
            $request->boolean('immediately', false),
        );

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription),
            'Subscription cancelled successfully.'
        );
    }

    /**
     * Open the Stripe Customer Portal for the business.
     *
     * The portal lets the company admin self-serve payment-method changes,
     * invoice history and card updates. Subscription / entitlement state stays
     * authoritative in the local application; the portal only manages the
     * payment relationship.
     */
    public function billingPortal(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->resolveSubscriptionOrLatest($company);

        // An expired subscription still resolves here so the admin can open
        // the Stripe portal to update payment methods / pay and reactivate.
        abort_unless($subscription, 404, 'No active subscription exists for this business.');

        $this->authorize('update', [$subscription, $company]);

        try {
            $portalUrl = $this->subscriptionService->billingPortal($company, $request->user());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(['url' => $portalUrl], 'Billing portal session created successfully.');
    }

    /**
     * Start a hosted Stripe Checkout session to subscribe (or reactivate) the
     * business.
     *
     * This is the primary reactivation path for a locked company, which is why
     * the route lives outside `company.access`. Plan, cycle and pricing are
     * resolved from the database; {@see SubscriptionService::startCheckout()}
     * pre-flights a plan change so a checkout can never bypass the branch /
     * employee allowance validation.
     */
    public function checkout(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('create', [Subscription::class, $company]);

        $validated = $request->validate([
            'plan_id' => ['required', 'integer', 'exists:plans,id'],
            'billing_cycle' => ['required', 'in:monthly,six_month,yearly'],
            'trial_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $plan = Plan::findOrFail($validated['plan_id']);

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

    /**
     * Resume a cancelled subscription.
     *
     * A cancelled subscription is no longer "entitled" (so it can't be found
     * through the entitlement resolution), so we resolve the business's most
     * recent cancelled subscription directly. {@see SubscriptionService::resume()}
     * reconciles the state with Stripe when the subscription is provider-backed.
     */
    public function resume(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $subscription = $company->subscriptions()
            ->whereNotNull('cancelled_at')
            ->latest()
            ->first();

        abort_unless($subscription, 404, 'No cancelled subscription exists for this business.');

        $this->authorize('update', [$subscription, $company]);

        $subscription = $this->subscriptionService->resume($subscription);

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription),
            'Subscription resumed successfully.'
        );
    }

    /**
     * Confirm a successful Stripe Checkout session and activate the local
     * subscription without waiting for the Stripe webhook.
     *
     * Stripe redirects the user back to the SPA with
     * `?checkout=success&session_id=cs_...` after a completed payment.  This
     * endpoint retrieves the Checkout session, verifies payment was actually
     * made, and drives the same local state transition that the webhook's
     * `checkout.session.completed` + `invoice.paid` pair would have triggered.
     *
     * This is the primary fix for environments where `STRIPE_WEBHOOK_SECRET` is
     * not configured (the webhook handler returns 503) — the subscription row
     * that was created in `incomplete` state by `checkout()` is activated
     * immediately, a `SubscriptionPayment` row is recorded (fixing the invoice
     * page), and the company is unlocked.
     */
    public function confirmCheckout(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $validated = $request->validate([
            'session_id' => ['required', 'string'],
        ]);

        // Locate the local subscription that this checkout created.  It must
        // belong to the caller's company and still be in `incomplete` status.
        $subscription = $company->subscriptions()
            ->where('checkout_session_id', $validated['session_id'])
            ->where('status', 'incomplete')
            ->first();

        // No incomplete row? The session may be a one-off `purpose: plan_change`
        // checkout — opened to collect the prorated upgrade difference while
        // the company's subscription was already active (it never becomes
        // `incomplete`). Apply the deferred plan change once the money is paid.
        if (! $subscription) {
            return $this->confirmPlanChangeCheckout($company, $validated['session_id']);
        }

        $this->authorize('update', [$subscription, $company]);

        // Retrieve the Stripe Checkout session with the subscription and its
        // latest invoice expanded so we can extract the invoice array.
        try {
            $session = Cashier::stripe()->checkout->sessions->retrieve(
                $validated['session_id'],
                ['expand' => ['subscription', 'subscription.latest_invoice.payment_intent', 'line_items']],
            );
        } catch (\Exception $e) {
            return $this->errorResponse('Failed to retrieve checkout session from Stripe.', 502);
        }

        if (($session->payment_status ?? 'unpaid') !== 'paid') {
            return $this->errorResponse('Checkout session has not been paid yet.', 422);
        }

        // Update the local subscription with the Stripe subscription id.
        $stripeSubId = $session->subscription->id ?? null;

        if (is_string($stripeSubId)) {
            $subscription->stripe_id = $stripeSubId;
        }

        $subscription->checkout_session_id = $session->id;
        $subscription->save();

        // Build the invoice array in the shape that BillingLifecycleService
        // expects, mirroring StripeBillingWebhookController::invoiceArray().
        $invoice = $session->subscription->latest_invoice ?? null;
        $invoiceArray = $invoice ? [
            'id' => $invoice->id ?? null,
            'amount_due' => $invoice->amount_due ?? null,
            'amount_paid' => $invoice->amount_paid ?? null,
            'currency' => $invoice->currency ?? 'AUD',
            'payment_intent' => $invoice->payment_intent->id ?? null,
        ] : [];

        // Also capture the period start/end from the Stripe subscription.
        $periodStart = isset($session->subscription->current_period_start)
            ? (int) $session->subscription->current_period_start
            : null;
        $periodEnd = isset($session->subscription->current_period_end)
            ? (int) $session->subscription->current_period_end
            : null;

        // Drive the same lifecycle transition that handleInvoicePaid does.
        $this->lifecycle->markPaid($subscription, $invoiceArray, $periodStart, $periodEnd);

        // Mirror the webhook's activateSubscription logic so company admins
        // are notified and the company is unlocked (markPaid already unlocks
        // the company, but the notification flag is separate).
        if ($subscription->activation_notified_at === null) {
            $subscription->update(['activation_notified_at' => now()]);
        }

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription->fresh()->load('plan')),
            'Subscription activated successfully.',
        );
    }

    /**
     * Confirm a one-off `purpose: plan_change` Checkout session.
     *
     * Fallback path for environments where the Stripe webhook is not
     * configured: the SPA redirects back from the hosted payment with
     * `?checkout=success&session_id=...`, and this retrieves the session from
     * Stripe, verifies it was actually paid, then applies the deferred plan
     * change (allowances re-validated) and records the collected proration
     * money as an invoice row.
     */
    private function confirmPlanChangeCheckout(Company $company, string $sessionId): JsonResponse
    {
        // The one-off session's id was persisted on the subscription row when
        // the deferred plan change was opened (see SubscriptionService::
        // changePlanWithCheckout()).
        $subscription = $company->subscriptions()
            ->where('checkout_session_id', $sessionId)
            ->first();

        abort_unless($subscription, 404, 'No matching subscription found for this checkout session.');

        $this->authorize('update', [$subscription, $company]);

        try {
            $session = Cashier::stripe()->checkout->sessions->retrieve($sessionId, []);
        } catch (\Exception $e) {
            return $this->errorResponse('Failed to retrieve checkout session from Stripe.', 502);
        }

        if (($session->metadata->purpose ?? null) !== 'plan_change') {
            abort(404, 'No matching incomplete subscription found for this checkout session.');
        }

        if (($session->payment_status ?? 'unpaid') !== 'paid') {
            return $this->errorResponse('Checkout session has not been paid yet.', 422);
        }

        $planId = (string) ($session->metadata->plan_id ?? '');

        if ($planId === '') {
            return $this->errorResponse('The checkout session does not carry a plan change.', 422);
        }

        try {
            $subscription = $this->subscriptionService->completePlanChangeCheckout(
                $subscription,
                $planId,
                (string) ($session->metadata->billing_cycle ?? $subscription->billing_cycle),
                [
                    'id' => $session->id,
                    'amount_paid' => $session->amount_total ?? 0,
                    'currency' => $session->currency ?? 'aud',
                    'payment_intent' => is_string($session->payment_intent ?? null) ? $session->payment_intent : null,
                ],
            );
        } catch (\Throwable $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription->load('plan')),
            'Plan change applied successfully.',
        );
    }

    /**
     * Resume an unfinished Stripe Checkout attempt.
     *
     * When a hosted checkout is abandoned mid-payment the local subscription
     * row stays `incomplete` and the `/subscription` page would otherwise be
     * stuck with nothing actionable. This endpoint closes the abandoned attempt
     * and opens a fresh Stripe Checkout session for the SAME plan and billing
     * cycle, returning the new session so the SPA can redirect to it — the same
     * shape as the `checkout` response.
     */
    public function retryCheckout(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('create', [Subscription::class, $company]);

        try {
            $checkout = $this->subscriptionService->retryCheckout($company, $request->user());
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse([
            'subscription' => new SubscriptionResource($checkout['subscription']->load('plan')),
            'checkout_url' => $checkout['checkout_url'],
            'checkout_session_id' => $checkout['checkout_session_id'],
        ], 'Checkout session created successfully.', 201);
    }

    /**
     * Abandon an unfinished checkout attempt.
     *
     * Marks the company's pending `incomplete` subscription row `expired` so
     * the admin can dismiss the payment prompt and choose any plan freely.
     */
    public function discardIncomplete(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);

        $this->authorize('create', [Subscription::class, $company]);

        try {
            $this->subscriptionService->discardIncomplete($company);
        } catch (\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        $subscription = $this->subscriptionService->entitledSubscription($company)
            ?? $company->subscriptions()->latest('starts_at')->latest('id')->first();

        return $this->successResponse(
            new SubscriptionSummaryResource($subscription),
            'Pending checkout discarded successfully.'
        );
    }

    /**
     * The business's payment history (paginated).
     *
     * Covers every subscription the company has ever had — including expired
     * and superseded ones — so the SPA's Invoices tab keeps working (and keeps
     * its full history) after the entitlement lapses. Each row carries its
     * owning subscription's status + period dates so the Invoices tab can
     * badge the subscription state ("Expired", "Active", …) and show the
     * subscription / expiry dates next to every invoice.
     */
    public function payments(Request $request): JsonResponse
    {
        $company = $this->resolveCompany($request);
        $subscription = $this->resolveSubscriptionOrLatest($company);

        abort_unless($subscription, 404, 'No active subscription exists for this business.');

        $this->authorize('view', [$subscription, $company]);

        // Invoice history spans every subscription the company has ever had —
        // including expired and superseded ones — so renewals keep their full
        // billing trail visible instead of hiding payments from old periods.
        $payments = SubscriptionPayment::query()
            ->whereHas('subscription', fn (Builder $query) => $query->where('company_id', $company->id))
            ->with('subscription')
            ->latest()
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        return $this->successResponse(
            SubscriptionPaymentResource::collection($payments)->response()->getData(true),
            'Payments retrieved successfully.'
        );
    }

    /**
     * The business's invoice history.
     *
     * There is no separate invoice store — every paid / pending / failed charge
     * is a local `subscription_payments` row, so invoices are the same records
     * surfaced through {@see self::payments()}. Kept as a distinct endpoint for
     * a complete, self-describing billing surface.
     */
    public function invoices(Request $request): JsonResponse
    {
        return $this->payments($request);
    }

    /**
     * Resolve the company the request acts on.
     *
     * Non super admins are always scoped to their own company; super admins
     * fall back to their own company as well (they may use the dedicated
     * companies/{company} subscription routes for cross-tenant management).
     */
    protected function resolveCompany(Request $request): Company
    {
        $company = $request->user()->company;

        if (! $company) {
            abort(403, 'No company is associated with this account.');
        }

        return $company;
    }

    /**
     * The business's entitled subscription, or a 404 when unsubscribed.
     */
    protected function requireSubscription(Company $company): Subscription
    {
        $subscription = $this->subscriptionService->entitledSubscription($company);

        abort_unless($subscription, 404, 'No active subscription exists for this business.');

        return $subscription;
    }

    /**
     * Resolve the subscription a read / portal surface should act on.
     *
     * Returns the currently entitled subscription when one exists, otherwise
     * falls back to the company's most recent subscription of ANY status — an
     * expired or suspended subscription still has a summary, invoices and a
     * billing portal the admin must be able to reach so they can reactivate.
     *
     * Returns null only when the company has never had a subscription, which
     * callers translate into their existing 404 behaviour.
     */
    protected function resolveSubscriptionOrLatest(Company $company): ?Subscription
    {
        return $this->subscriptionService->entitledSubscription($company)
            ?? $company->subscriptions()
                ->latest('starts_at')
                ->latest('id')
                ->first();
    }
}
