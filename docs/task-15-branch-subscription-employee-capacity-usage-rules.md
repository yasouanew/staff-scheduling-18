# TASK 15 — Finalize Branch Subscription, Employee Capacity and Usage Rules

## Objective

Finalize and verify the branch-subscription, employee-capacity and usage-rule domain for the Staff SaaS platform, per the following business model:

> Company → One commercial subscription → Plan → Multiple active branches → Each branch consumes employee capacity. A branch is **not** necessarily an independent Stripe subscription.

This task is an audit + test-hardening task: requirements 1, 2, 4, 5 and 6 were already implemented in the codebase (from TASK 13/14 work); TASK 15 verifies each requirement end-to-end, resolves the billing decision for requirement 3, and closes explicit test-coverage gaps. **No frontend changes were made.**

---

## Requirement → Implementation Map

### 1. Branch activation / deactivation / reactivation, validating plan branch limits

**Implemented in** [`BranchSubscriptionService::activateBranch()`](app/Services/BranchSubscriptionService.php:54), [`deactivateBranch()`](app/Services/BranchSubscriptionService.php:146).

- **Activation** validates:
  1. Branch belongs to the company → [`assertBranchBelongsToCompany()`](app/Services/BranchSubscriptionService.php:386) → `CROSS_BUSINESS_ACCESS_DENIED` (403).
  2. Company has an entitled subscription → `NO_ACTIVE_SUBSCRIPTION` (422).
  3. No existing entitled branch-subscription row **and** branch allowance available → [`UsageService::canAddBranch()`](app/Services/UsageService.php:102) → `BRANCH_LIMIT_REACHED` (422) with `used` / `limit` context.
- **Deactivation** ends the entitled row (`status = cancelled`, `ended_at`, `cancelled_at`), which immediately **releases** the branch allowance.
- **Reactivation** reuses the prior cancelled row (`$existing ??= $branch->branchSubscriptions()->where('subscription_id', $subscription->id)->latest('started_at')->first()`), so a branch can be deactivated/reactivated repeatedly **without double-counting** the branch limit.
- **Capacity on (re)activation:** `$capacity = $employeeCapacity ?? $subscription->plan?->max_employees`. Passing `employee_capacity` at activation overrides the plan default for that branch; otherwise it falls back to the plan's `max_employees`. The override is a per-activation value — a plain reactivation (without passing capacity) defaults back to the plan maximum.

**Tests:** [`BranchCapacityTest`](tests/Feature/Billing/BranchCapacityTest.php:20) (activation, limit, unlimited, reactivation no double-count, deactivation, cross-company, permissions) + [`TrialLifecycleTest::test_branch_lifecycle_create_activate_employees_capacity_deactivate_reactivate`](tests/Feature/Billing/TrialLifecycleTest.php:695).

### 2. Employee capacity (e.g. "20 / 25") comes from subscription/plan configuration

**Implemented in** [`EntitlementService::branchEmployeeCapacity()`](app/Services/EntitlementService.php:229) and [`UsageService::branchEmployeeCapacity()`](app/Services/UsageService.php:126):

- If the branch has an **entitled branch-subscription** with a custom `employee_capacity`, that value is used.
- Otherwise it falls back to the **plan's `max_employees`**.
- `UsageService::activeEmployeesForBranch()` counts only `active` employees; inactive/terminated/archived employees do **not** consume capacity.
- The API usage endpoint reports `used` / `capacity` per branch, e.g. `20 / 25` — see [`BranchSubscriptionController::usage()`](app/Http/Controllers/Api/BranchSubscriptionController.php:30) and [`PlanSubscriptionController::usage()`](app/Http/Controllers/Api/PlanSubscriptionController.php:112).

**Tests:** [`BranchCapacityTest::test_usage_endpoint_reports_plan_allowances`](tests/Feature/Billing/BranchCapacityTest.php:579).

### 3. Capacity increase: billable or not?

**Decision: Capacity changes are NOT billable. The existing local operation is correct.**

**Rationale / evidence:** The company has **one** commercial subscription with **flat per-plan pricing**. [`StripeBillingProvider::startCheckout()`](app/Billing/StripeBillingProvider.php:59) creates checkout with:

```php
'line_items' => [['price' => $priceId, 'quantity' => 1]],
```

There is **no metered/quantity-based employee pricing** — Stripe never charges per seat. Per-branch `employee_capacity` is an **internal allocation** of the seat allowance already purchased with the plan. Adjusting a branch's capacity therefore has zero monetary impact and must **not** go through Billing Service → Stripe → Webhook. Per the task's "if NOT billable → document why and keep local" branch, the correct flow is the existing local operation:

```
Company Admin → BranchSubscriptionController::updateCapacity()
             → BranchSubscriptionService::setEmployeeCapacity()  (DB::transaction + lockForUpdate)
```

**Implemented in** [`BranchSubscriptionService::setEmployeeCapacity()`](app/Services/BranchSubscriptionService.php:319):

- `lockForUpdate()` on the branch inside a transaction (serializes concurrent capacity changes).
- Requires an entitled branch-subscription → `BRANCH_NOT_ENTITLED` (422).
- Cannot shrink below the active employee count → `EMPLOYEE_CAPACITY_TOO_LOW` (422).
- Records an activity log entry.

**Tests:** [`BranchCapacityTest::test_can_update_branch_employee_capacity`](tests/Feature/Billing/BranchCapacityTest.php:534), [`test_cannot_shrink_capacity_below_active_employee_count`](tests/Feature/Billing/BranchCapacityTest.php:553).

> Note: If the business later introduces **per-seat or per-branch metered pricing**, capacity becomes billable and would need to be re-routed through the Billing Service → Stripe → Webhook reconciliation path (as designed in TASK 14), with the webhook updating the local `employee_capacity`/plan instead of direct DB writes.

### 4. Employee creation: backend enforcement

**Implemented in** [`EmployeeService::create()`](app/Services/EmployeeService.php:57) + [`assertCapacityForAssignment()`](app/Services/EmployeeService.php:308) + [`EmployeePolicy::create()`](app/Policies/EmployeePolicy.php:41) + [`EmployeeController::store()`](app/Http/Controllers/Api/EmployeeController.php:59).

Enforcement chain (all on the backend — frontend validation alone is insufficient):
1. **Policy:** only company admins / super-admins can create (`EmployeePolicy::create`, `super_admin` before → true).
2. **Company ownership:** non-super-admin users are pinned to their own `company_id` in [`EmployeeController::store()`](app/Http/Controllers/Api/EmployeeController.php:59); super-admins are checked by [`BranchSubscriptionService::assertCanAddEmployee()`](app/Services/BranchSubscriptionService.php:207) via `assertBranchBelongsToCompany` → `CROSS_BUSINESS_ACCESS_DENIED` (403) if the supplied company/branch pair is mismatched.
3. **Active subscription:** [`assertCanAddEmployee()`](app/Services/BranchSubscriptionService.php:207) → `NO_ACTIVE_SUBSCRIPTION` (422) if the company has no entitled subscription.
4. **Active branch:** → `BRANCH_NOT_ENTITLED` (422) if the destination branch is not entitled.
5. **Available capacity:** `lockForUpdate()` on the branch, then [`UsageService::canAddEmployee()`](app/Services/UsageService.php:154) → `EMPLOYEE_CAPACITY_REACHED` (422) with `used` / `capacity` context.

**Tests:** [`BranchCapacityTest::test_add_employee_consumes_branch_capacity`](tests/Feature/Billing/BranchCapacityTest.php:245) + the new [`BranchUsageRulesTest`](tests/Feature/Billing/BranchUsageRulesTest.php) cross-company / no-subscription / mismatched-pair tests.

### 5. Employee transfer: transaction, destination checks, company ownership, concurrency

**Implemented in** [`BranchSubscriptionService::transferEmployee()`](app/Services/BranchSubscriptionService.php:275) + [`EmployeeController::transfer()`](app/Http/Controllers/Api/EmployeeController.php:217) + [`EmployeePolicy::transfer()`](app/Policies/EmployeePolicy.php:57).

- Wrapped in a `DB::transaction` — the move either fully commits or fully rolls back.
- Company is taken **from the employee** (single source of truth), so a transfer can never cross company boundaries → `CROSS_BUSINESS_ACCESS_DENIED` (403).
- Same-branch transfer is a safe no-op.
- Destination is validated via [`assertCanAddEmployee()`](app/Services/BranchSubscriptionService.php:207) (active subscription, **active** destination branch, available capacity) — a full destination is rejected **transactionally** (no partial state).
- Concurrency: destination branch row is `lockForUpdate()`-locked inside the transaction so two simultaneous transfers cannot both succeed when capacity is tight.
- Activity log recorded.

**Tests:** [`BranchCapacityTest::test_valid_transfer_moves_employee_and_updates_counts`](tests/Feature/Billing/BranchCapacityTest.php:391), [`test_transfer_to_a_full_destination_is_rejected_transactionally`](tests/Feature/Billing/BranchCapacityTest.php:429), [`test_transfer_to_an_inactive_destination_branch_is_rejected`](tests/Feature/Billing/BranchCapacityTest.php:463), [`test_transfer_to_a_branch_of_another_company_is_rejected`](tests/Feature/Billing/BranchCapacityTest.php:486), + new transfer convergence test in `BranchUsageRulesTest`.

### 6. Usage Service centralization

**Implemented in** [`UsageService`](app/Services/UsageService.php:29) — the single source of truth for all usage calculations. No controller/service duplicates these:

| Method | Purpose |
|--------|---------|
| `usageFor()` | Company-level aggregate (branches, employees, capacity) |
| `activeBranches()` | Count of branches with an entitled branch-subscription |
| `maxBranches()` | Plan branch allowance (nullable = unlimited) |
| `branchUsage()` | Per-branch used/capacity/status |
| `canAddBranch()` | Branch-limit guard for activation |
| `activeEmployeesForBranch()` | Active employee count per branch |
| `activeEmployees()` | Company-wide active employee count |
| `branchEmployeeCapacity()` | Delegates to `EntitlementService::branchEmployeeCapacity()` |
| `remainingEmployeeCapacity()` | Capacity minus active employees |
| `canAddEmployee()` | Capacity guard |
| `branchUsageDetails()` | Enriched per-branch usage for the API |
| `entitledPlan()` | Current entitled plan |

Controllers ([`BranchSubscriptionController`](app/Http/Controllers/Api/BranchSubscriptionController.php), [`PlanSubscriptionController`](app/Http/Controllers/Api/PlanSubscriptionController.php)) only resolve the company and authorize — they delegate all calculation to `UsageService`.

---

## New Test Coverage — [`tests/Feature/Billing/BranchUsageRulesTest.php`](tests/Feature/Billing/BranchUsageRulesTest.php)

9 new tests (54 assertions) closing the explicit gap between the requirement list and prior coverage:

| Test | Verifies |
|------|----------|
| `test_branch_activation_allows_exactly_the_plan_branch_limit` | Boundary: activating up to the exact plan limit succeeds |
| `test_branch_activation_rejects_one_past_the_plan_branch_limit` | Boundary: limit+1 → `BRANCH_LIMIT_REACHED` with `used`/`limit` |
| `test_deactivated_branch_releases_allowance_and_can_be_reactivated_without_double_count` | Deactivation frees the allowance; a different branch can take it; reactivating the original then correctly fails (no double count) |
| `test_reactivation_reuses_the_prior_row_without_duplicate_and_capacity_defaults_to_plan_max` | Reactivation reuses the single cancelled row (no duplicate), capacity defaults to plan `max_employees`, and re-passing `employee_capacity` re-applies the custom value |
| `test_employee_creation_with_another_companys_branch_is_rejected` | Cross-company branch on employee creation → `CROSS_BUSINESS_ACCESS_DENIED` (403) |
| `test_super_admin_cannot_create_employee_with_mismatched_company_and_branch` | Super-admin with a mismatched company/branch pair → 403; correct pair (after activation) → 201 |
| `test_employee_creation_is_rejected_without_an_active_subscription` | No entitled subscription → `NO_ACTIVE_SUBSCRIPTION` (422) |
| `test_transfer_frees_source_capacity_and_consumes_destination` | Transfer converges both branches' counts (A 10/10 → 9, B 9/10 → 10) and usage reflects both |
| `test_archived_employees_do_not_consume_capacity_and_do_not_block_new_creations` | Archived/inactive employees don't consume capacity; a new active creation is blocked only when active count reaches capacity (`used`/`capacity` reported) |

### Concurrency

Concurrency protection is implemented via `lockForUpdate()` in both [`assertCanAddEmployee()`](app/Services/BranchSubscriptionService.php:207) and [`setEmployeeCapacity()`](app/Services/BranchSubscriptionService.php:319), each inside a `DB::transaction`. The sequential invariant is covered by:

- [`TrialLifecycleTest::test_concurrent_employee_creation_respects_capacity`](tests/Feature/Billing/TrialLifecycleTest.php:451) (3 sequential creations respected capacity; locking documented).
- `BranchUsageRulesTest` transfer + capacity-convergence tests.

> Note: Under the test suite (SQLite `:memory:`), a single process cannot create true multi-connection races; `lockForUpdate` semantics are verified through the transactional invariants. Under PostgreSQL in production the row locks serialize concurrent capacity-consuming writes.

---

## Verification Results

Full **billing + employee** suites:

```
PHPUnit 11.5.56
PHP 8.3.16
OK (228 tests, 714 assertions)   Time: 00:34.019
```

This includes the new `BranchUsageRulesTest` (9 tests, 54 assertions) plus the full pre-existing billing suite (branch capacity, branch subscription model, Stripe checkout flow, billing webhooks, subscription management, subscription plan, trial lifecycle) and the employee suite (management, deactivation, availability, invitation). No regressions.

---

## Files Touched in TASK 15

- **New test file:** [`tests/Feature/Billing/BranchUsageRulesTest.php`](tests/Feature/Billing/BranchUsageRulesTest.php) (9 tests).
- **This summary:** [`docs/task-15-branch-subscription-employee-capacity-usage-rules.md`](docs/task-15-branch-subscription-employee-capacity-usage-rules.md).

All production code (services, controllers, policies, models, routes, requests) was already in place from TASK 13/14 and was **audited and verified**, not modified.

## Future Work

- **Frontend:** wire the usage endpoint (`GET /api/v1/usage`) into branch settings and employees screens to display "used / capacity"; enforce capacity at the UI level in addition to the backend. Explicitly **out of scope** for TASK 15.
- **Metered billing:** if per-seat/per-branch metered pricing is adopted, route capacity changes through Billing Service → Stripe → Webhook and reconcile the local entitlement (see requirement 3 note).
