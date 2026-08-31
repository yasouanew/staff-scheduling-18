# Task 14 — Stripe Billing as the Canonical Commercial Payment Flow

## Outcome

Stripe Billing is now the canonical, single commercial payment flow. The existing
Cashier-backed integration was inspected and extended (not duplicated); the
provider/local state gap was closed with webhook plan reconciliation; hosted
checkout can no longer bypass the upgrade/downgrade allowance rules; and the
Stripe Customer Portal is exposed for company-admin self-service of the payment
relationship.

All billing tests pass: **164 tests, 480 assertions, OK** (PHP 8.3, SQLite in-memory).

---

## Requirement → Implementation map

| # | Requirement | Status | Where |
|---|-------------|--------|-------|
| 1 | Reuse the existing Stripe integration (no second integration) | ✅ already present | [`BillingProvider`](../app/Billing/BillingProvider.php:18) → [`StripeBillingProvider`](../app/Billing/StripeBillingProvider.php:18) (Cashier) |
| 2 | Customer creation — idempotent per-company Stripe customer, no duplicates | ✅ already present | `StripeBillingProvider::startCheckout` / `billingPortal` via `createOrGetStripeCustomer()` ([`StripeBillingProvider.php:48`](../app/Billing/StripeBillingProvider.php:48)) |
| 3 | Checkout — backend-validated, authoritative pricing, never trust frontend | ✅ strengthened | [`SubscriptionController::store`](../app/Http/Controllers/Api/SubscriptionController.php:43); [`SubscriptionService::startCheckout`](../app/Services/SubscriptionService.php:86) |
| 4 | Upgrade — provider update → webhook → local state | ✅ strengthened | [`SubscriptionService::changePlan`](../app/Services/SubscriptionService.php:311) + webhook `reconcilePlanFromProvider` |
| 5 | Downgrade — prevent invalid downgrades (branch/capacity) | ✅ already present + checkout guard | [`SubscriptionService::assertCanChangeToPlan`](../app/Services/SubscriptionService.php:380) |
| 6 | Cancellation — immediate and/or period-end, keep customer data | ✅ already present | [`SubscriptionService::cancel`](../app/Services/SubscriptionService.php:240); [`StripeBillingProvider::cancel`](../app/Billing/StripeBillingProvider.php:117) |
| 7 | Resume/reactivate — synchronize Stripe and local state | ✅ already present | [`SubscriptionService::resume`](../app/Services/SubscriptionService.php:273); [`StripeBillingProvider::resume`](../app/Billing/StripeBillingProvider.php:128) |
| 8 | Payment failure → past_due → grace → suspended (configurable) | ✅ already present | [`BillingLifecycleService`](../app/Services/BillingLifecycleService.php:28) + [`config/billing.php`](../config/billing.php) + `billing:enforce-payment-lifecycle` |
| 9 | Webhook — signature, idempotency, duplicates, correct subscription/company lookup | ✅ already present + reconcile | [`StripeBillingWebhookController`](../app/Http/Controllers/Api/StripeBillingWebhookController.php:33) |
| 10 | Payment records — synchronize, no fake records | ✅ already present | `BillingLifecycleService::upsertPayment` (skips synthetic no-reference invoices) |
| 11 | Billing Portal — expose for company admins | ✅ **new** | [`BillingProvider::billingPortal`](../app/Billing/BillingProvider.php:75); [`StripeBillingProvider::billingPortal`](../app/Billing/StripeBillingProvider.php:153); [`SubscriptionService::billingPortal`](../app/Services/SubscriptionService.php:457); [`PlanSubscriptionController::billingPortal`](../app/Http/Controllers/Api/PlanSubscriptionController.php:296); route [`routes/api.php:206`](../routes/api.php:206) |
| 12 | Tests — checkout, upgrade, downgrade, cancellation, resume, payment success/failure, duplicate webhook, invalid webhook, provider/local mismatch | ✅ | see Tests |

---

## Changes made

### 1. Billing Portal (requirement 11)

- **Interface** — added `billingPortal(User $user, ?string $returnUrl = null): string` to
  [`BillingProvider`](../app/Billing/BillingProvider.php:75).
- **Cashier implementation** — [`StripeBillingProvider::billingPortal`](../app/Billing/StripeBillingProvider.php:153)
  creates an idempotent Stripe customer then a Customer Portal session with a
  configured `return_url` (frontend URL), returning the hosted session URL.
- **Service** — [`SubscriptionService::billingPortal`](../app/Services/SubscriptionService.php:457)
  requires an entitled subscription (else 422) and computes the return URL as
  `{frontend_url}/companies/{company}/subscriptions?portal=return`.
- **Controller + route** — [`PlanSubscriptionController::billingPortal`](../app/Http/Controllers/Api/PlanSubscriptionController.php:296)
  authorizes `update` on the subscription, returns `{ url }`; routed at
  `POST /api/v1/subscription/billing-portal` ([`routes/api.php:206`](../routes/api.php:206)).

The portal self-serves payment-method changes / invoice history / card updates.
Subscription & entitlement state stays authoritative in the local application.

### 2. Checkout pre-flight validation (requirement 3 / 5)

[`SubscriptionService::startCheckout`](../app/Services/SubscriptionService.php:86) now, when the
company already holds an entitled subscription, runs
[`assertCanChangeToPlan`](../app/Services/SubscriptionService.php:380) before creating the
checkout. A hosted checkout is a plan change, so it can never be used to bypass
the branch / employee downgrade rules (`DOWNGRADE_BRANCH_LIMIT_EXCEEDED` /
`DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED`, both structured 422 responses via the
global exception handler in [`bootstrap/app.php`](../bootstrap/app.php:84)).

### 3. Webhook plan reconciliation (requirements 4 / 9)

[`StripeBillingWebhookController::handleSubscriptionUpdated`](../app/Http/Controllers/Api/StripeBillingWebhookController.php:173)
now calls [`reconcilePlanFromProvider`](../app/Http/Controllers/Api/StripeBillingWebhookController.php:266)
which resolves the provider subscription object's first line-item price back to
a local plan (by any of the three per-cycle price ids) and converges
`plan_id`, `billing_cycle` and `stripe_price`. The provider is authoritative for
what the customer is actually charged; out-of-order upgrades/downgrades/billing
period changes still converge. Unknown/retired prices are ignored — local state
is never guessed.

---

## Tests

### New: [`tests/Feature/Billing/StripeCheckoutFlowTest.php`](../tests/Feature/Billing/StripeCheckoutFlowTest.php) (9 tests)

Binds a fake `BillingProvider` in the container so the provider boundary is
exercised with **no real Stripe API calls**:

- company admin starts a hosted checkout → `201`, `checkout_url` +
  `checkout_session_id`, local row created as **`incomplete`** (never a fake
  active record);
- checkout returns 422 when the plan has no Stripe price for the cycle;
- checkout requires a valid plan;
- checkout **cannot bypass downgrade branch allowance** → 422
  `DOWNGRADE_BRANCH_LIMIT_EXCEEDED`, no checkout row created;
- checkout **cannot bypass downgrade employee capacity** → 422
  `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED`, no checkout row created;
- checkout allowed for an upgrade when usage fits target limits;
- company admin opens the billing portal → `200` with `data.url`;
- employee is forbidden from the billing portal (403);
- billing portal requires an entitled subscription (404).

### Extended: [`tests/Feature/Billing/BillingProviderWebhookTest.php`](../tests/Feature/Billing/BillingProviderWebhookTest.php) (+4 tests)

- `customer.subscription.updated` reconciles an **upgrade** from the provider
  price (`plan_id` / `billing_cycle` / `stripe_price` converge);
- reconciles a **billing-cycle change** (same plan, yearly price);
- **provider/local mismatch**: unknown provider price → local row unchanged;
- webhook for an **unknown subscription** → `received: true`, recorded as
  processed, no state change (no orphan rows).

### Full billing suite

```
OK (164 tests, 480 assertions)
```

Run with the PHP 8.3 binary:
`"C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe" vendor\bin\phpunit tests\Feature\Billing`

The 13 pre-existing full-suite failures (Auth Breeze 405s, ProfileTest,
RosterChangesTest) are unrelated to billing and were proven pre-existing in
Task 13.

---

## Design invariants preserved

- **Single provider boundary**: controllers/services depend only on the
  `BillingProvider` contract; only [`StripeBillingProvider`](../app/Billing/StripeBillingProvider.php:18)
  touches Stripe (via Cashier).
- **No fake payment records**: payment rows are only written when the verified
  webhook carries a real provider invoice reference.
- **Provider is source of truth for charges**; webhook events drive local
  subscription/entitlement state, never frontend input.
- **Global webhook idempotency** via `stripe_webhook_events.event_id` (unique),
  plus subscription-level `webhook_event_ids`.
- **Grace window / suspension** remain configurable through
  [`config/billing.php`](../config/billing.php) (`retry_days`, `grace_period_days`,
  `suspend_after_days`) and enforced by the scheduled `billing:enforce-payment-lifecycle` command.
