# TASK 16 — Security, Authorization and Three-Role Access Audit

## Objective

Harden the Staff SaaS API for the three-role architecture — **SUPERADMIN / COMPANY-ADMIN / SCHEDULER** (plus the **EMPLOYEE** role) — without changing business functionality unless required to fix an authorization/security issue. This is an audit + test-hardening task. The six sections from the brief are covered below.

**Result: one authorization fix, one user-facing message change, and a new 40-test security suite (68+ assertions). All relevant suites green; the full Feature suite shows only the 13 known pre-existing, unrelated failures.**

---

## 1. Role → Permission Matrix (from the ACTUAL Phase 1 seeder)

Source of truth: [`RoleAndPermissionSeeder`](database/seeders/RoleAndPermissionSeeder.php:15). The seeder defines 41 permissions grouped by module. The matrix below reflects **exactly** what the seeder grants each role — not a copied example table.

| Permission | super_admin | company_admin | scheduler | employee |
|---|:-:|:-:|:-:|:-:|
| `company.view` | ✅ | ✅ | — | — |
| `company.create` | ✅ | ❌ | — | — |
| `company.edit` | ✅ | ✅ | — | — |
| `company.delete` | ✅ | ❌ | — | — |
| `branch.view` | ✅ | ✅ | ✅ | — |
| `branch.create` | ✅ | ✅ | — | — |
| `branch.edit` | ✅ | ✅ | — | — |
| `branch.delete` | ✅ | ✅ | — | — |
| `user.view` / `user.create` / `user.edit` / `user.delete` | ✅ | ✅ | — | — |
| `employee.view` | ✅ | ✅ | ✅ | — |
| `employee.create` / `employee.edit` / `employee.delete` | ✅ | ✅ | — | — |
| `department.view` | ✅ | ✅ | ✅ | — |
| `department.create` / `department.edit` / `department.delete` | ✅ | ✅ | — | — |
| `position.view` | ✅ | ✅ | ✅ | — |
| `position.create` / `position.edit` / `position.delete` | ✅ | ✅ | — | — |
| `roster.view` | ✅ | ✅ | ✅ | ✅ |
| `roster.create` / `roster.edit` | ✅ | ✅ | ✅ | — |
| `roster.delete` | ✅ | ✅ | — | — |
| `roster.publish` | ✅ | ✅ | ✅ | — |
| `shift.view` | ✅ | ✅ | ✅ | ✅ |
| `shift.create` / `shift.edit` / `shift.delete` | ✅ | ✅ | ✅ | — |
| `shift_template.view` | ✅ | ✅ | ✅ | — |
| `shift_template.create` / `shift_template.edit` | ✅ | ✅ | ✅ | — |
| `shift_template.delete` | ✅ | ✅ | — | — |
| `leave_type.view` / `create` / `edit` / `delete` | ✅ | ✅ | — | — |
| `leave_request.view` | ✅ | ✅ | ✅ | ✅ |
| `leave_request.create` | ✅ | ✅ | — | ✅ |
| `leave_request.approve` / `reject` | ✅ | ✅ | ✅ | — |
| `subscription.view` | ✅ | ✅ | — | — |
| `subscription.manage` | ✅ | ✅ | — | — |
| `subscription.refund` | ✅ | ❌ | — | — |
| `report.view` | ✅ | ✅ | ✅ | — |
| `settings.view` / `settings.edit` | ✅ | ✅ | — | — |

Key facts:
- **super_admin** holds every permission (and every policy's `before()` short-circuits to `true`).
- **company_admin** holds every permission **except** `company.create`, `company.delete` and `subscription.refund`.
- **scheduler** holds view on branch/employee/department/position, full roster+shift management with `roster.publish`, shift-template view/create/edit, leave view/approve/reject, `report.view`. **No** subscription, billing, plan, or branch-activation/capacity permission.
- **employee** holds `shift.view`, `roster.view`, `leave_request.view`/`create`.

---

## 2. Authorization Fix — `subscription.refund` is now SUPERADMIN-ONLY

**Finding:** the seeder granted `company_admin` every permission *except* `company.create` and `company.delete`. Because the refund policy is gated by the `subscription.refund` permission, this accidentally let a tenant account push money back out of Stripe.

**Fix** in [`RoleAndPermissionSeeder.php`](database/seeders/RoleAndPermissionSeeder.php:74): `company_admin` now excludes `subscription.refund` as well, with the rationale documented in the seeder:

> `subscription.refund` is SUPERADMIN-ONLY: money leaving the business is an irreversible platform-level action and must never be triggered by a tenant account.

**Why this is safe:** all test suites build roles explicitly in `setUp()` (via `Permission::findOrCreate` / `Role::syncPermissions`) and never run the seeder, so existing tests are unaffected. This is verified below by [`RoleAccessControlTest`](tests/Feature/Security/RoleAccessControlTest.php:49) which mirrors the *corrected* matrix.

---

## 3. API Route Audit

### Audit scope

Inspected every sensitive route family: `companies/{company}`, `subscriptions`, `plans`, `platform-settings`, `payments`, `refunds`, `subscription changes` (upgrade/downgrade/billing-period/cancel/portal) and `branch capacity` (activate/deactivate/update-capacity).

### Findings

| Route family | Guard | Authorization | Verdict |
|---|---|---|---|
| `plans` (apiResource) | `auth:sanctum, account.active` | [`PlanPolicy`](app/Policies/PlanPolicy.php:13): super before → true; `viewAny`/`view` = `subscription.view` (any signed-in tenant); `create`/`update`/`delete` = `subscription.manage` + super-only in practice | ✅ mutations super-only; tenants view-only |
| `companies/{company}/subscriptions*` | `auth:sanctum, account.active` (outside `company.access`) | [`SubscriptionPolicy`](app/Policies/SubscriptionPolicy.php:14) `belongsToCompany` + super before | ✅ cross-company 403; super can manage any tenant |
| `GET companies/{company}` (show) | `auth:sanctum, account.active` (outside `company.access` — locked-company billing view) | [`CompanyPolicy::view`](app/Policies/CompanyPolicy.php:33) `belongsToCompany` + super before | ✅ still 403 for other tenants |
| `companies/{company}` update/delete | `company.access` | [`CompanyPolicy::update`/`delete`](app/Policies/CompanyPolicy.php:51) | ✅ tenant can edit own only; delete super-only |
| `subscription` self-service (`/api/v1/subscription*`) | `company.access` | [`PlanSubscriptionController::resolveCompany()`](app/Http/Controllers/Api/PlanSubscriptionController.php:319) pins to `$request->user()->company`; `subscription.view`/`manage` | ✅ tenant-scoped, scheduler-blocked |
| `payments` + `refund` | `auth:sanctum` via `companies/{company}/subscriptions/{subscription}` | [`SubscriptionPolicy::refund`](app/Policies/SubscriptionPolicy.php:62) requires `subscription.refund` (super-only after fix) | ✅ **fix applied** |
| `platform-settings/trial` | `auth:sanctum` | [`PlatformTrialSettingController::ensureSuperAdmin()`](app/Http/Controllers/Api/PlatformTrialSettingController.php:46) — explicit role check | ✅ super-only |
| `branches/{branch}/activate` / `deactivate` / `capacity` | `company.access` | [`BranchPolicy::activate`/`deactivate`/`manageCapacity`](app/Policies/BranchPolicy.php:66) = `branch.*` + `belongsToCompany` | ✅ scheduler-blocked, cross-company 403 |
| Dashboard `/dashboard/overview` | `company.access` | [`DashboardController`](app/Http/Controllers/Api/DashboardController.php:30): super → platform scope; tenant → own company scope | ✅ scoped |

### Middleware note

`EnsureActiveSubscription` (aliased `subscription.active`) is **not** applied to API routes; [`CheckCompanyAccess`](app/Http/Middleware/CheckCompanyAccess.php:16) (aliased `company.access`) is the effective operational gate. This was confirmed correct: access-gating and authorization remain policy/controller-driven so security tests exercise the real rules, and no route depends on a bypassable alias.

### Control-flow note (refunds)

`SubscriptionPaymentController::refund()` → `authorize('refund', [subscription, company])` → verifies the payment belongs to the subscription (404) → validates amount → [`PaymentService::refund()`](app/Services/PaymentService.php:21) → `isRefundable()` (`succeeded` + `stripe_payment_intent_id` + `amount_refunded < amount`) → `refundInStripe` uses `$payment->subscription?->user` → `BillingProvider::refund`. Only a super admin can reach this (permission removed from tenants).

---

## 4. Tenant Isolation Verification

**Mechanism (verified, not just assumed):**
- All singleton policies end with a `belongsToCompany()` guard (e.g. [`BranchPolicy`](app/Policies/BranchPolicy.php:91), [`EmployeePolicy`](app/Policies/EmployeePolicy.php:73), [`RosterPolicy`](app/Policies/RosterPolicy.php:73), [`ShiftPolicy`](app/Policies/ShiftPolicy.php:65), [`CompanyPolicy`](app/Policies/CompanyPolicy.php:69), [`SubscriptionPolicy`](app/Policies/SubscriptionPolicy.php:72)).
- All list endpoints pin `company_id` to `$request->user()->company_id` for non-super users; `PlanSubscriptionController::resolveCompany()` always pins to the authenticated user's company.
- `GET companies/{company}` sits outside `company.access` but is still guarded by `CompanyPolicy` → cross-tenant 403 (proved by test).

**Malicious-ID tests (12):** a company admin attacking another company's IDs gets **403** on: subscription show, subscription list, payments list, branch show, branch update, employee show, employee edit, roster show, shift show, company profile (GET show), company settings update; plus a scheduler attacking another company's branch. See section "Test coverage" below.

---

## 5. Schedular Restrictions + Capacity Message

### Restrictions (each returns 403, and DB state is asserted unchanged)

The scheduler **cannot**:
- view the subscription, upgrade, downgrade, cancel, change billing period, or open the billing portal
- list plans
- refund a payment
- activate or deactivate a branch
- change branch employee capacity
- create or update an employee

**Positive control:** `test_scheduler_can_manage_rosters_and_shifts` proves the scheduler is **not** over-restricted — they can create and publish a roster and create shifts (their `roster.*` / `shift.*` grants).

### Capacity message change

When a scheduling action (employee creation) is blocked by branch capacity, the API now returns:

```
status: 422
{ "success": false, "code": "EMPLOYEE_CAPACITY_REACHED",
  "message": "Employee capacity reached. Contact your company administrator.",
  "errors": { "used": 1, "capacity": 1, ... } }
```

**Change:** in [`BranchSubscriptionService::assertCanAddEmployee()`](app/Services/BranchSubscriptionService.php:207), the message was updated from `'This branch has reached its employee capacity.'` to `'Employee capacity reached. Contact your company administrator.'` — the `code` and `errors.*` context are unchanged, and the exception doc comment in [`BranchCapacityException`](app/Exceptions/BranchCapacityException.php:23) was updated to match. Verified by `test_capacity_blocked_employee_creation_shows_the_company_admin_message`.

---

## 6. Superadmin Scoping — Bypass is Scoped, Not Blanket

The `before()` short-circuit (`if ($user->hasRole('super_admin')) return true;`) applies only to **policy abilities**; it does not bypass:
- route-level middleware (`company.access`, `auth:sanctum`, `account.active`)
- the explicit `ensureSuperAdmin()` guard on platform settings (a tenant can never reach it even though `before()` returns true only for super_admin by role check)
- tenant-scoped `resolveCompany()` pinning for tenant-facing endpoints

**Verified:** super admin can reach the platform dashboard (scope `platform`, sees all companies), read/write `platform-settings/trial`, manage any company's subscription via `companies/{company}/subscriptions`, view any company profile, and refund a payment — while a company admin gets 403 on all of those platform actions and stays inside their own company scope on the dashboard.

---

## Test Coverage — [`tests/Feature/Security/RoleAccessControlTest.php`](tests/Feature/Security/RoleAccessControlTest.php:49)

40 tests (68+ assertions) in `Tests\Feature\Security`, mirroring the **corrected** seeder matrix (including the super-only refund) via explicit role construction in `setUp()`. Sections:

1. **Tenant isolation (12)** — cross-company subscription/list/payments/branch show+update/employee show+edit/roster/shift/profile/settings + scheduler-branch attack, all 403.
2. **Schedular restrictions (15)** — subscription view/upgrade/downgrade/cancel/billing-period/billing-portal/plans/refund, branch activate/deactivate/capacity, employee create/update all 403 with DB-state asserts; capacity-message test (message + code + errors); positive control for scheduler roster/shift work.
3. **Billing / payment permissions (6)** — company admin views own subscription+payments and can upgrade; **cannot refund** (403) and **cannot manage plans** (view-only; create/update/delete 403); employee blocked from subscription/plans; guest rejected everywhere (401).
4. **Superadmin scoping (7)** — platform vs company dashboard scope, platform-settings read/write (super 200 / admin 403), cross-tenant subscription management, **refund succeeds only for super admin** (via `fakeBillingProvider()` + `stripe_payment_intent_id`), cross-tenant profile view.

Helpers: `actingAsCompanyAdmin/Scheduler/SuperAdmin/Employee`, `makeCompanyWithActiveSubscription()` (returns company/plan/subscription/branch), `activateBranchViaApi()`, `fakeBillingProvider()` (anonymous-class `BillingProvider` bound into the container so refunds/portal run without real Stripe).

---

## Changes Made in this Task

1. [`database/seeders/RoleAndPermissionSeeder.php`](database/seeders/RoleAndPermissionSeeder.php:74) — **authorization fix**: `company_admin` no longer receives `subscription.refund` (now super-only); updated comment documenting the rationale.
2. [`app/Services/BranchSubscriptionService.php`](app/Services/BranchSubscriptionService.php:250) — capacity-blocked message changed to `'Employee capacity reached. Contact your company administrator.'`.
3. [`app/Exceptions/BranchCapacityException.php`](app/Exceptions/BranchCapacityException.php:23) — example response in the doc comment updated to match.
4. [`tests/Feature/Security/RoleAccessControlTest.php`](tests/Feature/Security/RoleAccessControlTest.php:49) — **new** 40-test security suite.

---

## Test Results

- **Security suite** [`RoleAccessControlTest`](tests/Feature/Security/RoleAccessControlTest.php:49): **40/40 pass** (68+ assertions).
- **Relevant suites** (Security + Billing + Employee): **268 tests, 789 assertions — all OK**.
- **Full Feature suite**: 455 tests → **1 error + 12 failures, all pre-existing and unrelated** (Auth Breeze 405s: AuthenticationTest, PasswordConfirmationTest, PasswordUpdateTest, RegistrationTest, ProfileTest; EmailVerificationTest `RouteNotFoundException`; RosterChangesTest). This matches the known 13 pre-existing failures from TASK 13 — **no regressions introduced** by TASK 16.

> Note on linting: the workspace `php` CLI is PHP 8.0.30, which falsely flags `readonly` properties as syntax errors. Linting was validated with the correct binary `C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe` → "No syntax errors detected."
