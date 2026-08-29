# Phase 1 Architecture Analysis — SaaS Subscription System (Rosterly)

**Scope:** Read-only analysis of the existing Phase 1 codebase (Laravel 12 + PostgreSQL, React management app, React Native mobile app).
**Status:** Analysis only — no implementation, migrations, schema, model, controller, React, or React Native changes were made.
**Note on React Native:** The mobile app is **not inside this workspace** (`c:/laragon/www/staff-sass-last17`). It lives in a sibling directory (`staff-saas/`). Its integration points with the backend are documented from the API contracts (FCM push, `device_tokens`, `mobile` invitation channel, mobile-only `employee` role, Sanctum token auth).

---

## 1. Existing Architecture

### 1.1 Business (top-level tenant/account entity)

- **Table:** [`companies`](database/migrations/2026_07_27_000002_create_companies_table.php:12) — `id`, `name`, `abn`, `email`, `phone`, `logo`, `timezone`, `country`, `state`, `business_type`, `status` (`active|inactive|suspended`), `subscription_id` (nullable denormalized pointer to current subscription), plus trial lifecycle: `trial_ends_at`, `locked_at`, `trial_ending_reminded_at` (added in [`2026_08_17_000006`](database/migrations/2026_08_17_000006_add_trial_lifecycle_and_six_month_billing.php:8)).
- **Model:** [`Company`](app/Models/Company.php:11) — top-level tenant. Key methods:
  - `isActive()`, `isTrialActive()`, `activeSubscription()`, `isAccessLocked()` (= `!isTrialActive() && !activeSubscription()`).
  - Relations: `settings`, `branches`, `departments`, `positions`, `employees`, `shiftTemplates`, `rosters`, `leaveTypes`, `leaveRequests`, `deviceTokens`, `subscriptions`, `users`.
- **Multi-tenancy:** Single database, tenancy via `company_id` foreign keys on every entity. `stancl/tenancy` is in [`composer.json`](composer.json:11) but **not registered** in [`bootstrap/providers.php`](bootstrap/providers.php:1) (only `AppServiceProvider`) — it is installed but unused. Tenant isolation is application-level.

### 1.2 Branch

- **Table:** [`branches`](database/migrations/2026_07_27_000004_create_branches_table.php:12) — `company_id` (cascade), `name`, `phone`, `address`, `lat`/`lng`, `timezone`, `status`; extended with `manager_id` → `employees` (nullOnDelete) in [`2026_07_27_000021`](database/migrations/2026_07_27_000021_add_manager_id_to_branches.php:17) and operating hours (`default_opens_at`, `default_closes_at`, `default_break_minutes`, `default_break_paid`, `day_schedules` JSON) in [`2026_08_23_000002`](database/migrations/2026_08_23_000002_add_operating_hours_to_branches.php:24).
- **Model:** [`Branch`](app/Models/Branch.php:10) — `scheduleForWeekday()`, `scopeActive()`; relations `company`, `manager` (Employee), `users`, `employees` (authoritative staff via `employees.branch_id`), `shifts`.

### 1.3 Employee

- **Table:** [`employees`](database/migrations/2026_07_27_000007_create_employees_table.php:12) — `company_id`, `user_id` (nullable, login link), `department_id`, `position_id`, `branch_id` (nullable), `first_name`, `last_name`, `employment_type`, `status` (`active|inactive|terminated`).
- **Model:** [`Employee`](app/Models/Employee.php:12) — relations `company`, `user`, `department`, `position`, **`branch` (belongsTo — exactly ONE branch)**, `invitation`, `availabilities`, `shifts`, `leaveRequests`. Uses activity logging.
- **Key finding:** An employee belongs to a **single branch** via `employees.branch_id`. There is **no pivot table** for many-to-many branch membership. Multi-branch assignment is not currently possible without schema changes.

### 1.4 Subscription

- **Table:** [`subscriptions`](database/migrations/2026_07_27_000015_create_subscriptions_table.php:12) — `company_id`, `plan_id`, `status` (`active|cancelled|expired|past_due|trialing`), `billing_cycle` (`monthly|yearly` + `six_month`), `starts_at`, `ends_at`, `trial_ends_at`, `cancelled_at`; extended with `user_id`, `stripe_id` (unique), `stripe_status`, `stripe_price`, `quantity`, `checkout_session_id` (unique) in [`2026_07_27_000018`](database/migrations/2026_07_27_000018_add_stripe_columns_to_billing_tables.php:8) and [`2026_08_17_000004`](database/migrations/2026_08_17_000004_reconcile_billing_schema_for_stripe.php:18); `renewal_reminded_at`, `activation_notified_at` in [`2026_08_17_000006`](database/migrations/2026_08_17_000006_add_trial_lifecycle_and_six_month_billing.php:8).
- **Model:** [`Subscription`](app/Models/Subscription.php:10) — scopes `active`, `trialing`; methods `isActive()`, `onTrial()`, `isCancelled()`; relations `company`, `user`, `plan`, `payments`.
- **Cashier integration:** Subscription is *mirrored* locally but the source of truth for lifecycle is Stripe (Laravel Cashier `Billable` on [`User`](app/Models/User.php:18)).

### 1.5 Plans

- **Table:** [`plans`](database/migrations/2026_07_27_000001_create_plans_table.php:12) — `name`, `slug` (unique), `price_monthly`, `price_yearly` (+ `price_six_monthly`), `max_employees` (nullable = unlimited), `max_branches` (nullable), `features` (JSONB), `is_active`; extended with Stripe ids (`stripe_product_id`, `stripe_monthly_price_id`, `stripe_yearly_price_id`, `stripe_six_monthly_price_id`).
- **Model:** [`Plan`](app/Models/Plan.php:9) — `hasUnlimitedEmployees()`, `hasUnlimitedBranches()`; `features` cast to array.
- **Seeded plans** ([`PlanSeeder`](database/seeders/PlanSeeder.php:8)): Free ($0, 5 emp, 1 branch), Starter ($29/mo, 25 emp, 3 branches), Professional ($79/mo, 100 emp, 10 branches), Enterprise ($199/mo, unlimited).

### 1.6 Features / entitlement

- **Dual, loosely-coupled mechanism:**
  1. **Spatie Permissions** ([`permission_tables`](database/migrations/2026_07_27_125352_create_permission_tables.php:12), [`RoleAndPermissionSeeder`](database/seeders/RoleAndPermissionSeeder.php:10)) — capability flags per role (`company.*`, `branch.*`, `user.*`, `employee.*`, `department.*`, `position.*`, `roster.*`, `shift.*`, `shift_template.*`, `leave_type.*`, `leave_request.*`, `report.view`, `settings.view/edit`, and billing: `subscription.view`, `subscription.manage`, `subscription.refund`). `config/permission.php` has `'teams' => false`.
  2. **Plan limits / display strings** — `plans.features` is a **JSONB array of human-readable strings** (e.g. "Unlimited shifts", "Advanced reporting") for marketing display. `max_employees` / `max_branches` are numeric caps.
- **Company operational settings** ([`company_settings`](database/migrations/2026_07_27_000003_create_company_settings_table.php:12), [`CompanySetting`](app/Models/CompanySetting.php:9)) — booleans `allow_shift_swap`, `allow_employee_availability`, `allow_leave_requests`, `allow_push_notifications` + display/format settings.
- **Finding:** No enforcement of `max_employees` / `max_branches` or per-feature gating was observed in controllers/middleware. Access gating is only at the *subscription-active* level via the `company.access` middleware (returns **423** `company_subscription_required`, sets `companies.locked_at`).

### 1.7 Permissions & Roles

- **Roles** (Spatie, guard `web`): `super_admin`, `company_admin`, `scheduler`, `employee`.
  - `super_admin`: all permissions.
  - `company_admin`: all except `company.create` / `company.delete`; **owns billing** (`subscription.view`, `subscription.manage`).
  - `scheduler`: roster/shift/employee view, leave approve.
  - `employee`: `shift.view`, `roster.view`, `leave_request.view/create` — **mobile-only** (blocked from web dashboard).
- **Legacy:** `users.role` string column (comment lists the four roles) coexists with Spatie tables — a dual-source-of-truth.
- **Billing policy:** [`SubscriptionPolicy`](app/Policies/SubscriptionPolicy.php:9) — `before()` grants `super_admin`; `viewAny`/`view` require `subscription.view` + `belongsToCompany`; `create`/`update` require `subscription.manage`; `refund` requires `subscription.refund`.

### 1.8 Billing flow

- **Service:** [`SubscriptionService`](app/Services/SubscriptionService.php:13)
  - `startCheckout(company, user, plan, cycle, trialDays)` → creates local subscription (status `incomplete`), Stripe customer, Checkout session with metadata (`local_subscription_id`, `company_id`, `plan_id`, `billing_cycle`).
  - `subscribe(...)` → Stripe sub + local mirror + `recordPayment()`.
  - `cancel(subscription, immediately)`, `resume(subscription)`, `swap(subscription, plan, cycle)`.
  - Cycles: `monthly`, `six_month`, `yearly`.
- **Payments:** [`PaymentService`](app/Services/PaymentService.php:10) — `refund(payment, ?amount)` full/partial via Stripe refunds API, updates `amount_refunded`/`status`/`refunded_at` in a transaction.
- **Webhooks:** [`StripeBillingWebhookController`](app/Http/Controllers/Api/StripeBillingWebhookController.php:15) — `checkout.session.completed`, `invoice.paid`, `customer.subscription.created/updated/deleted`; `activateSubscription()` unlocks company (status `active`, `locked_at = null`) and notifies `company_admin` users (`SubscriptionActivatedNotification`), idempotent via `activation_notified_at`.
- **Middleware:** [`CheckCompanyAccess`](app/Http/Middleware/CheckCompanyAccess.php:9) (`company.access` → 423), [`EnsureActiveSubscription`](app/Http/Middleware/EnsureActiveSubscription.php:9) (`subscription.active` → 402), [`EnsureActiveAccount`](app/Http/Middleware/EnsureActiveAccount.php:19) (`account.active` → 401). Registered in [`bootstrap/app.php`](bootstrap/app.php).
- **Trial lifecycle:** [`LockExpiredTrials`](app/Console/Commands/LockExpiredTrials.php:9) (`billing:lock-expired-trials`), [`SendTrialEndingReminders`](app/Console/Commands/SendTrialEndingReminders.php:11) (`billing:send-trial-ending-reminders --days=3`), `SendSubscriptionRenewalReminders`; `platform_settings.trial_period_days` default 14.
- **API routes:** [`routes/api.php`](routes/api.php) — `v1` prefix, Sanctum `auth:sanctum,account.active`, operational routes wrapped in `company.access`; billing: `apiResource('plans')`, `companies/{company}/subscriptions` (index/store/show/cancel/resume/swap), `subscriptions/{subscription}/payments` (index/refund), public `POST webhooks/stripe/billing`.

### 1.9 Audit

- **Package:** `spatie/laravel-activitylog`; table [`activity_log`](database/migrations/2026_07_27_125404_create_activity_log_table.php:9).
- **Usage:** `LogsActivity` on [`Company`](app/Models/Company.php:11), [`User`](app/Models/User.php:18), [`Employee`](app/Models/Employee.php:12). Not yet applied to billing entities (Subscription / SubscriptionPayment / Plan).

### 1.10 Notifications

- **Table:** [`notifications`](database/migrations/2026_07_27_000019_create_notifications_table.php:15) (standard Laravel morph-based).
- **Channels:** Database notifications (web center, [`NotificationCenterPage`](resources/js/features/notifications/pages/NotificationCenterPage.tsx)) + **FCM push** via `kreait/laravel-firebase` ([`FcmChannel`](app/Notifications/Channels/FcmChannel.php)) targeting `device_tokens` for the mobile app.
- **Notification classes:** `SubscriptionActivatedNotification`, `TrialEndingNotification`, `SubscriptionRenewalReminderNotification`, plus operational ones.

### 1.11 Settings

- `company_settings` (per-company, unique `company_id`) — [`CompanySetting`](app/Models/CompanySetting.php:9).
- `platform_settings` (platform-wide, e.g. `trial_period_days`).
- Frontend: [`PolicyTogglePanel`](resources/js/features/settings/components/PolicyTogglePanel.tsx) exposes operational policy toggles.

### 1.12 React management app (web)

- Inertia.js v2 + React 19 + TanStack Query + Axios; auth via Sanctum bearer token stored in localStorage/sessionStorage ([`api-client.ts`](resources/js/lib/api-client.ts:41)).
- Billing UI fully wired: [`PlansPage`](resources/js/features/billing/pages/PlansPage.tsx), [`CompanySubscriptionsPage`](resources/js/features/billing/pages/CompanySubscriptionsPage.tsx), [`SubscriptionPaymentsPage`](resources/js/features/billing/pages/SubscriptionPaymentsPage.tsx), [`LockedCompanyPage`](resources/js/features/billing/pages/LockedCompanyPage.tsx), `useBilling.ts` hooks; routes at `/plans`, `/companies/:id/subscriptions`, `/companies/:company/subscriptions/:subscription/payments`, `/account-locked` ([`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:359)).
- **Super-admin is mock:** [`useSuperAdmin.ts`](resources/js/features/super-admin/hooks/useSuperAdmin.ts) — "The platform has no dedicated backend surface yet, so this module owns a deterministic in-memory tenant ledger". Plan/company management UI exists but is not backed by a real API surface beyond `plans` CRUD.
- `employee` role is **mobile-only** ([`ProtectedRoute.tsx`](resources/js/routes/ProtectedRoute.tsx)) — redirected away from the web dashboard.
- Employee invite flow supports `web` (company_admin/scheduler) and `mobile` (employee) channels ([`employee_invitations`](database/migrations/2026_08_23_000001_create_employee_invitations_table.php:18)).

---

## 2. Reusable Components

The requested business model — **Business owns Subscription → Plan → Features**, **Business → Branches → Employees** (branches consume capacity, no per-employee subscriptions) — is **already the implemented model**. Reuse, don't rebuild:

| Area | Reusable existing component | Notes |
|------|-----------------------------|-------|
| Tenant/business | [`companies`](database/migrations/2026_07_27_000002_create_companies_table.php:12) + [`Company`](app/Models/Company.php:11) | `isTrialActive()`, `activeSubscription()`, `isAccessLocked()` are ready |
| Plans | [`plans`](database/migrations/2026_07_27_000001_create_plans_table.php:12) + [`Plan`](app/Models/Plan.php:9) + [`PlanSeeder`](database/seeders/PlanSeeder.php:8) | Limits + Stripe price ids + features JSONB |
| Subscriptions | [`subscriptions`](database/migrations/2026_07_27_000015_create_subscriptions_table.php:12) + [`Subscription`](app/Models/Subscription.php:10) | Full Stripe lifecycle incl. trial |
| Payments | [`subscription_payments`](database/migrations/2026_07_27_000016_create_subscription_payments_table.php:12) + [`PaymentService`](app/Services/PaymentService.php:10) | Refund capability |
| Billing orchestration | [`SubscriptionService`](app/Services/SubscriptionService.php:13) | checkout/subscribe/cancel/resume/swap |
| Webhooks | [`StripeBillingWebhookController`](app/Http/Controllers/Api/StripeBillingWebhookController.php:15) | `activateSubscription()` unlocks + notifies |
| Access enforcement | [`CheckCompanyAccess`](app/Http/Middleware/CheckCompanyAccess.php:9), `subscription.active`, `account.active` | Middleware aliases in [`bootstrap/app.php`](bootstrap/app.php) |
| Permissions | Spatie tables + [`RoleAndPermissionSeeder`](database/seeders/RoleAndPermissionSeeder.php:10) | `subscription.*` permissions exist |
| Audit | `activity_log` + `LogsActivity` | Extend to billing models |
| Notifications | `notifications` + `FcmChannel` + notification classes | DB + FCM push |
| Trial ops | `LockExpiredTrials`, `SendTrialEndingReminders`, `SendSubscriptionRenewalReminders` | Scheduled commands ready |
| React billing UI | `features/billing/**` | Fully wired pages/hooks |
| Auth | Sanctum + [`api-client.ts`](resources/js/lib/api-client.ts:41) | Token storage + 401/423/403 handling |

---

## 3. Missing Components

Only genuinely absent pieces (deliberately minimal — do not rebuild what exists):

1. **Machine-readable feature entitlement.** `plans.features` is display strings; there is no machine-readable feature key (`features` as `['advanced_reporting' => true]` or a `features` table) and **no enforcement** of `max_employees` / `max_branches` or per-feature capability beyond subscription-active.
2. **Plan-limit enforcement layer.** A checker (service or middleware) that blocks creating branches / employees when the plan cap is reached, returning a clear entitlement error (analogous to 423 `company_subscription_required`).
3. **Real super-admin backend surface.** [`useSuperAdmin.ts`](resources/js/features/super-admin/hooks/useSuperAdmin.ts) is in-memory mock; needs real controllers for company lifecycle and plan management beyond the existing `plans` CRUD.
4. **Employee ↔ branch multi-assignment** (only if the product requires it). Currently single-branch via `employees.branch_id`; no pivot exists.
5. **Billing audit + webhook reconciliation edge cases.** `LogsActivity` not on Subscription/Payment; webhook handler doesn't cover all Stripe events (e.g. `invoice.payment_failed` beyond status mapping).
6. **Upgrade/downgrade proration UX** in the web billing UI (swap exists server-side; no mid-cycle proration UI/invoice display).

---

## 4. Recommended Architecture

The requested architecture is **already in place** — no replacement needed. Formalized:

```
Company (Business / tenant)  ──1:N──►  Branch  ──1:N──►  Employee
      │                                 (branch consumes plan capacity;
      │                                  employee assigned to 1 branch)
      │
      └──1:N──► Subscription ──N:1──►  Plan
                                        ├── max_employees (cap)
                                        ├── max_branches (cap)
                                        └── features (entitlement JSON)
                                                 │
                                                 └── enforced by a new
                                                     PlanEntitlementService +
                                                     company.access middleware

Payments: Subscription ──1:N──► SubscriptionPayment (Stripe)
```

- Employees are **capacity consumers** of the company's plan — no per-employee subscriptions.
- Billing is **owned by `company_admin`** (role + `subscription.manage`); `super_admin` manages plans/companies.
- Stripe is the source of truth; local `subscriptions`/`subscription_payments` are the mirrored ledger.
- Extend the existing `company.access` gateway to also enforce numeric plan limits, keeping the 423-style entitlement contract.

---

## 5. Database Changes (minimal, additive only)

Nothing structural is required for the core model (it already exists). Recommended additive changes:

1. `plans` — change `features` from display-string array to a **machine-readable JSON map** (or add `feature_keys jsonb`) so frontend can gate features; keep display strings for marketing if desired.
2. *(Optional, only if multi-branch staff needed)* new `branch_employee` pivot table + `employees.branch_id` nullable → keeps single "primary" branch.
3. `subscription_payments` — add `invoice_url` / `receipt_url` (or fetch from Stripe) if invoice UI is wanted.
4. `subscriptions` — consider `plan_snapshot jsonb` (plan name/limits at time of purchase) for history accuracy through swaps/price changes.
5. (No new subscription tables needed — `companies`, `plans`, `subscriptions`, `subscription_payments` already cover Business→Plan→Features.)

---

## 6. Risks in Phase 1 Architecture

1. **`stancl/tenancy` installed but unused** ([`composer.json`](composer.json:11), absent from [`bootstrap/providers.php`](bootstrap/providers.php:1)). Dead dependency + confusion about the intended tenancy model. Either remove it or formally adopt it; current isolation is manual `company_id` scoping.
2. **Dual role source-of-truth.** Spatie roles/permissions coexist with legacy `users.role` string. Drift risk (e.g. a user with Spatie `company_admin` but `users.role = 'scheduler'`).
3. **No plan-limit / feature enforcement.** `max_employees`, `max_branches`, and `features` are not enforced anywhere — companies can exceed their paid capacity. This is the biggest gap for a real SaaS.
4. **Super-admin is frontend mock.** No backend surface for company/plan administration means no audit, no enforcement, no persistence of platform actions.
5. **Single-branch employees.** `employees.branch_id` is singular; the desired model says branches consume capacity — if a person can work across branches, schema + roster/shift/availability queries all assume one branch.
6. **Denormalized `companies.subscription_id`.** Can drift out of sync with the `subscriptions` table (history vs. current). Recompute/validate on activation.
7. **Pricing/billing specifics.** AUD currency, `six_month` cycle, free tier with 5 employees — must be preserved; feature-gating logic must be cycle/currency aware.
8. **`employee` role has no web access** — capacity counting must be based on the `employees` table (not `users`), and any per-seat messaging must not assume a linked `users` row exists for every employee (`employees.user_id` nullable).

---

## Answers to the 16 Questions

1. **Top-level business/account/tenant entity:** [`companies`](database/migrations/2026_07_27_000002_create_companies_table.php:12) / [`Company`](app/Models/Company.php:11). Single-DB multi-tenant via `company_id`; `stancl/tenancy` installed but not registered.
2. **Branch representation:** [`branches`](database/migrations/2026_07_27_000004_create_branches_table.php:12) / [`Branch`](app/Models/Branch.php:10) — `company_id`, operating hours, `manager_id`.
3. **Employee → branch:** `employees.branch_id` (nullable FK), `belongsTo` in [`Employee`](app/Models/Employee.php:125).
4. **Multiple branches per employee?** No. Single `branch_id`; no pivot. Multi-branch requires a new pivot table.
5. **Roles:** `super_admin`, `company_admin`, `scheduler`, `employee` (Spatie roles + legacy `users.role`).
6. **Role controlling billing:** `company_admin` (`subscription.manage` / `subscription.view` / `subscription.refund`); `super_admin` bypasses via policy `before()`.
7. **Does subscription system exist?** Yes — fully implemented (tables, models, service, controller, policy, webhooks, trial lifecycle).
8. **Payment provider:** Yes — Stripe via Laravel Cashier (checkout, webhooks, refunds).
9. **Stripe present?** Yes — Cashier `Billable` on [`User`](app/Models/User.php:18), Stripe columns on `users`/`plans`/`subscriptions`/`subscription_payments`, `webhook_secret` in [`config/services.php`](config/services.php).
10. **Feature/permission system:** Dual — Spatie permissions (capabilities) + `plans.features` (display strings) + `max_employees`/`max_branches` caps + `company_settings` booleans. **Caps/features are not enforced.**
11. **Audit system:** Yes — `spatie/laravel-activitylog` on Company/User/Employee.
12. **Notification system:** Yes — Laravel DB notifications + FCM push channel (`device_tokens`) for mobile.
13. **Settings/config:** `company_settings` (per-company) + `platform_settings` (e.g. `trial_period_days`).
14. **Subscription ↔ tenant integration:** `subscriptions.company_id`; `companies.subscription_id` pointer; `CheckCompanyAccess` locks the whole company (423) when no active sub/trial; `StripeBillingWebhookController::activateSubscription()` unlocks on payment.
15. **Reusable tables:** `companies`, `plans`, `subscriptions`, `subscription_payments`, `company_settings`, `branches`, `employees`, Spatie permission tables, `activity_log`, `notifications`, `device_tokens`, `platform_settings`, `employee_invitations`.
16. **New tables necessary:** None for the core Business→Plan→Features model. Only optional additions: `branch_employee` pivot (multi-branch) and/or machine-readable feature storage (column change rather than new table).
