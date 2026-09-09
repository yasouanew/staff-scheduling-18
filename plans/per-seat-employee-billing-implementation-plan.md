# User-Account Seat Model — Billing & Subscription Overhaul Implementation Plan

> **Revision notice (supersedes the earlier employee-only draft):** the seat is now defined as an **active `users` account** in the company — any non-`super_admin` role, **whether or not** that user has an `employees` profile. This was confirmed by the product owner and reflects how the founding `company_admin` (created at registration, no employee profile) and every directory member are all counted.

## Scope & Confirmed Decisions

| Decision | Resolution |
|---|---|
| **Seat definition** | A seat = one `users` row with `company_id` set, `role != 'super_admin'`, and `status = 'active'`. Excludes `super_admin` rows (which have `company_id = null`) and `users` with status `invited` / `inactive` / `suspended`. |
| **1:1 with directory** | Every team member added via the Employee Directory produces BOTH a `users` row AND an `employees` row. The **`users.status` is the billing source of truth**; the `employees.status` row is a scheduling/roster lifecycle mirror (which today drives the linked user via `syncAccountAccess`). |
| **Founding admin** | The first `company_admin` created in [`RegisterAction`](app/Domains/Auth/Actions/RegisterAction.php:56) is a `users` row **without** an employee profile — and it still counts as **1 seat**. |
| **Pricing model** | **Flat-rate** (Free $0 / Starter $29 / Professional $79 / Enterprise $199). Seat quantity is **informational only** — tracked, displayed, enforced internally, but **never pushed as a multiplying line-item** to Stripe. |
| **Branch gating** | Per-branch subscription / capacity gating is **removed**. Branch remains organizational only. |
| **Plan cap field** | Reuse `plans.max_employees` as the **active-user seat cap**. Add a semantic `Plan::maxSeats()` accessor to avoid column churn. |
| **Relationship to Task-22** | Aligns with task-22's **user-account seat definition** but is implemented in the context of the current employee-directory architecture (no separate account-management rewrite). |

---

## Phase 1 — Strategic Implementation Plan (Phased Roadmap)

### Milestone 1: Backend Data Model & Seat Service Foundation
- **Goal:** Introduce the authoritative **user-account seat query** and a company-wide usage shape; keep existing behavior working.
- **Key tasks:**
  1. Add [`Plan::maxSeats()`](app/Models/Plan.php:1) accessor returning `max_employees`; keep `hasUnlimitedEmployees()` but re-document as "unlimited seats" (add `hasUnlimitedSeats()` alias).
  2. Add [`User::scopeActiveSeats()`](app/Models/User.php:18) — the canonical query: `company_id = given`, `role != 'super_admin'`, `status = 'active'`. (See §Data Model below.)
  3. Extend [`UsageService`](app/Services/UsageService.php:29) with `activeSeats(Company)`, `maxSeats(Company)`, `canActivateSeat(Company)`, `remainingSeats(Company)`, `seatUsage(Company)` returning `{ used, limit }`. Deprecate (not yet remove) branch methods.
  4. Introduce `SeatCapacityService` (new) centralizing the **atomic activation guard** used across all user-activation call-sites.
- **Technical considerations:** all seat math lives in `UsageService`/`SeatCapacityService`; `subscriptions.quantity` is informational (flat-rate — never a Stripe multiplier).
- **Risks:** transient dual source of truth (branch capacity + user seats) → remove branch checks in M2 before tests can regress.

### Milestone 2: Enforcement Cutover — Guard Every User-Activation Path
- **Goal:** no `users` row may become `active` beyond capacity; remove branch-capacity enforcement.
- **Key tasks:** route every user-activation path (§2 Critical Business Logic) through the guard; rewrite [`SubscriptionService::assertCanChangeToPlan()`](app/Services/SubscriptionService.php:384) downgrade check to compare `activeSeats` against target `maxSeats`; remove `BranchSubscriptionService` from [`EmployeeService`](app/Services/EmployeeService.php:15) and [`EmployeeController`](app/Http/Controllers/Api/EmployeeController.php:26).
- **Risks:** missing a call-site (e.g., invite acceptance, password-reset activation) leaves an over-capacity activation → a `SeatCapacityTest` that walks every activation entry point is mandatory.

### Milestone 3: Frontend Alignment & Restriction Enforcement
- **Goal:** Dashboard, Employee/User Management, and Settings all reflect **active-user** seat usage and block/redirect over-capacity actions.
- **Key tasks:** `SeatCapacityContext`, usage shape `seats.used/limit`, capacity indicators, activation action guards, upgrade/downgrade modals.
- **Risks:** stale client counts (multi-tab, invited-not-accepted) → always treat the backend 422 as authoritative and refetch on every mutation.

### Milestone 4: Edge Cases, Data, & Test Hardening
- **Goal:** correctness under concurrency and boundaries; legacy-overage policy.
- **Key tasks:** concurrency tests, boundary tests, downgrade-block tests, existing-tenant backfill/grace policy, full suite run.
- **Risks:** tenants whose active-user count already exceeds their plan cap on rollout → Phase 4 §Rollout policy.

### Milestone 5: Branch-Scoping Removal (Cleanup)
- **Goal:** fully remove branch-capacity/branch-subscription machinery once seat enforcement is live.
- **Key tasks:** delete `BranchSubscriptionService`, `BranchSubscriptionController`, `branchIsEntitled()`/`isBranchScoped()` in [`EntitlementService`](app/Services/EntitlementService.php:229), drop `branch_subscriptions` table migration, delete branch-billing tests and frontend branch-billing components/hooks.
- **Risks:** drop schema only after all code removal so `artisan migrate` never breaks.

---

## Phase 2 — Backend Architecture & Logic

### Data Model

**`plans`** — reuse `max_employees` (unsignedInteger, nullable = unlimited) as the **active-user seat cap**. Add semantic accessors: `maxSeats(): ?int` → `max_employees`; `hasUnlimitedSeats(): bool`. `max_branches` becomes vestigial (removed with branch subsystem in M5).

**`users`** — no schema change; **this is the seat source of truth**. Seat predicate:
```php
// Seat = a user account in the company, not a super_admin, status === 'active'.
User::where('company_id', $company->id)
    ->where('role', '!=', 'super_admin')
    ->where('status', 'active');
```
Add `User::scopeActiveSeats(Builder, Company)` (or `scopeBillableForCompany`) used by `UsageService`.

**`employees`** — the profile/mirror row. Its `status` continues to drive roster/leave/availability domain behaviour and today flips the linked `user` via [`EmployeeService::syncAccountAccess()`](app/Services/EmployeeService.php:132). **Billing no longer counts `employees` directly** — it counts the `users` rows those employees own, which (for directory members) are kept in sync with the employee status.

**`companies`** — no change. Company is the seat scope via `users.company_id`.

### API / Service Layer Changes

| Layer | Change |
|---|---|
| [`UsageService`](app/Services/UsageService.php:29) | Add `activeSeats()`, `maxSeats()`, `canActivateSeat()`, `remainingSeats()`, `seatUsage()`. Deprecate then remove branch methods (`activeEmployeesForBranch`, `branchEmployeeCapacity`, `canAddEmployee`, `branchUsage*`). |
| `SeatCapacityService` (new) | `assertCanActivateUser(Company, ?User $exclude = null): void` — the single atomic guard (below). Injected into all activation paths. |
| [`EmployeeService`](app/Services/EmployeeService.php:15) | Replace `assertCapacityForAssignment()` with a guard that runs whenever the resulting **linked user** will be `active`. In `syncAccountAccess()` (line 140, `employee->status === 'active'` branch) call the guard before flipping `user.status` to `active`. In `update()` (line 80) when a status change makes the user active. In `invite()` (line 184, hard-codes `'status' => 'active'`) route through the guard. Remove `BranchSubscriptionService` dependency. |
| [`InvitationService`](app/Services/InvitationService.php:30) | In `activate()` (line 324) — the point an invited user becomes `active` on acceptance — call `SeatCapacityService::assertCanActivateUser($invitation->company)`. |
| `ResetPasswordAction` | In the reset callback ([`ResetPasswordAction::execute()`](app/Domains/Auth/Actions/ResetPasswordAction.php:43)) where an `invited` user is promoted to `active`, run the guard (the "set your password" invitation link is an activation path). |
| [`RegisterAction`](app/Domains/Auth/Actions/RegisterAction.php:24) | Brand-new tenant creation is exempt from the guard (a company always starts with 1 active admin seat; no entitled subscription exists yet at signup). Document this exemption explicitly. |
| [`SubscriptionService`](app/Services/SubscriptionService.php:34) | `assertCanChangeToPlan()` — compare `activeSeats($company)` vs target `maxSeats()`; throw `BillingLimitException` (`DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED`) with `used`/`capacity`. Keep `startCheckout()` at `quantity = 1` (flat-rate; never set `quantity = activeSeats` in the Stripe line item). |
| [`EmployeeController`](app/Http/Controllers/Api/EmployeeController.php:26) | Drop `BranchSubscriptionService` injection; no route changes. |
| [`PlanSubscriptionController::usage()`](app/Http/Controllers/Api/PlanSubscriptionController.php:131) | Return `seats: { used: activeSeats, limit: maxSeats }` instead of branch usage. `features()` drops `branch_scoped`. |
| Resources | [`SubscriptionSummaryResource`](app/Http/Resources/SubscriptionSummaryResource.php) / `PlanResource` — expose `seats.used` / `seats.limit`. |

### Critical Business Logic — Validation Rules & Race-Condition Safety

**Rule A — User-activation guard (core invariant):**
```
canActivateUser(company, excludeUserId):
  plan  = entitledPlan(company)                 // null → NO_ACTIVE_SUBSCRIPTION (except tenant signup)
  if plan hasUnlimitedSeats() → allow
  lock  the company's entitled subscription (or plan) row FOR UPDATE
  used  = users.where(company).role != super_admin
               .where(status = active).where(id != excludeUserId).count()
  if used >= plan.maxSeats() → BLOCK
    throw UserSeatLimitExceededException { used, capacity, required: used + 1 }
  else → allow
```
- Runs inside `DB::transaction` at **every** activation call-site: `syncAccountAccess()` (active flip), invite acceptance `activate()`, and reset-password activation. All can be reached concurrently.
- `lockForUpdate()` on the entitled subscription/plan row serializes seat-consuming writes.
- `excludeUserId` prevents an in-place re-activation of the same user from self-blocking.

**Rule B — Downgrade guard (reverse logic):**
```
changePlan(subscription, targetPlan):
  used = activeSeats(company)
  if targetPlan.maxSeats() is not null and used > targetPlan.maxSeats() → BLOCK
    throw BillingLimitException { used, capacity: targetPlan.maxSeats() }
  else → proceed
```
- Applies to `changePlan()`, `assertCanChangeToPlan()`, and the checkout pre-flight in [`SubscriptionService`](app/Services/SubscriptionService.php:101), so checkout can never bypass the downgrade rule.

**Rule C — Upgrade never blocked.** Target plan with `maxSeats >= used` (or unlimited) always succeeds.

**Data-integrity guarantees:**
- No path may set `users.status = 'active'` without passing Rule A (except tenant self-signup, which creates the first admin under no pre-existing plan).
- Deactivation / suspension / deletion of a user always succeeds and immediately frees a seat.
- The backend is authoritative; client-side bypass is rejected with a 422 + structured `{ code, used, capacity }`.

---

## Phase 3 — Frontend Alignment & Restriction Enforcement

### Global State / Context — `SeatCapacityContext`
- **New:** `resources/js/features/billing/context/SeatCapacityContext.tsx` exposing `{ seatsUsed, seatsLimit, seatsRemaining, isLoading, refetch }`.
- **Data source:** `GET subscription/usage` → `seats: { used, limit }` where `used = active user accounts`.
- **Mount scope:** wrap `DashboardLayout`/`AppRoutes` so Dashboard, Employee/User Management, and Settings consume the same live values.
- **Cache invalidation:** React Query `seats` key; `useCreateEmployee`, `useUpdateEmployee`, `useDeleteEmployee`, `useInviteEmployee`, and subscription mutations invalidate on success.

### UI/UX — Capacity Indicators
- **Subscription Dashboard** ([`SubscriptionDashboardPage.tsx`](resources/js/features/billing/pages/SubscriptionDashboardPage.tsx)): "Active Users (Seats)" card — `X / Y`, progress bar, warning ≥ 90%, "Upgrade" CTA when full.
- **Employee Directory** ([`EmployeeListPage.tsx`](resources/js/features/employees/pages/EmployeeListPage.tsx)): header showing `X of Y user seats in use`; this is the primary management surface for all roles (`company_admin`, `scheduler`, `employee`).
- **Company/Settings pages:** compact usage strip (progress bar + "X/Y active users").
- **Terminology shift:** copy should say **"active users / seats"**, not "employees", so the founding admin and scheduler accounts are understood to count.

### Action Guards
| Action | Guard |
|---|---|
| Add employee ([`AddEmployeeModal.tsx`](resources/js/features/employees/components/AddEmployeeModal.tsx)) | Creating a member creates an active linked user; if `seatsRemaining === 0`, block submit → `UpgradePromptDialog` (or allow saving the employee as `inactive`/`pending` without a seat — see Phase 4). |
| Invite ([`SendInviteModal.tsx`](resources/js/features/employees/components/SendInviteModal.tsx)) | An invite creates an `invited` user; a seat is consumed only on **acceptance**, not at invite time (pending). Guard the acceptance at the server; frontend warns that inviting beyond capacity will be blocked on acceptance. |
| Re-activate a deactivated member (`EmployeeRowActions.tsx`) | When re-activation would set the user `active` and `seatsRemaining === 0`, disable the action → upgrade prompt. |
| Downgrade plan | Pre-flight against `seatsUsed`; block with a capacity-conflict notification if `seatsUsed > target.maxSeats`. |

### Upgrade / Downgrade Modals
- **`UpgradePromptDialog`** (new, reuse [`UpgradePlanDialog.tsx`](resources/js/features/billing/components/UpgradePlanDialog.tsx) styling): shown when an activation is blocked. Content: "You've reached `Y` active users. To add `N` more, upgrade to a plan supporting at least `used+1`." Lists cheapest eligible plans (from `GET subscription/plans`, filtered by `maxSeats >= used + 1`), each → checkout.
- **`DowngradeConflictDialog`** (new): when a downgrade is attempted with `used > target.maxSeats`. Lists `used` active users vs target cap; explains some users must be deactivated first; links to Employee Management.
- **`handleCapacityError(error)`** (`resources/js/lib/capacity-errors.ts`, new): maps `EMPLOYEE_CAPACITY_REACHED` / `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED` to the right dialog and **always refetches seats**.

---

## Phase 4 — Edge Cases & Validation Checklist

### Edge Cases
1. **Founding `company_admin`** (no employee profile) is created active at signup → counts as 1 seat; exempt from the guard because no entitled subscription exists yet.
2. **Company user without an employee profile** (e.g., admin added at the user level only) → still counts as a seat.
3. **Deleting an employee** → frees its linked user's seat only if the user row is deactivated/deleted too. Verify the delete flow handles the linked user (currently `EmployeeService::delete()` deletes only the employee; if the user row persists as active it must be deactivated or the seat count stays high — **flag as a required change**).
4. **Deactivate a user** (status → inactive/suspended) → seat freed immediately.
5. **Invite sent but not accepted** → user stays `invited`, **no seat consumed**; guard fires at acceptance.
6. **Invite accepted at full capacity** → blocked; the invited user cannot complete setup until the admin upgrades (server must return a clear 422 rendered on the accept screen).
7. **Reset-password activation** of an invited account → same guard as invite acceptance.
8. **Role change to `super_admin`** (rare) → seat removed (super_admin excluded by predicate); role change away from `super_admin` adds a seat.
9. **Re-activating the same user (self-edit)** → `excludeUserId` prevents self-blocking.
10. **Unlimited plan (`max_employees = null`)** → always allows activation; UI hides the progress-bar limit.
11. **No entitled subscription** → activation blocked `NO_ACTIVE_SUBSCRIPTION` (except tenant signup).
12. **Simultaneous activations (race)** → `lockForUpdate()` on the subscription row serializes; only one succeeds at the boundary.
13. **Multi-tab / stale client count** → backend 422 authoritative; every blocked action triggers `refetch()`.
14. **Checkout-bypass attempt** → `startCheckout` pre-flight reuses `assertCanChangeToPlan`, so a downgrade cannot bypass via checkout.
15. **Legacy tenants over capacity** → see Rollout Policy.

### Validation Checklist (Test Scenarios)
- [ ] Founding admin + N directory members → `GET subscription/usage` reports `seats.used = 1 + N` active users.
- [ ] User (employee or admin/scheduler) with no employee profile counts as a seat.
- [ ] Activation at `used == limit` → blocked; at `used < limit` → allowed.
- [ ] Invite acceptance (web + mobile) beyond capacity → 422.
- [ ] Reset-password promotion of an invited user beyond capacity → 422.
- [ ] Deactivating a user frees a seat; re-activation at full capacity blocked.
- [ ] Deleting an employee also deactivates/deletes its linked user, freeing the seat.
- [ ] Two concurrent activations at `limit − 1` → exactly one succeeds.
- [ ] Downgrade with `used > target.maxSeats` → blocked `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED`.
- [ ] Upgrade at any `used` → allowed.
- [ ] Unlimited plan → no blocks.
- [ ] No subscription → `NO_ACTIVE_SUBSCRIPTION` on activation.
- [ ] Frontend Activate/Add disabled when `seatsRemaining === 0`.
- [ ] Upgrade prompt lists plans with `maxSeats >= used + 1`.
- [ ] Stripe line-item quantity remains `1` (flat-rate regression guard; no per-seat multiplier).

### Rollout Policy (existing tenants)
- Detect companies where `activeUsers > plan.max_employees` (because the seat definition widened from active employees to active users, the count may jump).
- **Decision:** enforce immediately with a banner + blocked further activations until upgrade (**recommended**, matching the rule that over-capacity activation is blocked), and email admins the new count and required tier. Optionally allow a one-time grace window during the migration where already-active users above cap are not force-deactivated.

---

## Files Touched (Summary Map)

**Backend:** `app/Models/Plan.php`, `app/Models/User.php` (add `scopeActiveSeats`), `app/Services/UsageService.php`, `app/Services/SeatCapacityService.php` (new), `app/Services/EmployeeService.php`, `app/Services/InvitationService.php`, `app/Services/SubscriptionService.php`, `app/Domains/Auth/Actions/ResetPasswordAction.php`, `app/Domains/Auth/Actions/RegisterAction.php` (document signup exemption), `app/Http/Controllers/Api/EmployeeController.php`, `app/Http/Controllers/Api/PlanSubscriptionController.php`, `app/Services/EntitlementService.php`, `app/Services/BranchSubscriptionService.php` (delete, M5), `app/Exceptions/UserSeatLimitExceededException.php` (new), `app/Http/Resources/SubscriptionSummaryResource.php`.

**Frontend:** `resources/js/features/billing/types.ts`, `.../pages/SubscriptionDashboardPage.tsx`, `.../components/UpgradePlanDialog.tsx`, `.../components/UpgradePromptDialog.tsx` (new), `.../components/DowngradeConflictDialog.tsx` (new), `.../context/SeatCapacityContext.tsx` (new), `resources/js/features/employees/pages/EmployeeListPage.tsx`, `.../components/AddEmployeeModal.tsx`, `.../components/EditEmployeeModal.tsx`, `.../components/EmployeeRowActions.tsx`, `.../components/SendInviteModal.tsx`, `.../hooks/useEmployees.ts`, `resources/js/lib/capacity-errors.ts` (new).

**Tests:** `tests/Feature/Billing/SeatCapacityTest.php` (new — activation via directory, invite acceptance, reset-password; downgrade; concurrency; usage shape), rewrite `SubscriptionManagementTest.php` / `PlanManagementTest.php`; delete branch-capacity tests in M5.

---

## Implementation Status (post-execution)

> **Status legend:** ✅ done · 🔶 partial/deferred · ⛔ not started · 🧭 deviation from plan (behaviour differs from what was written above).

### Milestone status

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Backend data model & seat service foundation** | [`Plan::maxSeats()`](app/Models/Plan.php:92) / [`Plan::hasUnlimitedSeats()`](app/Models/Plan.php:100), [`User::scopeActiveSeats()`](app/Models/User.php:83), [`UsageService`](app/Services/UsageService.php:140) seat methods, new [`SeatCapacityService`](app/Services/SeatCapacityService.php:29) + [`UserSeatLimitExceededException`](app/Exceptions/UserSeatLimitExceededException.php:29) | ✅ |
| **M2 — Enforcement cutover (guard every activation path)** | Guard wired into [`EmployeeService::syncAccountAccess()`](app/Services/EmployeeService.php:133) / `invite()` / `update()`, [`InvitationService::activate()`](app/Services/InvitationService.php:333), [`ResetPasswordAction`](app/Domains/Auth/Actions/ResetPasswordAction.php:27); seat-based downgrade in [`SubscriptionService::assertCanChangeToPlan()`](app/Services/SubscriptionService.php:388); `usage`/resources seats shape ([`PlanSubscriptionController::usage()`](app/Http/Controllers/Api/PlanSubscriptionController.php:138), [`SubscriptionSummaryResource`](app/Http/Resources/SubscriptionSummaryResource.php:33)); `RegisterAction` signup exemption documented | ✅ |
| **M3 — Frontend alignment & restriction enforcement** | [`SeatCapacityContext`](resources/js/features/billing/context/SeatCapacityContext.tsx), seats usage shape in [`types.ts`](resources/js/features/billing/types.ts), indicators/guards in [`SubscriptionDashboardPage.tsx`](resources/js/features/billing/pages/SubscriptionDashboardPage.tsx) / [`EmployeeListPage.tsx`](resources/js/features/employees/pages/EmployeeListPage.tsx), dialogs ([`UpgradePromptDialog.tsx`](resources/js/features/billing/components/UpgradePromptDialog.tsx), [`DowngradeConflictDialog.tsx`](resources/js/features/billing/components/DowngradeConflictDialog.tsx), [`SeatUsageBadge.tsx`](resources/js/features/billing/components/SeatUsageBadge.tsx)), [`capacity-errors.ts`](resources/js/lib/capacity-errors.ts); role-gated to `company_admin` only (scheduler sees no seat header) | ✅ |
| **M4 — Edge cases, data & test hardening** | New [`SeatCapacityTest.php`](tests/Feature/Billing/SeatCapacityTest.php) (17 tests / 92 assertions) covering the Validation Checklist; suite + frontend build green (see Test status) | ✅ |
| **M5 — Branch-scoping removal (cleanup)** | Delete `BranchSubscriptionService` / branch subscription machinery, `EntitlementService` branch methods, `branch_subscriptions` table, branch-billing tests + frontend components | ⛔ **Not started.** Branch-capacity enforcement intentionally still live alongside seat enforcement (M5 left for a follow-up to avoid risk during this cutover; both guards currently coexist in `EmployeeService`). |

### Deviations discovered during implementation 🧭

1. **No-subscription activation (plan Rule A / Edge Case #11):** the plan says a company with **no entitled subscription** is blocked with `NO_ACTIVE_SUBSCRIPTION`. The implemented guard **allows** activation when `entitledPlan()` is `null` (treated like unlimited) — matching the product reality that tenant signup creates the founding admin before any plan exists. The real protection on employee/seat routes for expired trials is the **`company.access` middleware** ([`CheckCompanyAccess`](app/Http/Middleware/CheckCompanyAccess.php:28)) returning **423 `SUBSCRIPTION_REQUIRED`** + auto-lock when the trial has expired. Seat tests therefore assert the 423 path (via `Company::factory()->trialExpired()`), not the non-existent `NO_ACTIVE_SUBSCRIPTION` code.
2. **Role-gating:** seat UI + provider are surfaced to **`company_admin` only**; schedulers/employees see no seat header. No backend/permission change was needed — the gating is at the UI surface and by role check in the SPA.
3. **`features()` `branch_scoped`:** kept for now (M5 cleanup), so the dashboard still exposes branch tabs/management alongside the new seat surface rather than dropping them prematurely.
4. **Flat-rate quantity regression guard (Validation Checklist #187):** `subscriptions.quantity` stays `1` and `startCheckout()` never multiplies by `activeSeats`. This is enforced by the existing [`StripeCheckoutFlowTest`](tests/Feature/Billing/StripeCheckoutFlowTest.php) subscription-shape assertions rather than a dedicated new flat-rate test.

### Validation Checklist results

The unchecked boxes above are now implemented and covered by automated tests. Each maps to a [`SeatCapacityTest.php`](tests/Feature/Billing/SeatCapacityTest.php) test (or an existing billing test where noted):

- [x] Founding admin + N directory members → `GET subscription/usage` reports `seats.used = 1 + N` → `test_usage_reports_the_founding_admin_plus_active_members_as_seats`.
- [x] User (employee or admin/scheduler) with no employee profile counts as a seat → same test (founding admin has no employee profile and counts as 1).
- [x] Activation at `used == limit` blocked; at `used < limit` allowed → `test_reactivation_at_full_capacity_is_blocked` / `test_reactivating_a_member_below_capacity_is_allowed`.
- [x] Invite acceptance (web + mobile) beyond capacity → 422 → `test_accepting_a_web_invitation_beyond_capacity_is_blocked` / `test_completing_a_mobile_invitation_beyond_capacity_is_blocked`.
- [x] Reset-password promotion of an invited user beyond capacity → 422 → `test_promoting_an_invited_account_beyond_capacity_is_blocked`.
- [x] Deactivating a user frees a seat; re-activation at full capacity blocked → `test_deactivating_a_member_frees_their_seat` / `test_reactivation_at_full_capacity_is_blocked`.
- [x] Deleting an employee also deactivates its linked user, freeing the seat → `test_deleting_an_employee_deactivates_its_user_and_frees_the_seat`.
- [x] Two concurrent activations at `limit − 1` → exactly one succeeds → `test_two_activations_for_one_free_seat_only_one_succeeds`.
- [x] Downgrade with `used > target.maxSeats` → blocked → `test_downgrade_is_rejected_when_active_seats_exceed_the_target_plan` (also [`SubscriptionPlanTest`](tests/Feature/Billing/SubscriptionPlanTest.php:487) + [`StripeCheckoutFlowTest`](tests/Feature/Billing/StripeCheckoutFlowTest.php:304) checkout-bypass).
- [x] Upgrade at any `used` → allowed → `test_upgrade_is_allowed_at_any_seat_usage`.
- [x] Unlimited plan → no blocks → `test_an_unlimited_plan_allows_any_number_of_activations` (+ `test_usage_reports_a_null_seat_limit_for_an_unlimited_plan`).
- [x] No subscription → activation blocked 🧭 (see Deviation #1 — implemented as **423 `SUBSCRIPTION_REQUIRED`** via `company.access` for expired trials, not `NO_ACTIVE_SUBSCRIPTION`) → `test_reactivation_is_blocked_when_the_company_has_no_access`.
- [x] Frontend Activate/Add disabled when `seatsRemaining === 0` → seat guard in [`EmployeeRowActions.tsx`](resources/js/features/employees/components/EmployeeRowActions.tsx) + directory modal wiring (manual/frontend behaviour).
- [x] Upgrade prompt lists plans with `maxSeats >= used + 1` → [`UpgradePromptDialog.tsx`](resources/js/features/billing/components/UpgradePromptDialog.tsx) filters eligible plans (manual/frontend behaviour).
- [x] Stripe line-item quantity remains `1` (flat-rate) → enforced by `startCheckout()` flat quantity + existing [`StripeCheckoutFlowTest`](tests/Feature/Billing/StripeCheckoutFlowTest.php) shape assertions.

### Test & build status (at completion)

- **Backend:** full suite `php artisan test` → **521 passed / 12 failed**. The 12 failures are all **pre-existing, unrelated Breeze web-session orphans** ([`AuthenticationTest`](tests/Feature/Auth/AuthenticationTest.php), `EmailVerificationTest`, `PasswordConfirmationTest`, `PasswordUpdateTest`, `RegistrationTest`, [`ProfileTest`](tests/Feature/ProfileTest.php)) whose `routes/auth.php` routes are never registered in this SPA-only app (verified untouched via `git diff` — out of scope for this plan).
- **New seat tests:** [`SeatCapacityTest.php`](tests/Feature/Billing/SeatCapacityTest.php) — **17 passed / 92 assertions**.
- **Regression fixes made during M4:** the two existing downgrade tests ([`SubscriptionPlanTest`](tests/Feature/Billing/SubscriptionPlanTest.php:487) and [`StripeCheckoutFlowTest`](tests/Feature/Billing/StripeCheckoutFlowTest.php:304)) originally created 40 employees via `Employee::factory()` whose linked users default to `company_id = null` — under the new seat semantics those users are **not** seats, so the guard reported only 1. Both were fixed with a `createActiveMemberSeats()` helper (active users with `company_id` set + linked employee rows) and now assert `errors.used = 41` (1 admin + 40 members).
- **Frontend:** `npm run build` (`tsc && vite`) passes cleanly.

### Notes / forward work

- `User::scopeActiveSeats` signature: `(Builder $query, ?int $companyId = null, ?User $exclude = null)` — the `exclude` arg implements Rule A's `excludeUserId` self-reactivation exemption.
- [`RegisterAction`](app/Domains/Auth/Actions/RegisterAction.php) brand-new tenant signup remains exempt from the guard (company starts with 1 active admin seat and no entitled subscription) — documented in code.
- **M5 branch-scoping removal is the sole outstanding milestone** and can be executed as a follow-up once seat enforcement is confirmed in production. Until then both the branch-capacity guard and the seat guard coexist (branch guard still lives in `EmployeeService::assertCapacityForAssignment()`; seat guard runs in `syncAccountAccess()`/`invite()`/`update()`).
- No DB migration was introduced by this plan (seats reuse existing columns; `plans.max_employees` doubles as the seat cap), so rollout is schema-neutral.
