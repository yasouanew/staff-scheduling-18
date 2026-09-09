# Task 22 — Per-Seat Billing (Active User Accounts) & Removal of Branch Capacity Gating

## 1. Objective & Decision

**Decision (confirmed):** Bill the customer by **seat**, where a **seat = one active `users` row** belonging to the company. Role no longer matters — a `company_admin`, `scheduler`, or `employee` account is equally one billable seat. `super_admin` rows (which have no `company_id`) and non-`active` statuses (`inactive`, `suspended`, `invited`) are **not** billable seats.

**Equally confirmed:** Full removal of the branch-capacity/branch-subscription subsystem — not just decoupling. This means deleting the branch-activation / branch-capacity enforcement machinery, `Feature::isBranchScoped()` gating, the branch-scoped feature middleware branches, and (at the end) the `branch_subscriptions` schema. All 13 billing feature tests that assert branch capacity must be rewritten.

**Design tension to resolve up front.** Feature *availability* on a plan should remain **plan-level** (a plan either enables `roster`, `leave`, etc. or it does not). What we remove is the *second* layer that additionally required a branch to carry a paid `branch_subscription` before those features were usable. Feature keys and the `plan_features` pivot stay; only branch-scoping semantics are deleted.

## 2. Target Model

```
Business (company)
   └─ one commercial subscription (subscriptions.quantity = live seat count)
        └─ Plan  → max_seats (new name/meaning for max_employees)
        └─ Stripe subscription quantity syncs to active seat count
   └─ branches  → organizational grouping only (no billing/limit)
        └─ branch_management stays a plan-level feature toggle
   └─ users     → each active user = 1 seat (any non-super_admin role)
```

Key properties:
- **`subscriptions.quantity`** becomes the single billing lever, reconciled with Stripe's line-item quantity.
- **No hard enforcement on seat count at write time** against a *new* plan the business is choosing — but a **downgrade** is blocked (as today) if active seats exceed the target plan's `max_seats`.
- **Branches remain real domain objects** (roster/leave/availability are still branch-scoped data) but are **no longer gated by any per-branch payment or capacity**. Any branch is usable as long as the business has an entitled subscription and the plan enables the relevant feature.

## 3. Seat Definition (authoritative query)

```php
// Seat = users belonging to the company, role !== super_admin, status === 'active'.
Company::users()
    ->where('role', '!=', 'super_admin')   // super_admin rows have company_id = null anyway
    ->where('status', 'active')
    ->count();
```

Note: `users.status` values today are `active`, `inactive`, `suspended` (the `invited` status is an *invitation* state, distinct from a `users` row — invitations live in `employee_invitations` until accepted). The **`Employee` table no longer drives billing**. This is a deliberate and important behavior change: staff archived at the `employees.status` level may still own an `active` `users` account and therefore still bill. This edge case is called out in §9 (rollout/data migration).

## 4. Impacted Backend Areas & Required Changes

### 4.1 Schema (migrations)
- **New migration** `2026_09_XX_000001_make_seat_quantity_authoritative.php`:
  - Add `plans.max_seats` (unsignedInteger nullable) mirroring the existing `max_employees` value; or, simpler, **reuse** `max_employees` as the seat cap and only rename its *meaning* in docs. **Recommendation:** keep the column name `max_employees` (avoids touching many callers / resources) but re-document it as "max seats (active users)". See §9 decision.
  - **Drop migration** (separate, last step) `2026_09_XX_000002_drop_branch_subscriptions.php` → `Schema::dropIfExists('branch_subscriptions')`. This must come **after** all code referencing the table is removed so `artisan migrate` never breaks. In test suites this is naturally handled because tests run migrations fresh.
  - Remove the now-unused `employee_capacity` doc meaning; the column disappears with the table.

### 4.2 Model changes
- **`App\Models\User`** — add `scopeActiveSeats()` helper (the §3 query) or a `scopeBillable()`; used by `UsageService`. No fillable change.
- **`App\Models\Plan`** — add `hasUnlimitedSeats()` alias / keep `hasUnlimitedEmployees()`; add `maxSeats` accessor returning `max_employees` (avoids churn) OR introduce `max_seats` column. Recommend keeping `max_employees` and adding an accessor `max_seats()` so the *calling* code reads semantically without a column migration.
- **`App\Models\Subscription`** — keep `quantity`; add `scopeEntitled()` already exists? No — add helpers used for reconciliation if needed. Minimal.
- **`App\Models\Company`** — remove or keep `branchSubscriptions()` relation? Recommend **removing** the relation from the model in the full-removal plan (dead relation). Also `BranchSubscription` model file is **deleted**.
- **`App\Models\Employee`** — `branch_id` and `status` remain for domain/roster purposes, but `scopeActive` is no longer consulted for billing. No structural change required; only the billing call-sites change.

### 4.3 Enums
- **`App\Enums\Feature`** — **delete `isBranchScoped()`** and the class-level docblock about branch-scoped features. All 14 features become plan-level. The `branch_management` / `multi_branch` features remain meaningful as plan *feature toggles* but never as branch-scoped gates.

### 4.4 Services
- **`App\Services\EntitlementService`**:
  - `allows()` drops the `$branch`/`branchIsEntitled` branch; `isBranchScoped()` branch gone.
  - **Delete** `branchIsEntitled()` and `branchEmployeeCapacity()`.
  - `allows(Company, Feature, ?Branch $branch = null)` → simplify signature to `allows(Company, Feature)`; update all call sites (many controllers pass branch params from `EnsureFeatureAccess`).
- **`App\Services\UsageService`**:
  - Rewrite to return **seat usage**: `usageFor()` → `{ seats: { used, limit } , branch_usage: [] }` or a cleaner shape `{ seats: {used, limit} }`. Remove `activeBranches`, `maxBranches`, `branchUsage`, `canAddBranch`, `activeEmployeesForBranch`, `branchEmployeeCapacity`, `remainingEmployeeCapacity`, `canAddEmployee`, `branchUsageDetails`.
  - Add `activeSeats(Company)` using §3 query; `maxSeats(Company)` from entitled plan; `canAddSeat(Company)`.
  - Add helper `seatCountDelta` for reconciling.
- **`App\Services\SubscriptionService`**:
  - `assertCanChangeToPlan()` — remove branch allowance check; change employee check to seat check against `activeSeats()` vs target plan `maxSeats`.
  - `startCheckout()` / `subscribe()` / `createStripeSubscription()` — write `quantity = $this->usage->activeSeats($company)` instead of hard-coded `1` (this is the crux of making seats authoritative at signup).
  - Add a **`syncQuantity(Subscription)`** method that reads active seats, updates the local `quantity`, and calls the new `BillingProvider::updateQuantity()` when a Stripe sub exists.
- **`App\Services\BranchSubscriptionService`** — **delete the file** (full removal). Removes `activateBranch`, `deactivateBranch`, `assertCanAddEmployee`, `transferEmployee`, `setEmployeeCapacity`.
- **`App\Services\EmployeeService`** — remove `assertCapacityForAssignment()`'s dependency on `branchSubscriptions->assertCanAddEmployee()`. Assignment of employees to branches becomes unlimited (subject only to a branch existing).
- **`App\Services\AccessStateService`** — likely untouched (it resolves subscription entitlement, which still governs overall access). Verify it does not branch on branch capacity.
- **`App\Services\BillingLifecycleService`** — largely untouched; but note any place that derives seat counts for invoice line description should use `quantity`.

### 4.5 Billing provider (Stripe)
- **`App\Billing\BillingProvider` (interface)** — add:
  ```php
  public function updateQuantity(User $user, Subscription $subscription, int $quantity): void;
  ```
- **`App\Billing\StripeBillingProvider`**:
  - `startCheckout()` — accept a `quantity` parameter; set `'line_items' => [['price' => $priceId, 'quantity' => $quantity]]` (default `1`).
  - `createSubscription()` — accept a `quantity`; set `'items' => [['price' => $priceId, 'quantity' => $quantity]]`.
  - Implement `updateQuantity()` → Stripe `subscriptions->update($id, ['items' => [[ 'id' => <existing item id>, 'quantity' => $quantity ]]])`.
  - `swap()` — unchanged (plan swap) but the new line item should carry the current quantity; pass through `$subscription->quantity`.

### 4.6 Controllers & Resources
- **`App\Http\Controllers\Api\PlanSubscriptionController`** — `usage()` returns the new seat shape; `features()` no longer reports `branch_scoped`; downgrade path flows through the updated `SubscriptionService::assertCanChangeToPlan()`.
- **`App\Http\Controllers\Api\BranchSubscriptionController`** — **delete** (activate/deactivate/capacity/usage endpoints gone). Routes removed.
- **`App\Http\Controllers\Api\BranchController`** — remains for CRUD (organizational), but ensure its route group is not gated by branch-scoped feature.
- **`App\Http\Middleware\EnsureFeatureAccess`** — drop the `isBranchScoped()`/branch resolution branch and the second `$branchParam` argument usage; route middleware no longer passes `feature:key,{branch}`.
- **`App\Http\Middleware\EnsureActiveAccount`** — untouched (still governs `users.status === 'active'`).
- **Resources**: `SubscriptionSummaryResource` / `PlanResource` — change `max_branches`, `branch_scoped`, per-branch usage fields to seat fields. The usage summary now exposes `seats.used`/`seats.limit`.

### 4.7 Webhook reconciliation
- **`App\Http\Controllers\Api\StripeBillingWebhookController`**:
  - `reconcilePlanFromProvider()` stays.
  - **Add** `reconcileQuantityFromProvider($subscription, $object)`: read the first line item's `quantity`; if it differs from local `quantity`, update local (provider authoritative for quantity, mirroring price). Hook into `handleSubscriptionUpdated`.
  - Reconcile plan → reconcile quantity so a seat change made via the Stripe dashboard / proration is converged locally.

### 4.8 Routes (`routes/api.php`)
- Remove `api.branches.activate`, `api.branches.deactivate`, `api.branches.capacity`, and the branch-usage route.
- Change any `feature:key,{branch}` middleware to `feature:key` (no branch param).

## 5. Seat-Sync Engine (who pushes quantity when?)

A small, central reconciler reduces drift risk:

| Trigger | Local effect | Stripe effect |
|---|---|---|
| New subscription/checkout | `quantity = activeSeats` at creation | Checkout line item quantity = seats |
| Employee/admin/scheduler user invited & activated, or a role/user activated | `subscription.quantity` updated via `syncQuantity()` | `updateQuantity()` → proration invoice |
| User status set to `inactive`/`suspended`, or account deleted | same | same (proration) |
| User role changed to `super_admin` (rare) | seat removed | same |
| Webhook `subscription.updated` quantity change | local reconciled to provider | (provider-initiated) |

Where to trigger local side of sync:
- **`EmployeeService::invite()`** / **`EmployeeService::syncAccountAccess()`** / `assignRole` when it flips `users.status` to active — call `subscription->syncQuantity()`.
- Any dedicated user lifecycle method that activates/deactivates a user account — centralise into one **`SeatSyncService`** (new small service) that both the user lifecycle and the webhook call, so there is one place computing `activeSeats`.

**Recommendation:** introduce `App\Services\SeatSyncService` (constructor-injected `UsageService`, `BillingProvider`) exposing `sync(Company $company): void` and `syncForSubscription(Subscription $subscription): void`. This isolates the quantity-write rule so tests can pin it in one place.

## 6. Feature Gating Realignment

- The plan-level model is preserved: `plan_features.is_enabled` still determines whether a feature is on a plan; `EnsureFeatureAccess` still 403s when a feature is not on the entitled plan.
- The **removed** concept is the per-branch activation requirement.
- Frontend `FeatureEntitlement.branchScoped` and the branch "activate to use" UI must be removed.
- **Important nuance:** a feature like `roster` being on the Free plan while the customer adds 20 branches → all branches use roster (no branch gating). Branch count becomes purely organizational. This is the intended simplification.

## 7. Frontend Changes (`resources/js/features/billing`)

- **`types.ts`**: `ManagementPlan`/`SubscriptionPlanSummary` → replace `maxBranches` with `maxSeats` (or keep `maxEmployees` name but change meaning) and remove branch usage types (`BranchUsageSummary`, `BranchUsageItem`, `SubscriptionUsage.branchUsage` → new `SeatUsage`). `FeatureEntitlement.branchScoped` removed.
- **`SubscriptionDashboardPage.tsx`**: drop the `branches`/capacity tab and `BranchCapacityDialog`/`BranchUsageCard` usage; show seat usage; drop `useActivateBranch/useDeactivateBranch/useUpdateBranchCapacity` hooks; remove "activate this branch" affordances; plan/upgrade dialogs compare against seats.
- **Delete** `components/BranchCapacityDialog.tsx`, `components/BranchUsageCard.tsx`, `components/CapacityWarning.tsx` (or repurpose `CapacityWarning` to seats). Delete hooks under `hooks/useBranchBilling.ts`.
- Plan cards/pricing tables display **"per active user"** framing and seat tiers.

## 8. Tests

All 13 files under `tests/Feature/Billing` need review; rewrite/delete those asserting branch capacity. Files (from listing):
`BillingProviderWebhookTest`, `BranchCapacityTest`, `BranchSubscriptionTest`, `BranchUsageRulesTest`, `FeatureEntitlementTest`, `IncompleteSubscriptionReconcileTest`, `PlanManagementTest`, `ServerAuthoritativeAccessTest`, `StripeCheckoutFlowTest`, `SubscriptionManagementTest`, `SubscriptionPlanTest`, `SubscriptionSelfServiceSurfaceTest`, `TrialLifecycleTest`.

Required test work:
- **Delete**: `BranchCapacityTest`, `BranchSubscriptionTest`, `BranchUsageRulesTest`.
- **Rewrite to seat semantics**: `FeatureEntitlementTest` (no branch-scoping), `StripeCheckoutFlowTest` (quantity = seats), `SubscriptionManagementTest` (downgrade seat check), `SubscriptionPlanTest`, `PlanManagementTest`, `ServerAuthoritativeAccessTest`, `BillingProviderWebhookTest` (quantity reconciliation).
- **Add**: `SeatSyncTest` — activation/invite increases quantity; deactivation decreases; webhook quantity reconciles; downgrade blocked over seat cap.
- Run with: `C:/laragon/bin/php/php-8.3.16-Win32-vs16-x64/php.exe artisan test`.

## 9. Rollout, Data, & Backward Compatibility

- **Phasing (recommended, to keep the build green):**
  1. Add `updateQuantity`/quantity params to provider + `SeatSyncService` + webhook quantity reconciliation (additive; old branch code still present).
  2. Flip `UsageService`/`SubscriptionService` to seat counts; stop writing `quantity = 1`.
  3. Remove branch enforcement call-sites and feature branch-scoping (`EntitlementService::allows`, `EnsureFeatureAccess`, `EmployeeService`).
  4. Delete branch endpoints/routes/controllers/services/models and frontend branch-billing surface.
  5. Drop `branch_subscriptions` table migration + delete tests (last).
- **Pricing/data nuance:** because billing switches from "active Employee rows" to "active users," existing tenants whose archived `employees` still map to `active` `users` accounts may see a **jump in seat count** on rollout. Provide a **one-time backfill** decision: on migration, either (a) accept the new definition and email admins the new count, or (b) for tenants currently paying for Employee seats, cap `quantity` to the historical `employees.active` count as a one-time courtesy and reconcile on the next lifecycle event. This is a product decision — flag it.
- **Price/plan framing:** since `max_employees` currently doubles as per-branch capacity and as plan cap, and the Free/Starter/Professional tiers charge a flat price (not per seat), switching to "quantity = seats" with a flat plan price would overcharge on any seat >1 unless the Stripe **prices are metered/per-unit**. **Critical open decision (§10):** if plans are flat-rate, seat count must NOT multiply the charge. Per-seat billing only makes sense if the Stripe prices are **per-unit prices** (e.g., Starter = $29/user/mo) OR we keep seat count informational and bill flat. This must be confirmed before implementation.

## 10. Open Decisions to Confirm Before Implementation

1. **Flat-rate vs metered pricing.** The current plans (`Free $0`, `Starter $29`, `Professional $79`, `Enterprise $199`) are **flat monthly prices**, not per-seat. If we set Stripe line-item `quantity = activeSeats`, Stripe will charge `price × quantity`. That is only correct if the configured Stripe prices are per-unit. Otherwise seat quantity must remain an **informational/lifecycle** value and actual charges stay flat. **Which is intended?**
   - (A) Reprice plans as per-seat/monthly (requires new Stripe prices + PlanSeeder values).
   - (B) Keep flat-rate plans; seat quantity is tracked locally and synced for reporting only, NOT used to multiply charge (i.e., do not push quantity to Stripe line items, or push `quantity=1` and keep seat count in metadata).
2. **`max_employees` vs `max_seats`.** Reuse `max_employees` column (rename meaning) vs new `max_seats` column. Reuse is less churn.
3. **Branch feature availability.** With `MultiBranch`/`branch_management` still on the `features` list, do we keep them as plan toggles (Enterprise-only) or drop them entirely from feature lists? Removal of branch gating doesn't necessarily mean the *feature keys* are removed.
4. **`invited` users:** confirm invitation acceptance flow creates an `active` user (thus a seat only on acceptance), so no charge for invited-but-not-accepted.

---
*File: docs/task-22-per-seat-user-billing.md — architecture plan (not yet implemented).*
