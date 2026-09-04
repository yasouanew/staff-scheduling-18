# Super Admin Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Super Admin platform surfaces: Dashboard, Companies (ledger + details), Plans, Features, Subscriptions, Payments, Branches, Users, Activity Logs, Notifications, Platform Settings, Profile. **Roster is out of scope.**
> **Method:** Backend/database/API is the **source of truth**. Every metric, field, state, status, payload and response mapping was traced from the backend (tables, models, enums, `SuperAdminController`, `DashboardController`, `SubscriptionController`, `SubscriptionPaymentController`, `PlatformTrialSettingController`, `CompanyController`, `PlanController`, `CompanyPolicy`, role/permission middleware) and compared against the frontend (`features/super-admin/*`, `useSuperAdmin.ts`, `types/super-admin.ts`, `RoleRoute`). Only the frontend was changed — no backend code, migrations, business rules, or API payloads were touched.
> **Reference docs:** `.roo/ui-ux.md` (architectural reference — not the ultimate source of truth), `docs/frontend-alignment/system-map.md`, `docs/frontend-alignment/plans-features.md`, `docs/frontend-alignment/subscriptions-billing.md`.

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 Super Admin API surface (routes/api.php §6 — outside `company.access`)

| Method | Route | Controller method |
|---|---|---|
| GET | `/api/v1/dashboard/overview` | `DashboardController::overview` (super_admin branch → `platformOverview`) |
| GET/POST | `/api/v1/plans` | `PlanController` (apiResource) |
| PUT/DELETE | `/api/v1/plans/{plan}` | `PlanController` (apiResource) |
| GET/POST | `/api/v1/features` | `FeatureController` (apiResource) |
| GET | `/api/v1/super-admin/subscriptions` | `SuperAdminController::subscriptions` |
| GET | `/api/v1/super-admin/payments` | `SuperAdminController::payments` |
| GET | `/api/v1/super-admin/audit` | `SuperAdminController::audit` |
| GET | `/api/v1/super-admin/metrics` | `SuperAdminController::metrics` |
| GET/POST | `/api/v1/companies` | `CompanyController::index/store` (super_admin gets null `companyScope`) |
| GET/PUT/DELETE | `/api/v1/companies/{company}` | `CompanyController::show/update/destroy` |
| GET | `/api/v1/companies/{company}/subscriptions*` | `SubscriptionController` (explicit-company, super-admin/owner) |
| POST | `/api/v1/companies/{company}/subscriptions/{subscription}/payments/{payment}/refund` | `SubscriptionPaymentController::refund` (**explicit-company only — not on platform surface**) |
| GET/PUT | `/api/v1/platform-settings/trial` | `PlatformTrialSettingController::show/update` |
| GET | `/api/v1/notifications` | shared notifications route (super_admin included) |
| GET/PUT | `/api/v1/profile` | shared profile routes |

All responses are wrapped in `ApiResponse::successResponse` `{success, message, data}`; paginated endpoints use the `paginatedEnvelope` shape `{data, links, meta{current_page, from, last_page, links, path, per_page, to, total}}`.

### 1.2 Role gating (source of truth for permissions)

- **Frontend:** `RoleRoute roles={['super_admin']}` in [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:389) wraps every `/super-admin/*` route.
- **Backend:**
  - [`SuperAdminController::ensureSuperAdmin()`](app/Http/Controllers/Api/SuperAdminController.php:269) — checks `hasRole('super_admin') || role === 'super_admin'`; all four `/super-admin/*` endpoints call it.
  - [`PlatformTrialSettingController::ensureSuperAdmin()`](app/Http/Controllers/Api/PlatformTrialSettingController.php:46) — private, same check.
  - [`CompanyPolicy::before()`](app/Policies/CompanyPolicy.php:13) — super_admin bypasses every company ability.
  - [`CompanyController::index`](app/Http/Controllers/Api/CompanyController.php:24) — super_admin gets `null` `companyScope` (sees all companies).
  - `/api/v1/plans` and `/api/v1/features` mutations are super-admin only (apiResource `authorize`); tenants are view-only.

### 1.3 Company statuses & resource

- **Statuses (Store/Update requests):** `active | inactive | suspended` (`in:active,inactive,suspended`).
- [`CompanyResource`](app/Http/Resources/CompanyResource.php:15): uses `whenCounted('branches'|'employees'|'users')` and when-loaded relations.
- [`CompanyService::paginate()`](app/Services/CompanyService.php:17): applies `withCount(['branches','employees','users'])` on index — **counts ARE present in the list response**, plus `search` (name/email) and `status` filters.

### 1.4 Subscription statuses (canonical — `SubscriptionStatus` enum + code)

`trialing`, `active`, `past_due`, `grace_period`, `suspended`, `paused` (future use), `cancelled`, `expired` — **plus `incomplete`** (initial checkout, set by `SubscriptionService`). `grantsAccess()` = `trial | active | grace_period`.

### 1.5 Platform metrics — both sources are REAL backend

| Source | Endpoint | Provides |
|---|---|---|
| `DashboardController::platformOverview` | `GET /api/v1/dashboard/overview` | `stats{total_companies, active_companies, total_employees, active_subscriptions}`, `plan_distribution[{id,name,tenant_count}]`, `recent_companies[{id,name,status,created_at}]` |
| `SuperAdminController::metrics` | `GET /api/v1/super-admin/metrics` | `mrr, arr, revenue, churn{churned_count, active_base, rate}` |

- `computeChurn` rate is **already a percentage (0–100)** — `round(($churned/$activeBase)*100, 2)`. Do **not** multiply by 100 in the UI.
- MRR aggregates active+trialing subscriptions via `cycleMonthlyPrice` (yearly/12, six_month/6, else price_monthly).

### 1.6 Platform subscriptions shape (`SuperAdminController::subscriptions`)

`{id, company_id, user_id, plan_id, stripe_id, stripe_status, stripe_price, quantity, status, billing_cycle, on_trial, is_active, is_cancelled, starts_at, ends_at, trial_ends_at, cancelled_at, company{id,name,status}, plan{id,name,slug}, plan_name, active_branches_count, created_at, updated_at}`.

### 1.7 Platform payments shape (`SuperAdminController::payments`)

`{id, subscription_id, amount, amount_refunded, currency, payment_provider, provider_reference, status, is_refundable, is_refunded, paid_at, refunded_at, company{id,name,status}, plan{id,name}, created_at}`.

### 1.8 Platform audit shape (`SuperAdminController::audit`)

Platform-only activity events (15 labeled event types). Envelope `{data, links, meta}`.

### 1.9 Platform settings

`GET/PUT /api/v1/platform-settings/trial` → `{trial_period_days}` (validation `1..365`, super-admin only).

### 1.10 DB tables

| Table | Purpose |
|---|---|
| `companies` | tenant rows, `status` active/inactive/suspended, billing/trial columns |
| `users` | super admins & tenant users; `role` via spatie permission tables |
| `plans` | plan catalogue |
| `plan_features` / `features` | entitlement pivot + feature definitions (14 keys) |
| `subscriptions` | subscription rows + Stripe columns |
| `subscription_payments` | payment lifecycle incl. `amount_refunded`, `payment_provider`, `refunded_at` |
| `activity_log` | audit trail (platform events) |
| `branches`, `employees` | counted via `withCount` on company list |
| `notifications` | shared notification rows |

---

## 2. Frontend Implementation (current state)

- **Routing:** all `/super-admin/*` routes are gated by `RoleRoute roles={['super_admin']}` ([`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:389)).
- **Hooks:** [`useSuperAdmin.ts`](resources/js/features/super-admin/hooks/useSuperAdmin.ts:1) — `usePlatformMetrics`, `usePlatformBillingMetrics`, `useTenantCompanies(page)`, `useSuspendedTenantCount`, `usePlatformSubscriptions(page)`, `usePlatformPayments(page)`, `usePlatformAudit(page)`.
- **Types:** [`types/super-admin.ts`](resources/js/types/super-admin.ts:1) — `PlatformOverviewDto`, `PlatformStats`, `PlanDistributionSlice`, `PlatformMetrics`, `PlatformBillingMetrics`, `PlatformSubscription`, `PlatformPayment`, `PlatformAuditEvent`, `PlatformPage<T>`.
- **Pagination:** every paginated hook returns `PlatformPage<T> = {data, currentPage, lastPage, total}` via `mapPage`, uses `keepPreviousData`, and renders the shared [`Pagination`](resources/js/Components/ui/pagination.tsx:13) component (`page`, `pageCount`, `onPageChange`; renders null when `pageCount <= 1`).
- **Shared UI:** `StatCard`, `Badge`/`BadgeTone`, `DataTable`, `PageHeader`, `EmptyState`, `ErrorBoundary`, per-page `new QueryClient(...)`.

### 2.1 Per-page alignment matrix

| Page (route) | UI component | API hook | API endpoint | Controller | Service | Models / tables |
|---|---|---|---|---|---|---|
| Dashboard (`/super-admin/dashboard`) | `SuperAdminDashboard` / `PlatformOverview` | `usePlatformMetrics` + `usePlatformBillingMetrics` + `useSuspendedTenantCount` | `GET /dashboard/overview`, `GET /super-admin/metrics`, `GET /companies?status=suspended&per_page=1` | `DashboardController`, `SuperAdminController` | `DashboardService` (computeMrr/arr/revenue/churn) | `companies`, `subscriptions`, `plans` |
| Companies (`/super-admin/companies`) | `CompanyManagementPage` / `CompanyLedger` + `CompanyActionsMenu` + `CompanyFormModal` | `useTenantCompanies(page)`, `useSuspendedTenantCount`, `usePlatformMetrics`, `useUpdateCompanyStatus`, `useCreateCompany`/`useUpdateCompany` | `GET /companies` (paginated), `PUT /companies/{id}`, `POST /companies`, `PATCH? status` → `PUT /companies/{id}` | `CompanyController` | `CompanyService::paginate/create/update` | `companies` + `withCount` branches/employees/users |
| Company Details (`/super-admin/companies/:id`) | `SuperAdminCompanyDetailPage` / `CompanyDetail` | `useCompany(id)` (from `features/companies`) | `GET /companies/{id}`, `PUT /companies/{id}` | `CompanyController` | `CompanyService` | `companies`, `branches`, `employees`, `subscriptions` |
| Plans (`/super-admin/plans`) | plan management page (shared with company-admin plan catalogue) | plans hook | `GET/POST/PUT/DELETE /plans` | `PlanController` | `PlanService` | `plans`, `plan_features`, `features` |
| Features (`/super-admin/features`) | features page — checkbox picker of the **14 backend feature keys** | features hook | `GET /features` | `FeatureController` | `FeatureService` | `features`, `plan_features` |
| Subscriptions (`/super-admin/subscriptions`) | `SuperAdminSubscriptionsPage` | `usePlatformSubscriptions(page)` | `GET /super-admin/subscriptions` | `SuperAdminController` | `SubscriptionService` | `subscriptions`, `plans`, `companies` |
| Payments (`/super-admin/payments`) | `SuperAdminPaymentsPage` | `usePlatformPayments(page)` | `GET /super-admin/payments` | `SuperAdminController` | `SubscriptionService` | `subscription_payments`, `subscriptions`, `plans`, `companies` |
| Branches | **no dedicated super-admin page** | — | counted via company list `withCount` | `CompanyController` | `CompanyService::paginate` | `branches` |
| Users | **no dedicated super-admin page** | — | counted via company list `withCount` | `CompanyController` | `CompanyService::paginate` | `users` |
| Activity Logs (`/super-admin/audit`) | `SuperAdminAuditPage` | `usePlatformAudit(page)` | `GET /super-admin/audit` | `SuperAdminController` | `ActivityService` | `activity_log` |
| Notifications | shared `/notifications` (super_admin included) | shared notifications hook | `GET /notifications` | `NotificationController` | `NotificationService` | `notifications` |
| Platform Settings (`/super-admin/settings`) | `SuperAdminPlatformSettingsPage` / `TrialSettingCard` | `usePlatformTrialSetting` | `GET/PUT /platform-settings/trial` | `PlatformTrialSettingController` | `PlatformTrialSettingService` | `company_settings` / platform settings |
| Profile | shared `/profile` | shared profile hook | `GET/PUT /profile` | `ProfileController` | `ProfileService` | `users` |

### 2.2 Platform metrics field mapping (backend → frontend)

| Backend (overview) | Frontend | Rendered by |
|---|---|---|
| `stats.total_companies` | `stats.totalCompanies` | StatCard "Total Companies" |
| `stats.active_companies` | `stats.activeCompanies` | StatCard "Active Companies" |
| `stats.total_employees` | `stats.totalEmployees` | StatCard "Total Employees" |
| `stats.active_subscriptions` | `stats.activeSubscriptions` | StatCard "Active Subscriptions" |
| `plan_distribution[]` | `planDistribution[]` | Distribution rows |
| `recent_companies[]` | `recentCompanies[]` | Recent companies list |
| *(overview has no suspended count)* | `useSuspendedTenantCount()` → `GET /companies?status=suspended` `meta.total` | StatCard "Suspended" description |

| Backend (metrics) | Frontend | Rendered by |
|---|---|---|
| `mrr` | `billing.mrr` | StatCard "MRR" |
| `arr` | `billing.arr` | StatCard "ARR" |
| `revenue` | `billing.revenue` | StatCard "Revenue" |
| `churn.rate` (already % 0–100) | `billing.churn.rate` → `formatPercent` (no ×100) | StatCard "Churn" |

---

## 3. Fixes Applied (frontend only)

### M-01 — Removed fabricated dashboard statistics

**Problem:** [`types/super-admin.ts`](resources/js/types/super-admin.ts:70) `PlatformMetrics` declared `totalTenants`, `activeTenants`, `suspendedTenants`, `employeesScheduled` that **do not exist** in any backend response. The dashboard rendered a "Suspended" description as `data.suspendedTenants` (which was computed client-side as total − active, i.e. a fabricated number) — violating the "no fake dashboard statistics" rule.

**Change:**
- Removed the four fabricated fields from `PlatformMetrics` ([`types/super-admin.ts`](resources/js/types/super-admin.ts:70)).
- [`useSuperAdmin.ts`](resources/js/features/super-admin/hooks/useSuperAdmin.ts:123) `fetchPlatformMetrics` now returns only `{stats, planDistribution, recentCompanies}` from the real `/dashboard/overview` payload.
- Added `useSuspendedTenantCount` ([`useSuperAdmin.ts`](resources/js/features/super-admin/hooks/useSuperAdmin.ts:180)) — a **real backend count**: `GET /companies?per_page=1&status=suspended` → `meta.total` (query key `super-admin/suspended-tenants`, staleTime 30s).
- Dashboard Active Companies StatCard now reads the real suspended count ([`SuperAdminDashboard.tsx`](resources/js/features/super-admin/pages/SuperAdminDashboard.tsx:166)).

### M-02 — Fixed churn rate percentage display

**Problem:** [`formatPercent`](resources/js/features/super-admin/pages/SuperAdminDashboard.tsx:60) multiplied the backend value by 100. But `SuperAdminController::computeChurn()` **already returns a percentage (0–100)** — the UI was inflating churn by 100×.

**Change:** `formatPercent` now formats the backend value directly (`.toFixed(1)%`), no ×100. MRR/ARR/Revenue/Churn all flow from `usePlatformBillingMetrics` → `GET /super-admin/metrics` (real source).

### M-03 — Company ledger is now server-paginated with authoritative counts

**Problem:** The old `useTenantCompanies` (no args) fetched **all** companies and computed Total/Active/Suspended client-side from a truncated list — counts were wrong and the table never paginated.

**Change** ([`useSuperAdmin.ts`](resources/js/features/super-admin/hooks/useSuperAdmin.ts:159) + [`CompanyManagementPage.tsx`](resources/js/features/super-admin/pages/CompanyManagementPage.tsx:337)):
- `useTenantCompanies(pageNumber)` → `GET /companies?per_page=15&page=N` → `PlatformPage<Company>` with `keepPreviousData`.
- Removed the stale duplicate non-paginated `useTenantCompanies` hook.
- `CompanyLedger` now uses **authoritative** numbers:
  - Total Companies = `data.total` (backend `meta.total`),
  - Active Companies = `platform?.stats.activeCompanies` (dashboard overview),
  - Suspended = `useSuspendedTenantCount()`.
- `DataTable` wrapped with the shared `Pagination` component, rendered when `pageCount > 1`.

### M-04 — Company detail subscription status tones/labels cover all backend statuses

**Problem:** `subStatusTone`/`subStatusLabel` in [`SuperAdminCompanyDetailPage.tsx`](resources/js/features/super-admin/pages/SuperAdminCompanyDetailPage.tsx:64) were missing `suspended`, `paused`, and `incomplete` — all real backend statuses (`SubscriptionStatus` enum + `SubscriptionService` incomplete checkout).

**Change:** Added `suspended → danger` / `paused → danger` / `incomplete → neutral` tones and `Suspended` / `Paused` / `Incomplete` labels. All 9 backend statuses are now displayed with an appropriate tone.

### M-05 — Payments page surfaces refund + provider columns

**Problem:** [`SuperAdminPaymentsPage.tsx`](resources/js/features/super-admin/pages/SuperAdminPaymentsPage.tsx:102) under-surfaced the backend payment payload — `amount_refunded`/`refunded_at`/`payment_provider` were returned by `GET /super-admin/payments` but not shown.

**Change:** Added two columns:
- **Refunded** (after Status): `isRefunded` → refund date + `amountRefunded` in currency; else `—`.
- **Provider** (before Reference): `payment_provider`, capitalized (or `—`).

---

## 4. Documented Gaps (intentional, no change)

1. **Platform subscriptions omit Stripe provider columns from display.** `GET /super-admin/subscriptions` exposes `stripe_id`, `stripe_status`, `stripe_price`, `quantity` (super-admin surface is permitted to see them), but the Subscriptions table renders the business-facing fields (status, cycle, dates, company, plan, `active_branches_count`). This is an intentional UI decision — the raw provider fields are available on the API if needed later.

2. **No platform-surface refund action.** The refund endpoint is **explicit-company only** (`POST /companies/{company}/subscriptions/{subscription}/payments/{payment}/refund`) — there is **no** `/super-admin/payments/{payment}/refund`. The Payments page therefore has **no refund button**; refunds are performed from a company's detail surface. Verified by `RoleAccessControlTest` (super_admin can refund via the explicit-company route).

3. **Redundant billing sources.** MRR/ARR/Revenue/Churn exist on both `GET /dashboard/overview` (metrics field, not consumed by the frontend type) and `GET /super-admin/metrics`. The frontend intentionally uses `/super-admin/metrics` for billing aggregates and `/dashboard/overview` for stats/distribution/recent companies. Both are real; no dedup change needed.

4. **Branches & Users have no dedicated super-admin pages.** They are surfaced through company list `withCount` counts and the Company Details page (branch/employee detail is a per-company concern, not platform-level). No dedicated pages were fabricated.

5. **Notifications & Profile are shared surfaces.** Super admins use the shared `/notifications` and `/profile` routes (backend includes super_admin in both). No super-admin-specific variants exist.

---

## 5. Role Permission Verification

| Requirement | Verified by |
|---|---|
| `/super-admin/*` SPA routes require `super_admin` role | `RoleRoute roles={['super_admin']}` [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:389) |
| `/super-admin/{subscriptions,payments,audit,metrics}` reject guests & non-super-admins | `SuperAdminController::ensureSuperAdmin` — `SuperAdminPlatformTest` |
| Platform settings read/write is super-admin only | `PlatformTrialSettingController::ensureSuperAdmin` — `RoleAccessControlTest` (super_admin OK, company_admin 403) |
| Super admin can manage any company's subscription & refund | `CompanyPolicy::before()` bypass — `RoleAccessControlTest` |
| Super admin sees the platform dashboard; company_admin sees only their own | `DashboardController::overview` branch — `RoleAccessControlTest` |
| Company admin cannot create/delete companies; super admin can | `CompanyPolicy` — `CompanyManagementTest` |
| Plan mutations are super-admin only; tenants view-only | `PlanController` authorize — `RoleAccessControlTest` |
| Scheduler cannot touch billing/payments/refunds | `RoleAccessControlTest` (negative cases) |

---

## 6. Verification

- **TypeScript:** `npx tsc --noEmit` → clean, no errors.
- **Vite build:** `npx vite build` → 3859 modules transformed, built successfully (chunk-size warning only, pre-existing).
- **Backend tests (Laragon PHP 8.3):**
  - `tests/Feature/SuperAdmin/SuperAdminPlatformTest.php` → **9 passed (81 assertions)**.
  - `tests/Feature/Security/RoleAccessControlTest.php` → **40 passed (75 assertions)**.
  - `tests/Feature/Company/CompanyManagementTest.php` → **14 passed (28 assertions)**.
  - `tests/Feature/Billing/*` (full suite) → **186 passed (570 assertions)**.
