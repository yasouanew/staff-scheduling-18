# Schema Normalization Recommendation — Employee, Company, Branch, Shift Template

> **Scope:** A ground-up review of the current relational schema and backend usage for the core entities **company**, **branch**, **employee**, and **shift template** (plus their immediate dependents: roster, shift, subscription, department, position, user). The goal is an optimal, normalized design that eliminates harmful data redundancy while preserving every business rule and relationship the application actually relies on.

---

## 1. Current Schema (As-Is)

### 1.1 `companies`
| Column | Notes |
|---|---|
| `id` | PK |
| `name`, `abn`, `email`, `phone`, `logo` | Core identity |
| `timezone` | **Duplicated** — also exists on `company_settings.timezone` |
| `country`, `state`, `business_type` | Profile |
| `status` | active / inactive / suspended |
| `subscription_id` (nullable) | **Duplicated pointer** — also represented by `subscriptions.company_id` |
| `trial_ends_at`, `locked_at`, `trial_ending_reminded_at`, `trial_reminders_sent` | Trial lifecycle |

### 1.2 `branches`
| Column | Notes |
|---|---|
| `id`, `company_id` (FK) | Tenant root |
| `manager_id` (FK employee, added later) | Branch manager |
| `name`, `phone`, `address`, `latitude`, `longitude`, `timezone`, `status` | Profile |
| `default_opens_at`, `default_closes_at`, `default_break_minutes`, `default_break_paid` | Default operating hours |
| `day_schedules` (JSON) | Per-weekday overrides — **JSON blob** |

### 1.3 `employees`
| Column | Notes |
|---|---|
| `id`, `company_id`, `user_id`, `department_id`, `position_id`, `branch_id` | **Single-branch only** (one nullable `branch_id`) |
| `first_name`, `last_name`, `employee_number`, `employment_type`, `dob`, `gender`, `address`, `emergency_contact`, `emergency_phone`, `hire_date`, `termination_date`, `hourly_rate`, `photo`, `status` | Employment profile |

### 1.4 `shift_templates`
| Column | Notes |
|---|---|
| `id`, `company_id` | Tenant root |
| `branch_id`, `department_id`, `position_id` (all nullable) | Scoping filters |
| `name`, `description`, `start_time`, `end_time`, `break_minutes`, `color`, `is_paid_break`, `status`, `created_by` | Template blueprint |

### 1.5 Related dependents
- **`rosters`**: `company_id`, `branch_id`, `week_start`, `week_end`, `status`, `version`, `published_at`, `published_by`.
- **`shifts`**: `company_id`, `branch_id`, `roster_id`, `employee_id`, `position_id`, `department_id`, `date`, `start_time`, `end_time`, `break_minutes`, `paid_break`, `required_staff`, `status`, `notes`.
- **`users`**: `company_id`, `branch_id`, plus identity/auth/Stripe columns.
- **`subscriptions`**: `company_id`, `user_id`, `plan_id`, Stripe columns, lifecycle.
- **`branch_subscriptions`**: `company_id`, `branch_id`, `subscription_id`, `status`, `employee_capacity`, lifecycle — the "which branch is covered by which subscription + seat capacity" junction.
- **`departments`**, **`positions`**: both carry `company_id` (positions additionally carry `department_id`).
- **`employee_availabilities`**: clean child table (one row per employee/day). **Well normalized.**
- **`employee_invitations`**: `company_id`, `employee_id`, `user_id`, `invited_by`, denormalized `email`, token/code columns.

---

## 2. Redundancy & Duplication Findings

### 2.1 Harmful redundancy (should be removed)

**R1 — `users.company_id` + `users.branch_id` duplicate `employees` org context.**
Both [`users`](database/migrations/0001_01_01_000000_create_users_table.php:15) and [`employees`](database/migrations/2026_07_27_000007_create_employees_table.php:15) store `company_id` and `branch_id`. The user is linked to an employee via `employees.user_id`, and that employee already carries the authoritative company/department/position/branch. Keeping org scoping on **both** tables means two independent sources of truth that can drift (e.g., an employee is reassigned to another branch but `users.branch_id` is never updated — the [Branch model](app/Models/Branch.php:167) itself acknowledges `users.branch_id` "is only populated for directly provisioned accounts"). This is a correctness risk, not just an efficiency one.

**R2 — `shifts.company_id` + `shifts.branch_id` are fully derivable from `shifts.roster_id`.**
The backend already treats the roster as the source of truth: [`ShiftService::inheritRosterScope()`](app/Services/ShiftService.php:93) derives `branch_id`/`company_id` from the parent roster on every write, and there is a dedicated [backfill migration](database/migrations/2026_08_22_000001_backfill_shift_branch_from_roster.php:20) to repair the thousands of rows that were saved with a null branch precisely because this denormalization was unmaintained. This is the strongest evidence that storing these two columns on `shifts` is a source of recurring drift.

**R3 — `rosters.company_id` is derivable from `roster.branch_id → branches.company_id`.**
Every branch is company-scoped, so a roster's company is implied by its branch.

**R4 — `companies.subscription_id` is a circular pointer.**
[`companies`](database/migrations/2026_07_27_000002_create_companies_table.php:26) has a nullable `subscription_id`, while [`subscriptions`](database/migrations/2026_07_27_000015_create_subscriptions_table.php:16) carries `company_id`. Two directions of the same relationship; the pointer can silently disagree with the subscription rows. The authoritative access logic ([`AccessStateService`](app/Services/AccessStateService.php:25), [`Company::activeSubscription()`](app/Models/Company.php:110)) resolves subscriptions *from* the company anyway, making the stored pointer redundant.

**R5 — `branch_subscriptions.company_id` is derivable.**
Both `branch_id` and `subscription_id` already imply a company. The column exists only to power the application-level tenant guard in [`BranchSubscription::booted()`](app/Models/BranchSubscription.php:40). It's denormalization-for-safety, but it can be replaced by a proper composite FK/guard (see §4.3).

**R6 — `companies.timezone` duplicates `company_settings.timezone`.**
The company has a `timezone` column on `companies` **and** `company_settings` ([migration](database/migrations/2026_07_27_000003_create_company_settings_table.php:18)). Two timestamps/columns for the same fact with no declared winner.

**R7 — Missing junction table: employees are single-branch only.**
`employees.branch_id` is a single nullable FK, but the product is branch-centric (rosters and shifts are per-branch, capacity is counted per branch via [`UsageService::activeEmployeesForBranch()`](app/Services/UsageService.php:109)). A staff member who works at two branches **cannot** be modeled — their membership in one branch is silently dropped. This is a modeling gap rather than column duplication, but it is the single largest structural normalization deficiency.

### 2.2 Justified denormalization (keep — these are intentional snapshots)

- **`shifts.break_minutes` / `paid_break` / `required_staff`** — historical snapshot of the shift at scheduling time; must not change when the branch default changes.
- **`shifts.position_id` / `department_id`** — the *assigned role* for that shift, which can legitimately differ from the employee's home `position_id` (a template can materialize a shift as a different role). Keep as a snapshot; treat as business data, not pure redundancy.
- **`shift_templates.branch_id` / `department_id` / `position_id`** — optional scoping/`default` filters for a reusable pattern; they are configuration, not duplicate entity data.
- **`employee_invitations.email`** — intentionally denormalized so an invitation can be resolved before a user/employee row exists (documented in the migration).
- **`subscriptions.user_id`** — binds the record to a Stripe customer via Cashier's `Billable` trait; keep, but **`company_id` must remain the authoritative tenant key**.

### 2.3 Missing cross-tenant integrity

There are no composite/tenant-enforcing constraints in the schema. A `shift.department_id` could point at a department belonging to a *different* company than `shift.company_id`; the DB will not complain. Only `branch_subscriptions` enforces company consistency, and it does so in application code. This is an integrity gap that normalization should close.

---

## 3. Proposed Normalized Schema (To-Be)

Design principles:
1. **One source of truth per fact.** `users` = identity/auth only; `employees` = employment; org scoping lives on the entity that owns it.
2. **Derive, don't duplicate.** `company`/`branch` context on `roster`/`shift`/`branch_subscriptions` is resolved through the tree rather than re-stored.
3. **Model real cardinality.** Employees belong to many branches → junction table.
4. **Enforce tenant consistency** with composite foreign keys wherever the DB supports them, and app-layer guards elsewhere.

### 3.1 `companies` (normalized)
```sql
companies (
  id, name, abn, email, phone, logo,
  country, state, business_type, status,
  trial_ends_at, locked_at, trial_ending_reminded_at, trial_reminders_sent,
  created_at, updated_at
)
-- REMOVED: timezone (moved to company_settings), subscription_id (resolved via subscriptions.company_id)
```

### 3.2 `branches`
```sql
branches (
  id, company_id FK -> companies, manager_id FK -> employees (nullable),
  name, phone, address, latitude, longitude, timezone, status,
  created_at, updated_at
)
-- REMOVED: default_opens_at/default_closes_at/default_break_minutes/default_break_paid/day_schedules
-- Moved to a child table: branch_schedules
```

### 3.3 `branch_schedules` (NEW — replaces the JSON `day_schedules` + default columns)
```sql
branch_schedules (
  id,
  branch_id FK -> branches,
  day_of_week SMALLINT,            -- 0=Sunday .. 6=Saturday
  opens_at TIME NULL,              -- NULL + is_open=false => closed
  closes_at TIME NULL,
  break_minutes INT NULL,
  break_paid BOOLEAN DEFAULT false,
  is_open BOOLEAN DEFAULT true,
  created_at, updated_at,
  UNIQUE (branch_id, day_of_week)
)
```
- One row per weekday per branch (7 rows max) instead of a JSON blob. Queryable, indexable, and the `Branch::scheduleForWeekday()` merge logic in [`Branch.php`](app/Models/Branch.php:84) becomes a simple `WHERE branch_id = ? AND day_of_week = ?`.
- Alternative if full-week normalization is deemed too heavy: keep the **default** columns on `branches` and move only the per-day `day_schedules` into this table. This is the recommended pragmatic middle ground.

### 3.4 `departments`, `positions` (unchanged)
```sql
departments ( id, company_id FK, name, code, description, color, status, ... )
positions   ( id, company_id FK, department_id FK NULL, name, code, description, default_hourly_rate, color, status, ... )
```
These are already company-scoped catalogs. No change, but add composite tenant FKs (see §4.3).

### 3.5 `employees` (normalized)
```sql
employees (
  id, company_id FK, user_id FK NULL,
  department_id FK NULL, position_id FK NULL,      -- home department / default position
  first_name, last_name, employee_number, employment_type, dob, gender, address,
  emergency_contact, emergency_phone, hire_date, termination_date, hourly_rate, photo, status,
  created_at, updated_at
)
-- REMOVED: branch_id  -> replaced by employee_branch junction
```

### 3.6 `employee_branch` (NEW junction table)
```sql
employee_branch (
  employee_id FK -> employees,
  branch_id    FK -> branches,
  is_primary   BOOLEAN DEFAULT false,   -- marks the "home" branch (was employees.branch_id)
  started_at   DATE NULL,               -- supports history/transfers
  ended_at     DATE NULL,
  created_at, updated_at,
  PRIMARY KEY (employee_id, branch_id)
)
```
- Models many-to-many membership while preserving the legacy single-home-branch concept via `is_primary`.
- Capacity counting in [`UsageService::activeEmployeesForBranch()`](app/Services/UsageService.php:109) switches from `branch->employees()` to `branch->employeesThroughPivot()` and counts **distinct active employees**.
- `Branch::manager()` (`manager_id`) still references `employees` directly — fine.

### 3.7 `shift_templates` (unchanged structure, optional scope junction)
```sql
shift_templates (
  id, company_id FK, name, description, start_time, end_time,
  break_minutes, color, is_paid_break, status, created_by FK,
  created_at, updated_at, deleted_at
)
```
- Keep nullable `branch_id`/`department_id`/`position_id` as scoping filters (justified denormalization).
- If a template should apply to *multiple* branches (not just one or "all"), replace `branch_id` with a junction `shift_template_branches (shift_template_id, branch_id)`.

### 3.8 `rosters` (company_id removed)
```sql
rosters (
  id, branch_id FK, week_start, week_end, status, version,
  published_at, published_by FK,
  created_at, updated_at
)
-- REMOVED: company_id  (derivable via branch_id)
-- INDEX: (branch_id, week_start, week_end)
```

### 3.9 `shifts` (derived scope removed)
```sql
shifts (
  id, roster_id FK, employee_id FK NULL,
  position_id FK NULL, department_id FK NULL,     -- assigned role snapshot (kept)
  date, start_time, end_time, break_minutes, paid_break, required_staff, status, notes,
  created_at, updated_at
)
-- REMOVED: company_id, branch_id  (derivable via roster_id -> rosters.branch_id)
-- INDEX: (roster_id, employee_id, date)
-- For per-branch queries: join rosters on branch_id (roster is already the grouping key)
```
> **Trade-off decision (documented):** `position_id`/`department_id` are kept because the assigned role can differ from the employee's default. If your product rule is strictly "a shift's role always equals the employee's current role," these could also be removed — but that would break template-based role assignment, so they are intentionally retained as snapshots.

### 3.10 `subscriptions` / `branch_subscriptions`
```sql
subscriptions (
  id, company_id FK, user_id FK NULL, plan_id FK,
  status, billing_cycle, stripe_id, stripe_status, stripe_price, checkout_session_id, quantity,
  starts_at, ends_at, trial_ends_at, cancelled_at, cancel_at_period_end, metadata,
  renewal_reminded_at, activation_notified_at, past_due_since, grace_ends_at, suspended_at, webhook_event_ids,
  created_at, updated_at
)
-- company_id is THE authoritative tenant key; user_id only for Stripe customer binding.

branch_subscriptions (
  id, subscription_id FK, branch_id FK,
  status, employee_capacity, started_at, ended_at, cancelled_at, metadata,
  created_at, updated_at,
  UNIQUE (branch_id, subscription_id)
)
-- REMOVED: company_id  (derivable via branch_id / subscription_id)
-- Tenant guard moved to a composite FK or the app-layer assertion (see §4.3)
```

### 3.11 `users` (identity only)
```sql
users (
  id, name, email, password, phone, role, status,
  email_verified_at, last_login_at, web_welcome_completed_at, web_feature_tips,
  stripe_id, pm_type, pm_last_four, trial_ends_at, remember_token, timestamps
)
-- REMOVED: company_id, branch_id
-- Org context resolved via users.employee -> employees.company_id / employee_branch.branch_id
```
> **Impact:** every auth-scoping middleware and policy currently reads `$user->company_id`. After migration these become `$user->employee?->company_id` (or a cached accessor). This is the highest-blast-radius change and must be sequenced last (see §5).

---

## 4. Foreign Keys, Indexes, and Integrity

### 4.1 Foreign keys to add / keep
| Table | FK | Action |
|---|---|---|
| `branch_schedules` | `branch_id → branches.id` | `CASCADE` on delete |
| `employee_branch` | `employee_id → employees.id` | `CASCADE` |
| `employee_branch` | `branch_id → branches.id` | `CASCADE` |
| `rosters` | `branch_id → branches.id` | `nullOnDelete` (unchanged) |
| `shifts` | `roster_id → rosters.id` | `CASCADE` (unchanged) |
| `branch_subscriptions` | `branch_id`, `subscription_id` | `CASCADE` (unchanged) |

### 4.2 Indexes to add / adjust
- `employee_branch`: index on `branch_id` (capacity counting + branch staff listing).
- `employee_branch`: index on `(branch_id, is_primary)`.
- `branch_schedules`: `UNIQUE (branch_id, day_of_week)`.
- `rosters`: replace `(company_id, branch_id, week_start, week_end)` with `(branch_id, week_start, week_end)`.
- Keep `shifts (roster_id, employee_id, date)`.
- **Per-branch shift queries** now join `shifts → rosters` and filter on `rosters.branch_id`; consider a covering index `(roster_id, branch_id, date)` on `rosters` if the join becomes hot.

### 4.3 Tenant consistency enforcement
- **Composite foreign keys** (MySQL/Postgres support multi-column FKs to a `UNIQUE (company_id, id)` parent): enforce that e.g. a shift's `roster_id` and `branch_id` both resolve to the same company. Where composite FKs are impractical, keep the **application-layer guard** pattern already used by [`BranchSubscription::booted()`](app/Models/BranchSubscription.php:40) and extend it to `shifts`, `rosters`, and `branch_schedules` so a cross-tenant id can never be inserted.
- Add a service-level validator (reuse the pattern in [`BranchSubscriptionService`](app/Services/BranchSubscriptionService.php:33)) that asserts any supplied `department_id`/`position_id`/`branch_id` belongs to the same `company_id` before persisting.

---

## 5. Before / After Comparison

| Concern | Before | After |
|---|---|---|
| `users` org scope | `company_id` + `branch_id` columns | Removed; resolved via `employees` |
| `shifts` scope | `company_id` + `branch_id` columns (drifted, needed backfill) | Removed; derived via `roster` |
| `rosters` scope | `company_id` + `branch_id` | `branch_id` only |
| `companies` subscription pointer | `subscription_id` column | Removed; derived from `subscriptions.company_id` |
| `branch_subscriptions` tenant | `company_id` column + app guard | Composite FK / app guard only |
| Company timezone | `companies.timezone` + `company_settings.timezone` | Single source on `company_settings` |
| Employee branches | single nullable `branch_id` | `employee_branch` junction (multi-branch + `is_primary`) |
| Branch hours | JSON `day_schedules` + default columns | `branch_schedules` child table |
| Cross-tenant integrity | Only on `branch_subscriptions`, in code | Composite FKs + guards across scoped tables |
| Redundant writes required | `inheritRosterScope()` + backfill migration | None — one write path |

---

## 6. Step-by-Step Migration Plan

**Phase 0 — Safety & rollback**
- Take a full DB backup; record current data counts per table.
- Add the migration behind a feature flag so it can be toggled while verifying.

**Phase 1 — Additive, non-destructive (safe to ship alone)**
1. Create `branch_schedules`; backfill from `branches.day_schedules` + `default_*` columns (map default → all 7 days, then overlay overrides).
2. Create `employee_branch`; backfill one row per employee using `employees.branch_id` as `is_primary = true`.
3. Add `branch_schedules` and `employee_branch` indexes/uniques.

**Phase 2 — Introduce derived reads, keep writes (dual-path)**
4. Change capacity counting (`UsageService::activeEmployeesForBranch`) and branch-staff listing to read through `employee_branch` (verify identical counts vs. legacy `branch_id`).
5. Change branch-hours reads to use `branch_schedules` (update `Branch::scheduleForWeekday`).

**Phase 3 — Migrate auth scoping (highest risk)**
6. Add a cached `Employee::companyId()`/`branchIds()` helper (or a `User::company()` accessor) and update middleware/policies/resources to read org context through the employee link instead of `users.company_id`/`users.branch_id`.
7. Run the full test suite (auth, policies, super-admin, notification) and fix regressions.

**Phase 4 — Remove derived columns (destructive, behind flag)**
8. Drop `shifts.company_id`/`shifts.branch_id`; rewrite `ShiftService` to rely purely on the roster (remove `inheritRosterScope`).
9. Drop `rosters.company_id`.
10. Drop `branch_subscriptions.company_id`; add the composite FK / guard.
11. Drop `companies.subscription_id`.
12. Drop `companies.timezone` (keep `company_settings.timezone`).
13. Drop `employees.branch_id` and the `branches.day_schedules`/`default_*` columns (after Phase 1/2 verified).

**Phase 5 — Add tenant-enforcing constraints**
14. Add composite FKs / app guards across `shifts`, `rosters`, `branch_schedules`, `branch_subscriptions`.
15. Update factories, seeders, and tests to the new shape.

---

## 7. Risks & Performance Trade-offs

### Risks
- **Auth scoping (Phase 3) is the highest-risk change.** Every controller/policy/middleware currently trusts `users.company_id`. Missing a spot causes cross-tenant data leaks. Mitigate with a cached accessor and comprehensive authorization tests (the suite already covers policy isolation well).
- **Multi-branch model changes capacity semantics.** Counting "distinct active employees per branch" vs. "employees assigned to branch" can change seat-consumption numbers. Business must confirm whether one employee across two branches consumes one seat per branch or one seat total.
- **Destructive column drops are irreversible** once shipped. They must stay behind a flag until dual-path verification passes and should never be applied without a pre-drop backup.
- **Composite FK portability.** MySQL/Postgres support them, but SQLite (used in tests) has limited `ALTER` support; the app-layer guard remains the portable fallback.
- **Historical data** (existing rosters/shifts) must be migrated atomically with the schema change; the existing backfill approach proves this can be done, but the migration must be transactional and idempotent.

### Performance trade-offs
- **Removing `shifts.branch_id`** adds a join (`shifts → rosters`) for per-branch filtering. For very large shift tables this join is the cost of correctness; mitigate with a `rosters(branch_id, week_start)` index. The current denormalized column was *faster to query* but *constantly wrong* — correctness wins.
- **`employee_branch`** adds a join for branch staff/capacity queries, but enables multi-branch without duplicating employee rows — a net space and correctness win.
- **`branch_schedules`** replaces a JSON blob with up to 7 rows per branch; faster to query/index but slightly more storage. Net win for schedule lookups.
- **Removing `users.branch_id`/`company_id`** eliminates denormalized duplicate indexes on the largest identity table — minor write-path savings and eliminates drift-related cache invalidation bugs.

### Recommendation summary
Adopt **Phases 1–2 immediately** (additive, low-risk, no destructive change). Treat **Phase 3** as a dedicated, well-tested workstream before **Phase 4** removes the redundant columns. **Phase 5** (tenant FKs) can be layered on once the derived columns are gone. This delivers a clean, normalized, maintainable, and scalable schema while keeping the production system safe at every step.
