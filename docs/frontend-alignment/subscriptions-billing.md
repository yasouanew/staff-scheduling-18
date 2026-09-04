# Subscription & Billing Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Company-admin Subscription self-service: Subscription dashboard, Current plan, Plan selection, Plan details, Feature display, Subscription status, Trial, Cancellation, Payment history, Branch subscription (employee capacity / usage), Billing information. **Roster is out of scope.**
> **Method:** Backend/database/API is the **source of truth**. Every field, state, status, payload and response mapping was traced from the backend (tables, models, enums, `PlanSubscriptionController`, `SubscriptionController`, `SubscriptionPaymentController`, `SubscriptionSummaryResource`, `UsageService`, `SubscriptionService`) and compared against the frontend (`SubscriptionDashboardPage`, `useSubscription`, `useBranchBilling`, `types.ts`, billing components). Only the frontend was changed — no backend code, migrations, business rules, API payloads, or Stripe implementation were touched.
> **Reference docs:** `.roo/ui-ux.md` (architectural reference — not the ultimate source of truth), `docs/frontend-alignment/system-map.md`, `docs/frontend-alignment/plans-features.md`.

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 Billing tables

| Table | Migration | Purpose |
|---|---|---|
| `plans` | `2026_07_27_000001` | Plan catalogue; `price_monthly`/`price_six_monthly`/`price_yearly`, `max_branches`/`max_employees` (null = unlimited), `features` jsonb string array |
| `plan_features` | `2026_08_28_000005` | Pivot (`plan_id`, `feature_id`, `is_enabled`, `limit_value`, `configuration`) consumed by `EntitlementService`; **not exposed** via any billing API |
| `subscriptions` | `2026_07_27_000015` + `2026_07_27_000018` | Core subscription row: `status`, `billing_cycle`, `starts_at`, `ends_at`, `renews_at`, `cancelled_at`, `trial_ends_at`, Stripe columns |
| `subscription_payments` | `2026_07_27_000016` + `2026_08_28_000006` | Payment lifecycle: `status`, `amount`, `amount_refunded`, `currency`, `stripe_*`, `paid_at`, `refunded_at` |
| `branch_subscriptions` | `2026_08_28_000006` | Per-branch employee-capacity entitlement (`employee_capacity`, `is_active`, `deactivated_at`) |
| `stripe_webhook_events` | `2026_08_28_000006` | Webhook idempotency (`event_id` unique, `type`, `status` processed/processing/failed) — **not exposed by any API** |
| `companies` | `2026_07_27_000002` + `2026_08_28_000007` | Billing fields: `billing_cycle`, `trial_ends_at`, `trial_reminder_sent_at`, `trial_expired_at`, `trial_days` |

### 1.2 Enums (source of truth for statuses/cycles)

- **`App\Enums\SubscriptionStatus`** → `trialing`, `active`, `past_due`, `grace_period`, `suspended`, `paused`, `cancelled`, `expired`. Access semantics: `grantsAccess()` = `trial` | `active` | `grace_period` (any other status denies access; the SPA renders [`LockedCompanyPage.tsx`](resources/js/features/billing/pages/LockedCompanyPage.tsx:6) when `data.entitled` is false).
- **Payment statuses** → `pending`, `succeeded`, `failed`, `refunded`. `isRefunded()` = `status === 'refunded'` **or** `amount_refunded > 0`.
- **Billing cycles** → `monthly`, `six_month`, `yearly`.
- **`App\Enums\Feature`** → 14 keys (see `plans-features.md`); `isBranchScoped()` = the first 7.

### 1.3 Two API surfaces for subscriptions

The codebase deliberately exposes **two different** subscription surfaces with **different secret exposure**:

1. **Self-service `subscription/*`** — [`PlanSubscriptionController.php`](app/Http/Controllers/Api/PlanSubscriptionController.php:57), mounted **outside** `company.access`, resolved from the authenticated user's company. Returns [`SubscriptionSummaryResource.php`](app/Http/Resources/SubscriptionSummaryResource.php:20), which **omits** Stripe provider secrets and `price_six_monthly`.
2. **Explicit-company `companies/{company}/subscriptions/*`** — `SubscriptionController` + `SubscriptionPaymentController`, super-admin/owner scope. `SubscriptionResource` **does** expose `stripe_id`, `stripe_status`, `stripe_price`, `quantity`.
3. **Super-admin `/super-admin/subscriptions|payments`** — also exposes Stripe fields (`PlatformSubscriptionDto` / `PlatformPaymentDto`).

`stripe_webhook_events` is **not** exposed by any API surface. Normal Company Admin users never receive internal webhook/Stripe details through the self-service surface.

### 1.4 `SubscriptionSummaryResource` shape (self-service, `GET /subscription`)

| Key | Type | Notes |
|---|---|---|
| `plan` | object | `{ id, name, slug, description, currency, price_monthly, price_yearly, interval (single value), max_branches, max_employees }` — **no `price_six_monthly`** |
| `subscription` | object | `{ id, status, billing_cycle, on_trial, is_active, is_cancelled, trial_ends_at, starts_at, ends_at, renews_at, cancelled_at }` |
| `trial` | object | `{ active, trial_ends_at }` |
| `usage` | object | `{ branches: { used, limit }, branch_usage: [{ branch_id, employees_used, capacity, remaining }] }` — **`branch_usage` is NAME-LESS** (see [`UsageService::branchUsageDetails()`](app/Services/UsageService.php:161)) |
| `features` | array | `[{ key, label, branch_scoped, enabled, limit }]` — the **entitled** feature set (present in the summary) |
| `entitled` | bool | drives the locked/unlocked company view |

### 1.5 Plans catalogue (`GET subscription/plans`)

`{ id, name, slug, description, currency, price_monthly, price_six_monthly, price_yearly, interval: ['monthly','six_month','yearly'], max_branches, max_employees, features }` — full pricing incl. `price_six_monthly` ([`PlanSubscriptionController::plans()`](app/Http/Controllers/Api/PlanSubscriptionController.php:90)).

### 1.6 Usage overview (`GET subscription/usage`) — DIFFERENT shape to summary

`{ branches: { used, limit }, branches_usage: [{ id, name, active, employees_used, employee_capacity, remaining }] }` ([`PlanSubscriptionController::usage()`](app/Http/Controllers/Api/PlanSubscriptionController.php:126)). This list is **named** (branch `name` + `active` entitlement flag) and `branches.used` = `UsageService::activeBranches`. It lists **all** branches with `active` indicating whether the branch is currently entitled.

### 1.7 Billing redirect targets (backend-generated, SPA-incompatible)

[`SubscriptionService::billingPortalReturnUrl()`](app/Services/SubscriptionService.php:469) and the `startCheckout` success/cancel URLs point to `/companies/{id}/subscriptions?portal=return|checkout=...`. **No such SPA route exists** — the real company-admin self-service route is `/subscription` ([`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:405)). Backend cannot be modified → documented in §4.

---

## 2. Frontend Implementation (current state)

- **Page:** [`SubscriptionDashboardPage.tsx`](resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:383) — tabs: Overview, Plan, Usage, Branches, Billing, Invoices. Route `/subscription`.
- **Hooks:** [`useSubscription.ts`](resources/js/features/billing/hooks/useSubscription.ts:1) (`useSubscriptionSummary`, `useManagementPlans`, `useUsageOverview`, `useSubscriptionPayments`, `useSubscriptionInvoices`, `useUpgradeSubscription`, `useDowngradeSubscription`, `useBillingPortal`, `useSelfServiceCheckout`, `useCancelSubscription`, `useResumeSubscription`, `useChangeBillingPeriod`) and [`useBranchBilling.ts`](resources/js/features/billing/hooks/useBranchBilling.ts:1) (`useActivateBranch`, `useDeactivateBranch`, `useUpdateBranchCapacity`).
- **Types:** [`types.ts`](resources/js/features/billing/types.ts:1) — `ManagementPlan`, `SubscriptionPlanSummary`, `SubscriptionState`, `TrialInfo`, `BranchUsageSummary`, `BranchUsageItem`, `SubscriptionUsage`, `FeatureEntitlement`, `SubscriptionSummary`, `UsageOverview`.
- **Components:** `PlanCard`, `BranchUsageCard`, `CapacityWarning`/`IncreaseCapacityButton`, `BranchCapacityDialog`, `UpgradePlanDialog`, `CheckoutDialog`, `InvoiceHistoryTable` (inline).
- **Permissions:** [`permissions.ts`](resources/js/features/billing/lib/permissions.ts:1) — `canViewBilling` / `canManageBilling` / `canManageBranchBilling`.

### 2.1 Field mapping (backend → frontend)

| Backend (summary) | Frontend | Notes |
|---|---|---|
| `plan.*` | `SubscriptionSummary['plan']` (`mapPlanSummary`) | |
| `subscription.status` | `SubscriptionState['status']` | rendered via `subscriptionStatusLabel` + `statusTone` (§3 M-02) |
| `subscription.billing_cycle` | `billingCycle` | drives cycle-change buttons |
| `trial.active` / `trial_ends_at` | `trial` / `onTrial` | trial banner + countdown |
| `usage.branches` | `branches.used` / `branches.limit` | |
| `usage.branch_usage` | fallback `BranchUsageItem[]` | **name-less** → fallback only (see §3 M-01) |
| `GET /subscription/usage` `branches_usage` | `UsageOverview['branchesUsage']` via `useUsageOverview()` | **named** source of truth for branch usage |
| `features[].enabled` → `features[].label` | `currentPlanFeatures` | §3 M-03 |
| `entitled` | `data.entitled` | drives `LockedCompanyPage` |

### 2.2 Mappers in `useSubscription.ts` (aligned with backend shapes)

`mapSummary` (line 193) reads the summary resource snake_case fields into the typed model, including `features` (each `{key,label,branch_scoped,enabled,limit}`). `mapUsage` / `mapBranchUsage` map the name-less summary usage shape. `fetchUsage` + `useUsageOverview` (lines 301/403) map the **named** `/subscription/usage` shape. `mapPlan` / `mapPlanSummary` map the plans catalogue and the summary plan (which intentionally lacks `price_six_monthly`).

### 2.3 Branch mutations seed + invalidate caches

[`useBranchBilling.ts`](resources/js/features/billing/hooks/useBranchBilling.ts:78) `refreshUsage` seeds the **summary** `usage` cache with the mutation response (name-less `branch_usage`) **and** invalidates the `SUBSCRIPTION_KEYS.usage` cache key so `useUsageOverview` refetches the named list after every branch action — keeping names/active states correct.

---

## 3. Fixes Applied (frontend only)

### M-01 — Branch usage now sourced from the named usage overview

**Problem:** The dashboard derived branch usage from `data.usage.branchUsage` (the summary's `branch_usage`, which is **name-less** per `UsageService::branchUsageDetails`). [`BranchUsageCard.tsx`](resources/js/features/billing/components/BranchUsageCard.tsx:31) renders `branch.name` and an active badge, so every branch rendered a blank name and an "Inactive" badge, and the Branches tab never reflected the real deactivate/activate state.

**Change** ([`SubscriptionDashboardPage.tsx`](resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:428)):
- Imported and invoked `useUsageOverview()`.
- `branchUsage` now derives from `usageOverview.data?.branchesUsage` (named), falling back to the summary's `branch_usage` only while the richer query loads.
- `activeBranches` / `branchLimit` also prefer the usage overview, with the summary as fallback.
- Both derived arrays are typed `BranchUsageItem[]` (resolves a TS implicit-any on the `reduce` that sums capacity).

`useBranchBilling.refreshUsage` already invalidates the usage cache, so after activate/deactivate/capacity changes the named list refetches correctly.

### M-02 — `statusTone` realigned to actual backend statuses

**Problem:** The tone map was missing backend statuses and contained an obsolete value. `'paid'` is **not** a backend payment status (payment statuses are `pending`/`succeeded`/`failed`/`refunded`), and `grace_period`/`suspended` were unmapped.

**Change** ([`SubscriptionDashboardPage.tsx`](resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:125)) — `statusTone` now maps:
- `success` → `active`, `trialing`, `succeeded`
- `warning` → `grace_period`, `paused`, `suspended`, `pending`, `cancelled`, `canceled`
- `danger` → `past_due`, `failed`, `incomplete`, `expired`
- `info` → anything else

`grace_period` → warning matches the app-wide convention in [`SuperAdminSubscriptionsPage.tsx`](resources/js/features/super-admin/pages/SuperAdminSubscriptionsPage.tsx:25) (missed payment = warning) even though `grantsAccess()` includes grace_period. `'paid'` removed; `incomplete` kept as a defensive Stripe-intent status. The Invoice history table covers all four payment statuses (`pending`/`succeeded`/`failed`/`refunded`).

### M-03 — Current-plan features resolved from the summary's `features` array

**Problem:** `currentPlanFeatures` resolved the plan's features via `plans.find(...)` from the plans catalogue, but the **summary already includes the authoritative `features` array** (the entitled feature set). The prior comment claiming the summary lacks `features` was inaccurate.

**Change** ([`SubscriptionDashboardPage.tsx`](resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:437)) — now `data?.features?.filter((f) => f.enabled).map((f) => f.label) ?? []` with a corrected comment. Feature display on the Current-plan card is now sourced from the entitlement payload rather than the catalogue.

### M-04 — `PlanCard` dead ternary

**Problem:** [`PlanCard.tsx`](resources/js/features/billing/components/PlanCard.tsx:75) rendered `plan.maxBranches === null ? 'active branches' : 'active branches'` — both branches identical.

**Change:** `{plan.maxBranches === null ? 'branches (unlimited)' : 'active branches'}` — correctly signals the unlimited-branch case (matching the `Unlimited` convention in [`format.ts`](resources/js/features/billing/lib/format.ts:1)).

### Verified (no change needed)

- **Plans catalogue / Plan selection:** `useManagementPlans` → `GET subscription/plans`; `PlanCard` shows all three cycles filtered by `plan.interval`; `CheckoutDialog`'s `CYCLE_OPTIONS` filter matches the backend `interval` array. ✓
- **Upgrade/downgrade direction:** `UpgradePlanDialog` ranks plans (`rankOf`) and uses the summary for direction; aligns with `SubscriptionService::assertCanChangeToPlan`. ✓
- **Trial:** `trial`/`on_trial`/`trial_ends_at` drive the trial banner; `billingPeriod` change and checkout honour `trial_days`. ✓
- **Cancellation / resume:** `useCancelSubscription` (immediate flag) + `useResumeSubscription` → `POST subscription/cancel` / `POST subscription/resume`. ✓
- **Payment history / invoices:** `useSubscriptionPayments` / `useSubscriptionInvoices` → paginated `SubscriptionPayment` resources; `InvoiceHistoryTable` renders amount/currency/status/date and refunded state. ✓
- **Branch subscription / capacity:** activate/deactivate/update-capacity map to the `subscription/usage` + branch endpoints; `CapacityWarning` thresholds and `formatCapacity` (null → `Unlimited`) match backend null-means-unlimited semantics. ✓
- **Stripe secrets separation (correct by design):** the self-service summary omits provider secrets and `price_six_monthly`; super-admin and explicit-company surfaces expose Stripe fields; `stripe_webhook_events` is never exposed. ✓

---

## 4. Gaps / Documented Discrepancies (intentionally left as-is — backend cannot be modified)

| # | Discrepancy | Reason / Impact |
|---|---|---|
| G-01 | Backend-generated billing redirect URLs (`SubscriptionService::billingPortalReturnUrl()`, checkout success/cancel) point to `/companies/{id}/subscriptions?portal=return|checkout=...` — **not an SPA route**. | The real self-service route is `/subscription`. Backend is the source of truth and cannot be modified for this task; the SPA simply has no route matching those URLs. Billing notifications already deep-link to `/subscription` (see `notifications.md` G-02). |
| G-02 | The summary's `plan` omits `price_six_monthly`. | `UpgradePlanDialog` already handles this correctly by hiding the 6-month "current" price (null) — no frontend bug. The plans catalogue (`GET subscription/plans`) still carries `price_six_monthly` for selection. |
| G-03 | Summary `usage.branch_usage` is name-less. | Fixed on the frontend by sourcing from `useUsageOverview()` (§3 M-01). The backend shape itself was left untouched. |

---

## 5. Verification

- `npx tsc --noEmit` → **exit 0** (no TypeScript errors).
- `npm run build` (tsc + vite build) → **success** (only the pre-existing chunk-size warning).
- Backend billing tests → `C:/laragon/bin/php/php-8.3.16-Win32-vs16-x64/php.exe artisan test --filter="Billing"` → **188 passed, 573 assertions**, covering: `SubscriptionSelfServiceSurfaceTest`, `TrialLifecycleTest` (grace-period access/lock), `BranchCapacityTest`, `BillingProviderWebhookTest`, `StripeCheckoutFlowTest`, `SubscriptionManagementTest`, `PlanManagementTest`, `SubscriptionPlanTest`, `BranchSubscriptionTest`, `BranchUsageRulesTest`, `FeatureEntitlementTest`.

> Note: the default `php` on PATH resolves to XAMPP PHP 8.0.30, which fails Composer's platform check (project requires `>= 8.3`). Tests were run with `C:/laragon/bin/php/php-8.3.16-Win32-vs16-x64/php.exe`.

## 6. Files changed

| File | Change |
|---|---|
| `resources/js/features/billing/pages/SubscriptionDashboardPage.tsx` | M-01: branch usage from `useUsageOverview()` (named `branches_usage`) with summary fallback; M-02: `statusTone` realigned (added `grace_period`/`suspended` → warning, removed obsolete `'paid'`); M-03: `currentPlanFeatures` from `data.features` (enabled labels) |
| `resources/js/features/billing/components/PlanCard.tsx` | M-04: dead ternary fixed → `'branches (unlimited)'` / `'active branches'` |

No backend files, migrations, business rules, API payloads, or Stripe implementation were modified.
