# Task 17 — Versioned API Finalization

**Status:** ✅ Complete

**Scope:** Finalize and clean the versioned API. Preserve `/api/v1`, organize routes
logically, keep company-scoped endpoints derived from the authenticated user, keep
super-admin endpoints on explicit `companies/{company}` identifiers, provide a complete
self-service billing surface, keep the Stripe webhook unauthenticated-but-secure,
standardize error codes, and prove stability with the full API test suite.

---

## 1. Route Organization

`routes/api.php` is organized into **six logical sections** under `Route::prefix('v1')`:

| # | Section | Middleware | Auth model |
|---|---------|------------|------------|
| 1 | **Public endpoints** — auth, invitations, public plans, app links | throttles only | None |
| 2 | **Webhooks** — Stripe billing | none (signature-verified) | None (provider-verified) |
| 3 | **Account endpoints** — auth/me, platform settings, companies show | `auth:sanctum`, `account.active` | Authenticated user |
| 4 | **Company billing (self-service)** — `/subscription*` | `auth:sanctum`, `account.active` | Derived from auth user |
| 5 | **Company operations** — dashboard, branches, employees, rosters, shifts, leave, notifications | `auth:sanctum`, `account.active`, `company.access` | Derived from auth user |
| 6 | **Super-admin platform** — plans CRUD + `companies/{company}` subscriptions & payments | `auth:sanctum`, `account.active` | Explicit company id (policy-guarded) |

### Key architectural decisions

- **Company-scoped endpoints never carry a company id in the URL** — the controller
  derives the company from the authenticated user (`PlanSubscriptionController::resolveCompany()`),
  so one business can never target another. Super-admin endpoints (section 6) are the
  only ones that take an explicit `companies/{company}` identifier, and every one of
  them is guarded by `PlanPolicy` / `SubscriptionPolicy` (super admins bypass via the
  policy `before()` hook).
- **The self-service billing group lives OUTSIDE `company.access`** so a locked company
  can reach `/subscription/checkout` and reactivate. This mirrors the frontend
  (`ProtectedRoute.tsx` allows `/subscription` for locked companies and
  `LockedCompanyPage.tsx` routes locked admins to `/subscription`). Permission is
  enforced per-ability by `SubscriptionPolicy`, never by route placement.
- **The Stripe webhook is deliberately not behind `auth:sanctum`** — Stripe signs every
  delivery and the controller verifies the signature (`Webhook::constructEvent`),
  deduplicates by event id (idempotency), and only reconciles subscriptions that resolve
  to a known local provider record.

---

## 2. Standardized Error Codes

The API uses the existing structured response format:

```json
{
  "success": false,
  "message": "Human readable message",
  "code": "SUBSCRIPTION_REQUIRED",
  "errors": { "used": 6, "limit": 3 }
}
```

All codes are **uppercase, snake-case** — the SPA's `billing-errors.ts` matches on these
exact tokens.

| Code | Status | Meaning | Emitted by |
|------|--------|---------|------------|
| `SUBSCRIPTION_REQUIRED` | 423 | Company is locked (expired trial / no active subscription) on an operational route | `CheckCompanyAccess` |
| `SUBSCRIPTION_REQUIRED` | 402 | No entitled subscription for a billing action that needs one | `EnsureActiveSubscription` |
| `FEATURE_NOT_AVAILABLE` | 403 | Plan does not enable the requested feature | `EnsureFeatureAccess`, `FeatureController::unavailableResponse()` |
| `BRANCH_LIMIT_REACHED` | 422 | More active branches than the plan's `max_branches` | `BranchSubscriptionService` → `BranchCapacityException` |
| `EMPLOYEE_CAPACITY_REACHED` | 422 | More active employees than the plan's `max_employees` | `BranchSubscriptionService` → `BranchCapacityException` |
| `INVALID_DOWNGRADE` | 422 | Plan change would exceed current usage | `SubscriptionService::assertCanChangeToPlan()` → `BillingLimitException` (`DOWNGRADE_BRANCH_LIMIT_EXCEEDED` / `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED`) |
| `UNAUTHORIZED` / 401 | — | Unauthenticated request | Sanctum |
| `FORBIDDEN` / 403 | — | Authenticated but not permitted | Policies |

> Note: `SUBSCRIPTION_REQUIRED` carries both a **423** (locked company on operational
> routes) and a **402** (billing action with no entitled subscription) flavour, matching
> the two distinct states the SPA must distinguish.

The `BillingLimitException` and `BranchCapacityException` structured errors are rendered
globally in `bootstrap/app.php` so both the self-service surface and the platform surface
return the identical shape.

---

## 3. Complete API Map

Legend — **Role:** who may call it. **Service:** the domain service backing the controller.
**Authz:** how access is enforced.

### 3.1 Public endpoints (no auth)

| Endpoint | Method | Role | Purpose | Controller | Service | Authz |
|----------|--------|------|---------|------------|---------|-------|
| `auth/register` | POST | Guest | Create account | `Auth\AuthController::register` | — | throttle:6,1 |
| `auth/login` | POST | Guest | Issue Sanctum token | `Auth\AuthController::login` | — | throttle:6,1 |
| `auth/forgot-password` | POST | Guest | Request reset link | `Auth\AuthController::forgotPassword` | — | throttle:6,1 |
| `auth/reset-password` | POST | Guest | Reset password | `Auth\AuthController::resetPassword` | — | throttle:6,1 |
| `invitations` | GET | Invitee (token) | Preview invite | `InvitationController::show` | — | throttle:10,1 |
| `invitations/accept` | POST | Invitee | Set password (web) | `InvitationController::accept` | — | throttle:6,1 |
| `invitations/mobile/request-code` | POST | Invitee | Request SMS/email code | `InvitationController::requestCode` | — | throttle:6,1 |
| `invitations/mobile/verify-code` | POST | Invitee | Verify code | `InvitationController::verifyCode` | — | throttle:10,1 |
| `invitations/mobile/complete-setup` | POST | Invitee | Set password (mobile) | `InvitationController::completeSetup` | — | throttle:6,1 |
| `mobile-app/links` | GET | Public | App store links | `InvitationController::appLinks` | — | throttle:30,1 |
| `public/plans` | GET | Public | Marketing plan catalogue | `PublicPlanController::index` | — | — |

### 3.2 Webhooks (no Sanctum; signature-verified)

| Endpoint | Method | Role | Purpose | Controller | Service | Authz |
|----------|--------|------|---------|------------|---------|-------|
| `webhooks/stripe/billing` | POST | Stripe | Reconcile checkout/invoice/subscription events | `StripeBillingWebhookController::handle` | `SubscriptionService` (activate/update) | `Webhook::constructEvent` signature + `wasProcessed()` idempotency + `resolveSubscription()` provider validation |

### 3.3 Account endpoints (`auth:sanctum`, `account.active`)

| Endpoint | Method | Role | Purpose | Controller | Service | Authz |
|----------|--------|------|---------|------------|---------|-------|
| `auth/me` | GET | Any auth user | Current user profile | `Auth\AuthController::me` | — | auth:sanctum |
| `auth/web-welcome/complete` | POST | Any auth user | Mark onboarding complete | `Auth\AuthController::completeWebWelcome` | — | auth:sanctum |
| `auth/web-feature-tips/dismiss` | POST | Any auth user | Dismiss feature tip | `Auth\AuthController::dismissWebFeatureTip` | — | auth:sanctum |
| `auth/logout` | POST | Any auth user | Revoke current token | `Auth\AuthController::logout` | — | auth:sanctum |
| `auth/logout-all` | POST | Any auth user | Revoke all tokens | `Auth\AuthController::logoutAll` | — | auth:sanctum |
| `auth/email/resend` | POST | Any auth user | Resend verification email | `Auth\AuthController::resendVerification` | — | throttle:6,1 |
| `auth/confirm-password` | POST | Any auth user | Confirm password | `Auth\AuthController::confirmPassword` | — | throttle:6,1 |
| `platform-settings/trial` | GET | Super admin | Read trial settings | `PlatformTrialSettingController::show` | — | `ensureSuperAdmin()` |
| `platform-settings/trial` | PUT | Super admin | Update trial settings | `PlatformTrialSettingController::update` | — | `ensureSuperAdmin()` |
| `companies/{company}` | GET | Company admin / super admin | Company profile (kept reachable when locked) | `CompanyController::show` | — | Policy |

### 3.4 Company billing — self-service surface (`/subscription*`, outside `company.access`)

All scoped to the caller's own company via `PlanSubscriptionController::resolveCompany()`.

| Endpoint | Method | Role | Purpose | Controller | Service | Authz |
|----------|--------|------|---------|------------|---------|-------|
| `subscription` | GET | Company admin | Full summary (plan, status, trial, usage, features) | `PlanSubscriptionController::show` | `SubscriptionService`, `EntitlementService`, `UsageService` | `subscription.view` |
| `subscription/plans` | GET | Company admin | Active plan catalogue | `PlanSubscriptionController::plans` | `SubscriptionService` | `subscription.view` |
| `subscription/usage` | GET | Company admin | Branch + capacity usage | `PlanSubscriptionController::usage` | `UsageService` | `subscription.view` |
| `subscription/features` | GET | Company admin | Feature entitlements | `PlanSubscriptionController::features` | `EntitlementService` | `subscription.view` |
| `subscription/payments` | GET | Company admin | Payment history (paginated) | `PlanSubscriptionController::payments` | `SubscriptionPaymentResource` | `subscription.view` |
| `subscription/invoices` | GET | Company admin | Invoice history (same local payment rows) | `PlanSubscriptionController::invoices` | `SubscriptionPaymentResource` | `subscription.view` |
| `subscription/checkout` | POST | Company admin | Start hosted Stripe Checkout (also the locked-company reactivation path) | `PlanSubscriptionController::checkout` | `SubscriptionService::startCheckout()` | `subscription.create` |
| `subscription/upgrade` | POST | Company admin | Switch to a larger plan | `PlanSubscriptionController::upgrade` | `SubscriptionService::changePlan()` | `subscription.manage` |
| `subscription/downgrade` | POST | Company admin | Switch to a smaller plan (allowance-validated) | `PlanSubscriptionController::downgrade` | `SubscriptionService::changePlan()` | `subscription.manage` |
| `subscription/cancel` | POST | Company admin | Cancel at period end | `PlanSubscriptionController::cancel` | `SubscriptionService::cancel()` | `subscription.manage` |
| `subscription/resume` | POST | Company admin | Resume most recent cancelled subscription | `PlanSubscriptionController::resume` | `SubscriptionService::resume()` | `subscription.manage` |
| `subscription/billing-period` | POST | Company admin | Change billing cycle (same plan) | `PlanSubscriptionController::billingPeriod` | `SubscriptionService::changeBillingPeriod()` | `subscription.manage` |
| `subscription/billing-portal` | POST | Company admin | Open Stripe Customer Portal | `PlanSubscriptionController::billingPortal` | `SubscriptionService::billingPortal()` | `subscription.manage` |

### 3.5 Company operations (gated by `company.access`)

| Endpoint | Method | Role | Purpose | Controller | Service | Authz |
|----------|--------|------|---------|------------|---------|-------|
| `dashboard/overview` | GET | Admin / scheduler | Role-aware dashboard analytics | `DashboardController::overview` | — | Policy + `company.access` |
| `entitlements` | GET | Company admin | Plan + feature entitlements | `FeatureController::index` | `EntitlementService` | Policy + `company.access` |
| `entitlements/reporting` | GET | Company admin | Advanced reporting (feature-gated) | `FeatureController::reporting` | — | `feature:advanced_reporting` |
| `companies/{company}/settings` | GET/PUT | Company admin | Company settings | `CompanySettingController::show/update` | — | Policy |
| `companies` | GET/POST | Company admin | List / create company | `CompanyController::index/store` | — | Policy |
| `companies/{company}` | PUT/DELETE | Company admin | Update / delete company | `CompanyController::update/destroy` | — | Policy |
| `branches` | GET/POST | Admin / scheduler | List / create branches | `BranchController` | — | Policy (`branch.view` / `branch.create`) |
| `branches/{branch}` | GET/PUT/DELETE | Admin | Read / update / delete branch | `BranchController` | — | Policy |
| `branches/{branch}/activate` | POST | Company admin | Activate branch (creates branch subscription) | `BranchSubscriptionController::activate` | `BranchSubscriptionService::activateBranch()` | Policy + `BRANCH_LIMIT_REACHED` |
| `branches/{branch}/deactivate` | POST | Company admin | Deactivate branch | `BranchSubscriptionController::deactivate` | `BranchSubscriptionService::deactivateBranch()` | Policy |
| `branches/{branch}/capacity` | PUT | Company admin | Update employee capacity (not billable) | `BranchSubscriptionController::updateCapacity` | `BranchSubscriptionService::setEmployeeCapacity()` | Policy + `EMPLOYEE_CAPACITY_REACHED` |
| `usage` | GET | Company admin | Business usage overview | `BranchSubscriptionController::usage` | `UsageService` | Policy |
| `departments` | CRUD | Admin / scheduler | Department management | `DepartmentController` | — | Policy |
| `positions` | CRUD | Admin | Position management | `PositionController` | — | Policy |
| `employees/invite` | POST | Admin | Invite employee | `EmployeeController::invite` | — | Policy |
| `employees/{employee}/role` | POST | Admin | Assign role | `EmployeeController::assignRole` | — | Policy |
| `employees/{employee}/department` | POST | Admin | Assign department | `EmployeeController::assignDepartment` | — | Policy |
| `employees/{employee}/position` | POST | Admin | Assign position | `EmployeeController::assignPosition` | — | Policy |
| `employees/{employee}/photo` | POST | Admin | Upload photo | `EmployeeController::uploadPhoto` | — | Policy |
| `employees/{employee}/transfer` | POST | Admin | Transfer between branches (capacity-checked) | `EmployeeController::transfer` | `BranchSubscriptionService::transferEmployee()` | Policy + capacity |
| `employees/{employee}/invitation` | POST/DELETE | Admin | Send / revoke invitation | `EmployeeInvitationController::store/destroy` | — | Policy |
| `employees` | CRUD | Admin | Employee management | `EmployeeController` | — | Policy + capacity |
| `employees/{employee}/availabilities` | GET/POST/PUT/DELETE | Employee / admin | Weekly availability | `EmployeeAvailabilityController` | — | Policy |
| `shift-templates` | CRUD | Admin / scheduler | Shift template management | `ShiftTemplateController` | — | Policy |
| `rosters` | CRUD | Admin / scheduler | Roster management | `RosterController` | `RosterService` | Policy |
| `rosters/copy-previous-week` | POST | Scheduler | Copy previous week | `RosterController::copyPreviousWeek` | `RosterService::copyPreviousWeek()` | Policy |
| `rosters/{roster}/publish` | POST | Scheduler | Publish roster | `RosterController::publish` | `RosterService::publish()` | Policy |
| `rosters/{roster}/changes` | GET | Scheduler | Post-publication change history | `RosterChangesController::index` | — | Policy |
| `rosters/{roster}/changes/latest` | GET | Scheduler | Latest change set | `RosterChangesController::latest` | — | Policy |
| `rosters/{roster}/changes/preview` | POST | Scheduler | Preview changes | `RosterChangesController::preview` | — | Policy |
| `rosters/{roster}/changes/apply` | POST | Scheduler | Apply changes | `RosterChangesController::apply` | — | Policy |
| `shifts` | CRUD | Admin / scheduler | Shift management | `ShiftController` | `ShiftService` | Policy |
| `shifts/{shift}/assign-employee` | POST | Scheduler | Assign employee to shift | `ShiftController::assignEmployee` | `ShiftService::assignEmployee()` | Policy |
| `leave-types` | CRUD | Admin | Leave type management | `LeaveTypeController` | — | Policy |
| `leave-requests` | GET/POST | Admin / employee | List / request leave | `LeaveRequestController::index/store` | — | Policy |
| `leave-requests/{leaveRequest}` | GET | Admin / employee | View leave request | `LeaveRequestController::show` | — | Policy |
| `leave-requests/{leaveRequest}/approve` | POST | Admin | Approve leave | `LeaveRequestController::approve` | — | Policy |
| `leave-requests/{leaveRequest}/reject` | POST | Admin | Reject leave | `LeaveRequestController::reject` | — | Policy |
| `device-tokens` | POST/DELETE | Mobile user | Register / unregister push token | `DeviceTokenController::store/destroy` | — | auth:sanctum |
| `notifications` | GET | Any auth user | In-app notifications | `NotificationController::index` | — | auth:sanctum |
| `notifications/read-all` | POST | Any auth user | Mark all read | `NotificationController::markAllAsRead` | — | auth:sanctum |
| `notifications/{notification}/read` | POST | Any auth user | Mark one read | `NotificationController::markAsRead` | — | auth:sanctum |
| `notifications/{notification}` | DELETE | Any auth user | Delete notification | `NotificationController::destroy` | — | auth:sanctum |

### 3.6 Super-admin platform (explicit company id, policy-guarded)

| Endpoint | Method | Role | Purpose | Controller | Service | Authz |
|----------|--------|------|---------|------------|---------|-------|
| `plans` | GET/POST | Super admin (read: admin) | Plan catalogue CRUD | `PlanController` | — | `PlanPolicy` (super admin via `before()`) |
| `plans/{plan}` | GET/PUT/DELETE | Super admin | Single plan management | `PlanController` | — | `PlanPolicy` |
| `companies/{company}/subscriptions` | GET | Super admin | List company subscriptions | `SubscriptionController::index` | — | `SubscriptionPolicy::viewAny` |
| `companies/{company}/subscriptions` | POST | Super admin | Subscribe company (or start checkout with `checkout:true`) | `SubscriptionController::store` | `SubscriptionService::subscribe()/startCheckout()` | `SubscriptionPolicy::create` |
| `companies/{company}/subscriptions/{subscription}` | GET | Super admin | View a subscription | `SubscriptionController::show` | — | `SubscriptionPolicy::view` |
| `companies/{company}/subscriptions/{subscription}/cancel` | POST | Super admin | Cancel subscription | `SubscriptionController::cancel` | `SubscriptionService::cancel()` | `SubscriptionPolicy::update` |
| `companies/{company}/subscriptions/{subscription}/resume` | POST | Super admin | Resume subscription | `SubscriptionController::resume` | `SubscriptionService::resume()` | `SubscriptionPolicy::update` |
| `companies/{company}/subscriptions/{subscription}/swap` | POST | Super admin | Swap plan | `SubscriptionController::swap` | `SubscriptionService::changePlan()` | `SubscriptionPolicy::update` |
| `companies/{company}/subscriptions/{subscription}/payments` | GET | Super admin | List payments | `SubscriptionPaymentController::index` | — | `SubscriptionPolicy::view` |
| `companies/{company}/subscriptions/{subscription}/payments/{payment}/refund` | POST | Super admin | Refund a payment | `SubscriptionPaymentController::refund` | `PaymentService::refund()` | `SubscriptionPolicy::refund` |

---

## 4. Billing Surface Completeness

TASK 17 required the self-service billing surface to be equivalent to:

| Required endpoint | Self-service route | Status |
|-------------------|--------------------|--------|
| `GET /subscription` | `GET /api/v1/subscription` | ✅ Existing |
| `GET /subscription/plans` | `GET /api/v1/subscription/plans` | ✅ Existing |
| `GET /subscription/usage` | `GET /api/v1/subscription/usage` | ✅ Existing |
| `GET /subscription/features` | `GET /api/v1/subscription/features` | ✅ Existing |
| `POST /subscription/checkout` | `POST /api/v1/subscription/checkout` | ✅ **Added** |
| `POST /subscription/upgrade` | `POST /api/v1/subscription/upgrade` | ✅ Existing |
| `POST /subscription/downgrade` | `POST /api/v1/subscription/downgrade` | ✅ Existing |
| `POST /subscription/cancel` | `POST /api/v1/subscription/cancel` | ✅ Existing |
| `POST /subscription/resume` | `POST /api/v1/subscription/resume` | ✅ **Added** |
| `GET /subscription/invoices` | `GET /api/v1/subscription/invoices` | ✅ **Added** |
| `GET /subscription/payments` | `GET /api/v1/subscription/payments` | ✅ **Added** |
| `POST /subscription/billing-portal` | `POST /api/v1/subscription/billing-portal` | ✅ Existing |

Only the four endpoints actually required by the implementation were added
(`checkout`, `resume`, `payments`, `invoices`) — each is a thin wrapper over the
existing `SubscriptionService` / resource methods, with no new backend logic.

### Checkout response shape

`POST /subscription/checkout` returns the **same shape as the platform checkout**
(`SubscriptionController::store` with `checkout:true`), exposing a top-level
`subscription.id`:

```json
{
  "success": true,
  "message": "Stripe Checkout session created successfully.",
  "data": {
    "subscription": { "id": 1, "status": "incomplete", "plan": { ... } },
    "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_...",
    "checkout_session_id": "cs_test_..."
  }
}
```

### Invoices = payments

There is no separate invoice store. Every paid / pending / failed charge is a local
`subscription_payments` row, so `GET /subscription/invoices` surfaces the same records
as `GET /subscription/payments`. The endpoint exists for a complete, self-describing
billing surface.

### Locked-company reactivation

A company whose trial has expired and been locked can still reach:
- `POST /subscription/checkout` (reactivation path)
- `GET /subscription/plans` (choose a plan)
- `GET /companies/{company}` (render the locked view)

Operational routes (`dashboard/overview`, branches, employees, etc.) return **423 +
`SUBSCRIPTION_REQUIRED` + `is_locked: true`** for the same company. This matches
`ProtectedRoute.tsx` and `LockedCompanyPage.tsx`.

---

## 5. Security Notes

- **Webhook** — `StripeBillingWebhookController` verifies the signature with
  `Webhook::constructEvent`, rejects unknown event types, deduplicates via
  `wasProcessed($eventId)`, and refuses to reconcile a subscription that does not
  resolve to a known local provider record (`resolveSubscription()`).
- **Super-admin only actions** — `plans` create/update/delete, `companies/{company}`
  subscription mutations, and refunds are all blocked for company admins/schedulers by
  policy; the `RoleAccessControlTest` suite proves this comprehensively.
- **Company isolation** — every company-scoped route derives context from the
  authenticated user, and `RoleAccessControlTest` proves a company admin cannot view or
  mutate another company's subscription, branch, employee, roster, shift, settings, or
  profile.
- **Error codes** — all lowercase error codes were standardized to uppercase
  (`FEATURE_NOT_AVAILABLE`, `SUBSCRIPTION_REQUIRED`) across middleware, controllers,
  and tests, matching the SPA's `billing-errors.ts`.

---

## 6. Test Coverage

- **New:** `tests/Feature/Billing/SubscriptionSelfServiceSurfaceTest.php` — 13 tests
  covering checkout (happy path, no-price 422, downgrade-allowance rejection, employee
  forbidden), resume (happy path, 404 when none, employee forbidden), payments/invoices
  (list, same rows, 404 without entitled subscription, employee forbidden), and the
  locked-company accessibility contract (billing reachable, operational 423).
- **Existing suites:** `tests/Feature/Billing` + `tests/Feature/Security` — see the
  final test run below for the full pass.

---

## 7. Verification

```bash
# Self-service billing surface (new)
C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe vendor\bin\phpunit tests\Feature\Billing\SubscriptionSelfServiceSurfaceTest.php
# OK (13 tests, 36 assertions)

# Route registration
php artisan route:list --path=api/v1/subscription   # 13 self-service routes
```
