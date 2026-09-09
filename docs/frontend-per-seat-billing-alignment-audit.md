# Frontend Audit — Per-Seat Employee Billing & Subscription Alignment

> **Scope:** Read-only audit of every frontend page, feature and component that touches billing / subscription / employee usage, to determine exactly what must change to align with the new **per-seat** model (seat = one active non-`super_admin` `users` row; founding `company_admin` counts as 1 seat; `plans.max_employees` reused as the seat cap; `null` = unlimited; flat-rate pricing `quantity = 1`, no per-seat Stripe multiplier).
>
> **Authoritative references:** [`plans/per-seat-employee-billing-implementation-plan.md`](../plans/per-seat-employee-billing-implementation-plan.md), [`docs/task-22-per-seat-user-billing.md`](./task-22-per-seat-user-billing.md), backend resources/controllers/tests listed inline, and [`SeatCapacityTest.php`](../tests/Feature/Billing/SeatCapacityTest.php).
>
> **Deliverable format:** per surface — current behaviour, misalignments/gaps, prioritized (MUST / SHOULD / COULD) required changes with file paths and implementation notes.

---

## 1. Seat Model & Frontend Vocabulary (baseline for every finding)

- A **seat** = one active `users` row: `company_id` set, role ≠ `super_admin`, `status = 'active'`. Founding `company_admin` counts as one seat.
- Inviting an employee keeps the account `invited` (no seat). **Setting a password / accepting a web invitation / completing mobile setup / re-activating a deactivated accepted member each consume a seat.** Deactivating (directory status → inactive) or deleting frees a seat.
- `plans.max_employees` is reused as the seat cap via `Plan::maxSeats()` / `Plan::hasUnlimitedSeats()`; `null` = unlimited.
- **Pricing is flat-rate** (`quantity = 1`), so the seat count is a *usage/reporting* and *downgrade-guard* concept, **not** a line-item multiplier.
- Backend enforcement returns a 422 envelope `{ code: 'EMPLOYEE_CAPACITY_REACHED', errors: { used, capacity, remaining } }` on **activation paths** (see [`SeatCapacityTest.php`](../tests/Feature/Billing/SeatCapacityTest.php:32)). Downgrades that would strand active seats are rejected with `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED`.
- Frontend seat vocabulary already established (company-admin console): `SeatCapacityProvider` → `useSeatCapacity()` (`features/billing/context/SeatCapacityContext.tsx`), `SeatUsageBadge`, `UpgradePromptDialog`, `handleCapacityError` (`lib/capacity-errors.ts`), `DowngradeConflictDialog`. Provider is role-gated to `company_admin` and mounted once in `AppRoutes` `ProtectedLayout` ([`AppRoutes.tsx`](../resources/js/routes/AppRoutes.tsx:305)).

---

## 2. Subscription & Billing Console (`/subscription`)

**File:** [`features/billing/pages/SubscriptionDashboardPage.tsx`](../resources/js/features/billing/pages/SubscriptionDashboardPage.tsx)

### Current behaviour
- Fully wired to the new self-service API (`useSubscription`, `useUsageOverview`). Handles entitled/not-entitled, past-due banner, cancelled/resume, checkout dialog (session redirect), plan change, billing-cycle change, billing portal, invoice history. Subscription states are surfaced.
- Overview tab already has an **"Active users (seats)"** `StatCard` (≈ line 882) fed by `usageOverview.seats` — the correct per-seat headline.
- Usage tab renders seat + branch stats; branches tab still manages branch activation/capacity (legacy subsystem retained until branch removal).

### Misalignments / gaps
1. **Redundant & wrong "Employee capacity" card.** The Overview tab still renders an "Employee capacity" `StatCard` (≈ [line 897](../resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:897)) from `capacityLimit = currentPlan?.maxEmployees` and `totalEmployees = branchUsage…employeesUsed` (≈ [line 529-530](../resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:529)). In the per-seat model this *branch-position headcount* is not the billable measure and duplicates the seats card.
2. **Legacy copy on the plan tab.** Current-plan card description still reads `{maxBranches} branches · {maxEmployees} employees` (≈ [lines 996-999](../resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:996)); page description mentions "branch availability and employee capacity" (≈ [line 805](../resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:805)).
3. **Legacy copy in `CheckoutDialog`.** Comparison lines still say "Branches: …" and "Employees: …" (≈ [lines 321-328](../resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:321)).
4. **Usage tab semantics.** "Employee capacity" + branch-position counts remain meaningful only as an *operational* (per-branch headcount) figure, but must be clearly separated from seats so admins don't conflate them.
5. **Sub-states:** `past_due`/grace banner and cancel/resume are handled, but there is no seat-aware messaging when the *current* plan is at capacity and the admin is in the billing console (usage tab shows it, but no call-to-action tying seat-fullness to plan upgrade).

### Prioritized changes
- **MUST** — Rename/repurpose the Overview "Employee capacity" card to the seat card only; drop the redundant `maxEmployees`-based capacity card (or re-label explicitly as "employee records across branches", non-billable). Implementation: edit the Overview `StatCard` block at [`SubscriptionDashboardPage.tsx:889`](../resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:889).
- **MUST** — Replace plan-tab copy with seat vocabulary: `{maxSeats} active users · {maxBranches} branches` (branches remain operational). Edit [`SubscriptionDashboardPage.tsx:994`](../resources/js/features/billing/pages/SubscriptionDashboardPage.tsx:994) and the page description at line 805.
- **MUST** — Update `CheckoutDialog`/plan-comparison copy (≈ lines 321-328) from "Employees" to "Active users (seats)" using `maxSeats`.
- **SHOULD** — On the Usage tab, add an "Upgrade plan" CTA when `seats.used === seats.limit` (mirroring `UpgradePromptDialog`'s plan filter), so admins can act without leaving the console.
- **COULD** — Phase out the "Branches" tab / branch-capacity UI as the branch subsystem is removed (see [`task-22-per-seat-user-billing.md`](./task-22-per-seat-user-billing.md) §removal); until then keep it clearly labelled "per-branch staff headcount".

### Supporting components
- [`features/billing/components/UpgradePlanDialog.tsx`](../resources/js/features/billing/components/UpgradePlanDialog.tsx)
  - **Gap:** `rankOf()` ranks plans by `branches*1000 + employees` (≈ [lines 39-44](../resources/js/features/billing/components/UpgradePlanDialog.tsx:39)) and the dialog copy lists "Branches: … / Employees: …" (≈ [lines 123-126 & 144-147](../resources/js/features/billing/components/UpgradePlanDialog.tsx:123)). 
  - **MUST:** rank by `maxSeats` first (then `maxBranches`) and reword copy to "Active users (seats)".
- [`features/billing/components/PlanCard.tsx`](../resources/js/features/billing/components/PlanCard.tsx)
  - **Gap:** card features list includes "…branches (unlimited)/active branches" and "…employees" rows (≈ [lines 71-81](../resources/js/features/billing/components/PlanCard.tsx:71)) — no seat row.
  - **SHOULD:** render `maxSeats` as the headline ("N active users" / "Unlimited active users") and demote/retain branch+employee rows as secondary.
- [`features/billing/components/DowngradeConflictDialog.tsx`](../resources/js/features/billing/components/DowngradeConflictDialog.tsx) and [`UpgradePromptDialog.tsx`](../resources/js/features/billing/components/UpgradePromptDialog.tsx) — **already seat-correct** (seat definition copy present; `UpgradePromptDialog` filters by `maxSeats`). No change.

---

## 3. Plan Catalogue Management (super-admin `PlansPage`)

**Files:** [`features/billing/pages/PlansPage.tsx`](../resources/js/features/billing/pages/PlansPage.tsx), [`features/billing/components/PlanForm.tsx`](../resources/js/features/billing/components/PlanForm.tsx), [`features/billing/components/PlansTable.tsx`](../resources/js/features/billing/components/PlansTable.tsx), [`types/billing.ts`](../resources/js/types/billing.ts)

### Current behaviour
- Super-admin CRUD of plans, prices, Stripe ids, trial setting. Backend persists `max_employees` and reuses it as the seat cap (`PlanResource` emits `max_employees`, `max_branches`; `max_seats` is derived on the backend, not a stored column — see [`PlanResource.php`](../app/Http/Resources/PlanResource.php:28)).

### Misalignments / gaps
1. **No seat vocabulary in the plan editor.** [`PlanForm.tsx`](../resources/js/features/billing/components/PlanForm.tsx:103) still labels the cap field "Max employees"; there is no "Max seats / active users" concept, no hint that this drives the billable seat allowance, and no seat-aware pricing hint (per-seat is not used today but the field meaning changed).
2. **No seat cap anywhere in the plans table** ([`PlansTable.tsx`](../resources/js/features/billing/components/PlansTable.tsx)) — super-admins cannot see at a glance how many active-user seats each plan allows.
3. **Types** [`types/billing.ts`](../resources/js/types/billing.ts) expose `BillingPlan.maxEmployees`/`PlanInput.maxEmployees` but no `maxSeats` alias, so the console cannot display seats without a field addition.

### Prioritized changes
- **MUST** — Rename/re-label the `PlanForm` "Max employees" field to "Max active users (seats)" with helper text "Leave empty for unlimited. This is the per-seat billable allowance." ([`PlanForm.tsx:103`](../resources/js/features/billing/components/PlanForm.tsx:103)); add a `maxSeats` view-model alias in `types/billing.ts` (`maxSeats = maxEmployees` semantics, mirroring `features/billing/types.ts`) OR relabel existing field and map on submit as `max_employees`.
- **SHOULD** — Add an "Active users (seats)" column to `PlansTable` rendering `maxSeats`.
- **COULD** — Surface a "per seat / mo" derived note if per-seat pricing is ever reintroduced (not needed while `quantity=1`).

---

## 4. Employee Surfaces (seat-guard UX)

**Files:** [`features/employees/pages/EmployeeListPage.tsx`](../resources/js/features/employees/pages/EmployeeListPage.tsx), [`features/employees/hooks/useEmployees.ts`](../resources/js/features/employees/hooks/useEmployees.ts), [`components/AddEmployeeModal.tsx`](../resources/js/features/employees/components/AddEmployeeModal.tsx), [`components/SendInviteModal.tsx`](../resources/js/features/employees/components/SendInviteModal.tsx), [`components/EditEmployeeModal.tsx`](../resources/js/features/employees/components/EditEmployeeModal.tsx), [`components/EmployeeRowActions.tsx`](../resources/js/features/employees/components/EmployeeRowActions.tsx), [`components/RevokeInviteDialog.tsx`](../resources/js/features/employees/components/RevokeInviteDialog.tsx)

### Current behaviour
- **Fully seat-aligned.** Directory header shows `SeatUsageBadge` (company-admin only, when provider available). Add/SendInvite show a soft seat `CapacityWarning` + "Upgrade plan" when full; all three seat-consuming modals route the backend `EMPLOYEE_CAPACITY_REACHED` 422 through `handleCapacityError` → `UpgradePromptDialog`; `EditEmployeeModal` pre-empts reactivation at capacity; `RevokeInviteDialog`/`EmployeeRowActions` are correctly seat-agnostic.
- Correct semantics: `createEmployee` → `POST /employees/invite` (invite only, no seat); activation occurs on password set / accept, enforced server-side.
- Seat queries run on the app-global client via `SeatCapacityProvider`; the isolated per-page `QueryClient` in `EmployeeListPage` is compatible (only employee queries are isolated).

### Misalignments / gaps
- **None substantive.** Copy inside modals is already seat-accurate. 

### Prioritized changes
- **COULD** — After a successful activation (password set, re-activation), refetch seat usage so the header badge updates immediately (verify refetch wiring; current refetch happens on capacity-error paths only).
- **COULD** — Show a compact "this invites N new active-user seat(s)" inline hint in `SendInviteModal`/`AddEmployeeModal` when inviting a role that will require setup, for extra clarity (currently only shown when at/near capacity).

---

## 5. Company-Admin Dashboard (Subscription & Usage section)

**File:** [`features/dashboard/pages/CompanyAdminDashboard.tsx`](../resources/js/features/dashboard/pages/CompanyAdminDashboard.tsx)

### Current behaviour
- "Subscription & Usage" section (≈ lines 171-225) uses `useUsageOverview()` and renders `StatCard "Active Branches"`, `StatCard "Entitled Employees"` (= sum of branch-position `employeesUsed`), and up to 4 `BranchUsageCard`s. `Manage subscription` links to `/subscription`.

### Misalignments / gaps
1. **No seat stat card.** The dashboard shows branch counts and branch-position headcount but **never surfaces the billable "Active users (seats) used/limit"** — the single most important per-seat KPI for a company admin.
2. **"Entitled Employees" conflates branch-position headcount with active-user seats** — a manager could mistake 40 employee records across branches for 40 seats when only, say, 6 active accounts exist (or vice-versa).

### Prioritized changes
- **MUST** — Add an "Active users (seats)" `StatCard` (`used / limit`, "Unlimited" when `null`) rendered from `usageOverview.seats`, alongside/above the branch cards. Edit the stat grid at [`CompanyAdminDashboard.tsx:190`](../resources/js/features/dashboard/pages/CompanyAdminDashboard.tsx:190).
- **MUST** — Re-label "Entitled Employees" to make clear it is *employee records across branches*, not billable seats (or drop it in favour of the seat card).
- **SHOULD** — Show an "Upgrade plan" micro-CTA / seat warning when `seats.used >= seats.limit` in this section, linking to `/subscription?tab=plan`.

---

## 6. Companies Surfaces (tenant view)

**Files:** [`features/companies/pages/CompaniesListPage.tsx`](../resources/js/features/companies/pages/CompaniesListPage.tsx), [`features/companies/pages/CompanyDetailPage.tsx`](../resources/js/features/companies/pages/CompanyDetailPage.tsx), [`features/companies/components/SubscriptionSummaryCard.tsx`](../resources/js/features/companies/components/SubscriptionSummaryCard.tsx), [`features/companies/components/CompaniesTable.tsx`](../resources/js/features/companies/components/CompaniesTable.tsx), [`types/company.ts`](../resources/js/types/company.ts), [`features/companies/hooks/useCompanies.ts`](../resources/js/features/companies/hooks/useCompanies.ts)

### Current behaviour
- `CompanyDetailPage` stat row shows Employees / Branches / User accounts; right rail renders `SubscriptionSummaryCard` (plan name, status badge, billing cycle, dates; "No active subscription" empty state). `CompaniesListPage` is admin CRUD only (no billing). `Company` DTO carries `users_count`, `trial_ends_at`, `locked_at`.

### Misalignments / gaps
1. **`CompanySubscription` has no usage/seat fields.** [`types/company.ts:111-130`](../resources/js/types/company.ts) and the mapper [`useCompanies.ts:180`](../resources/js/features/companies/hooks/useCompanies.ts) only carry status/dates/plan-name — the backend `SubscriptionSummaryResource` **does** return `max_seats`, `max_employees`, `max_branches` inside `plan`, and `usage.seats` ([`SubscriptionSummaryResource.php:57-90`](../app/Http/Resources/SubscriptionSummaryResource.php:57)), but the companies subscription endpoint (`GET /companies/{id}/subscriptions`) hits `SubscriptionResource` whose DTO subset (`useCompanies.ts` `SubscriptionDto`) omits usage/plan limits.
2. **`SubscriptionSummaryCard` renders no seat usage** and never shows "User accounts / seats used vs limit" even though `Company.usersCount` is available on the detail page.
3. **`CompanyDetailPage` "User accounts" stat shows raw `usersCount`** (includes invited/inactive/suspended) — not the active-seat count.

### Prioritized changes
- **SHOULD** — Extend `SubscriptionSummaryCard` to show an "Active users (seats)" line (used/limit when the backend supplies it; else derive from `Company.usersCount` where appropriate) plus plan seat allowance.
- **SHOULD** — Add `seatsUsed`/seat fields to the `CompanySubscription` DTO type + `useCompanies` mapper if `/companies/{id}/subscriptions` is extended to the full `SubscriptionSummaryResource` shape (align with billing module), enabling the card above.
- **COULD** — Clarify the "User accounts" stat label to "Active user accounts (seats)" and compute only active accounts client-side, or add a backend `active_users_count`.

---

## 7. Super-Admin Surfaces (per-seat platform reporting)

**Files:** [`types/super-admin.ts`](../resources/js/types/super-admin.ts), [`features/super-admin/hooks/useSuperAdmin.ts`](../resources/js/features/super-admin/hooks/useSuperAdmin.ts), [`pages/SuperAdminDashboard.tsx`](../resources/js/features/super-admin/pages/SuperAdminDashboard.tsx), [`pages/SuperAdminSubscriptionsPage.tsx`](../resources/js/features/super-admin/pages/SuperAdminSubscriptionsPage.tsx), [`pages/SuperAdminPaymentsPage.tsx`](../resources/js/features/super-admin/pages/SuperAdminPaymentsPage.tsx), [`pages/CompanyManagementPage.tsx`](../resources/js/features/super-admin/pages/CompanyManagementPage.tsx), [`pages/SuperAdminCompanyDetailPage.tsx`](../resources/js/features/super-admin/pages/SuperAdminCompanyDetailPage.tsx)

### Current behaviour
- Dashboard shows Total/Active Companies, **Total Employees**, Active Subscriptions, MRR/ARR/Revenue/Churn + plan distribution. Subscriptions page columns: Company/Plan/Status/Billing/Trial ends/**Active branches**/Created. Payments page shows company/plan/amount/status/refund/date/provider/reference. Company ledger shows Branches/Employees/**Users** counts; detail page "Plan & Billing" card shows plan/status/cycle/trial-ends; aggregation ribbon shows Branches/Employees/User accounts.
- `PlatformSubscriptionDto` carries `quantity` and `active_branches_count` but **no seat/active-user usage or limit**; `mapSubscription` ([`useSuperAdmin.ts:231`](../resources/js/features/super-admin/hooks/useSuperAdmin.ts:231)) drops `quantity` entirely.

### Misalignments / gaps
1. **No seat reporting anywhere in the super-admin console.** Subscriptions table has an "Active branches" column but no **"Active users (seats) used / limit"** column; the detail "Plan & Billing" card shows no seat usage; the dashboard "Total Employees" is the branch/employee-record count, not billable active-user seats.
2. **`quantity` is discarded.** The backend already records `subscriptions.quantity` (the billing lever); `PlatformSubscription`/`mapSubscription` never surface it — a missed free signal for seat billing.
3. **Company ledger "Users" column** counts raw `users_count` (all statuses), not active seats — same conflation as the tenant view.
4. **No MRR-by-seat / seats-under-management aggregate**, and no per-plan seat-limit column in plan distribution.

### Prioritized changes
- **MUST** — Add an **"Active users (seats)"** column (used/limit, "Unlimited" support) to `SuperAdminSubscriptionsPage` from a new `seatsUsed`/`seatsLimit` (or `quantity`) field surfaced by the super-admin subscriptions API + mapper. Update the page `PageHeader` description to mention seat usage.
- **MUST** — Surface seat usage on `SuperAdminCompanyDetailPage` "Plan & Billing" card (and aggregation ribbon) — used/limit plus plan `max_seats`.
- **MUST** — Add seat usage + plan seat-limit to the `PlatformSubscriptionDto`/`PlatformSubscription` types and `mapSubscription`; preserve/interpret `quantity` (flat-rate = seat count is reporting only).
- **SHOULD** — Add a platform aggregate (e.g. "Seats under management" / seats consumed across active subscriptions) to `SuperAdminDashboard`; keep "Total Employees" but label it as employee records.
- **SHOULD** — Add an "Active seats" column or seat chip to the super-admin `CompanyManagementPage` ledger (or detail quick-view dialog at [`CompanyManagementPage.tsx:197`](../resources/js/features/super-admin/pages/CompanyManagementPage.tsx:197)) and clarify "Users" → "Active users (seats)".
- **COULD** — Add seat usage to `SuperAdminPaymentsPage` (per payment/subscription) if the payments API exposes subscription usage.

---

## 8. Invitation Accept / Download Pages (public, guest)

**Files:** [`features/invitations/pages/AcceptInvitationPage.tsx`](../resources/js/features/invitations/pages/AcceptInvitationPage.tsx), [`features/invitations/pages/DownloadAppPage.tsx`](../resources/js/features/invitations/pages/DownloadAppPage.tsx)

### Current behaviour
- `AcceptInvitationPage` previews the invitation and lets the user set a password (`POST /invitations/accept`); on success toasts and navigates to `/login`. On error it shows a generic toast "Unable to set your password … this invitation may have expired" ([`AcceptInvitationPage.tsx:91`](../resources/js/features/invitations/pages/AcceptInvitationPage.tsx:91)). `DownloadAppPage` is mobile onboarding only.
- **Backend fact:** accepting a web invitation activates an account → **consumes a seat** and is guarded: `test_accepting_a_web_invitation_beyond_capacity_is_blocked` asserts a 422 `EMPLOYEE_CAPACITY_REACHED` with `errors.used/limit/remaining` ([`SeatCapacityTest.php:343-389`](../tests/Feature/Billing/SeatCapacityTest.php:343)); mobile setup is guarded the same way (line 430+); a pending user setting their first password via reset is also guarded (line 489+).

### Misalignments / gaps
1. **No seat-aware messaging.** When acceptance is blocked because the company's plan is at capacity, the invitee sees only a generic "invitation may have expired" toast — misleading and with no actionable path (the plan's seat allowance is full; only the company admin can upgrade or free a seat).
2. Neither the web accept flow nor the mobile setup flow explains that completing setup activates a billable seat for the company.

### Prioritized changes
- **MUST** — In `AcceptInvitationPage.submit`'s catch, detect the capacity 422 (`getBillingErrorCode`/`isCapacityReachedError` or envelope `code === 'EMPLOYEE_CAPACITY_REACHED'`) and render a dedicated error state: "Your team has reached its active-user limit. Ask your administrator to upgrade your plan or free up a seat before you can finish setting up." Do **not** imply expiry. Edit [`AcceptInvitationPage.tsx:91-98`](../resources/js/features/invitations/pages/AcceptInvitationPage.tsx:91).
- **SHOULD** — Add the same capacity-aware handling to the mobile complete-setup flow if there is a web companion screen that can surface it.
- **COULD** — Show a one-line note on the accept form: "Setting up your account adds you as an active team member (seat) on the company's plan."

---

## 9. Marketing / Public Pricing

**Files:** [`features/marketing/pages/LandingPage.tsx`](../resources/js/features/marketing/pages/LandingPage.tsx), [`features/marketing/pages/GetStartedPage.tsx`](../resources/js/features/marketing/pages/GetStartedPage.tsx), [`app/Http/Controllers/Api/PublicPlanController.php`](../app/Http/Controllers/Api/PublicPlanController.php)

### Current behaviour
- Both pages declare local `PublicPlan` interfaces with `price_monthly/yearly`, `max_employees`, `max_branches` (and `features`) — **no `max_seats`** ([`LandingPage.tsx:11`](../resources/js/features/marketing/pages/LandingPage.tsx:11), [`GetStartedPage.tsx:11`](../resources/js/features/marketing/pages/GetStartedPage.tsx:11)).
- Landing pricing card copy renders `{max_employees} employees · {max_branches} branches` style text ([`LandingPage.tsx:32`](../resources/js/features/marketing/pages/LandingPage.tsx:32)).
- **Backend gap:** `PublicPlanController::index()` does **not** emit `max_seats` at all ([`PublicPlanController.php:24-33`](../app/Http/Controllers/Api/PublicPlanController.php:24)) — unlike the authenticated `PlanSubscriptionController` catalogue which does ([`PlanSubscriptionController.php:117`](../app/Http/Controllers/Api/PlanSubscriptionController.php:117)). So marketing *cannot* show seats without a backend change first.

### Misalignments / gaps
1. Public catalogue advertises "employees", not "active users / seats" — misaligned with the new billable model and with the in-app plan cards (which M3 aligned to seats).
2. `PublicPlanController` omits `max_seats`; `GetStartedPage` plan picker shows no seat allowance.

### Prioritized changes
- **MUST (backend + frontend)** — Add `max_seats` to `PublicPlanController::index()` output (derived via `Plan::maxSeats()`), then add `max_seats` to both marketing `PublicPlan` interfaces.
- **MUST** — Update the `LandingPage` pricing card copy from `…employees · …branches` to lead with active users: `{max_seats} active users` (and secondary `{max_branches} branches`), reusing `maxSeats ?? 'Unlimited'`.
- **SHOULD** — Update `GetStartedPage` plan-picker to display the seat allowance so prospects choose by billable seats.
- **COULD** — Standardise a single shared public-plan type (e.g. add `max_seats` to a `types/` module) instead of two divergent local interfaces.

---

## 10. Global Layout, Navigation & Guards

**Files:** [`routes/AppRoutes.tsx`](../resources/js/routes/AppRoutes.tsx), [`routes/ProtectedRoute.tsx`](../resources/js/routes/ProtectedRoute.tsx), [`Components/layout/nav-items.ts`](../resources/js/Components/layout/nav-items.ts), [`features/billing/pages/LockedCompanyPage.tsx`](../resources/js/features/billing/pages/LockedCompanyPage.tsx), [`types/index.d.ts`](../resources/js/types/index.d.ts)

### Current behaviour
- `SeatCapacityProvider` is mounted once inside `ProtectedLayout`, above `DashboardLayout` ([`AppRoutes.tsx:305-308`](../resources/js/routes/AppRoutes.tsx:305)) — a single shared usage cache for Dashboard/Employees/Subscription.
- `/subscription` is registered under the `company_admin` role ([`AppRoutes.tsx:382`](../resources/js/routes/AppRoutes.tsx:382)); `/account-locked` is public-inside-shell ([`AppRoutes.tsx:363`](../resources/js/routes/AppRoutes.tsx:363)).
- `ProtectedRoute` deliberately **exempts `/subscription`** from the locked-company redirect so a locked admin can self-service reactivation ([`ProtectedRoute.tsx:33-37`](../resources/js/routes/ProtectedRoute.tsx:33)).
- Nav: "Subscription & Billing" is `COMPANY_ADMIN_ONLY` ([`nav-items.ts:59`](../resources/js/Components/layout/nav-items.ts:59)); scheduler correctly sees no billing nav.
- `LockedCompanyPage` offers company admins a "Choose a subscription" link and non-admins a "contact your administrator" note; it references Stripe auto-unlock.

### Misalignments / gaps
1. **`LockedCompanyPage` copy is trial-centric** ("Your trial period has ended …") yet the gate also fires for cancelled/past-due/unpaid/expired states (`company_access.is_locked`). Seat implications are nil, but the messaging can mislead an admin who never trialed.
2. **Seat vocabulary is absent from locked/paywall messaging** — fine (paywall is flat-rate), but ensure the locked page links to `/subscription?tab=plan` where relevant.

### Prioritized changes
- **SHOULD** — Make `LockedCompanyPage` messaging state-aware (trial-ended vs subscription ended/past-due) by reading the session/company-access state, keeping the single CTA to `/subscription`.
- **COULD** — Add a "Subscription & Billing" badge/tooltip hinting when seats are near limit in the sidebar for `company_admin` (needs app-global seat query — already cached via `SeatCapacityProvider`).

---

## 11. Surfaces Audited With No Billing Impact (no change required)

- **Scheduler dashboard / scheduler pages** — operational only; correctly no billing UI (role-gated). Seat provider returns `UNAVAILABLE_VALUE` no-op for non-company-admin.
- **Profile / Account settings / Company settings (`/settings`, `/companies/:id/settings`)** — zero billing/subscription/seat references found; they manage identity/localisation. No change.
- **Onboarding product guide** — non-billing content. No change.
- **Employee Row actions / Revoke invite** — invite revoke and row actions do not consume/free seats at the account level the UI controls; correctly seat-agnostic (backend owns enforcement).
- **`DownloadAppPage`** — mobile onboarding, no billing.

---

## 12. Consolidated Priority Change List

| # | Priority | Change | Primary files |
|---|----------|--------|----------------|
| 1 | MUST | Decouple seat KPI from branch-position headcount in the billing console; remove redundant "Employee capacity" card; seat-correct copy across overview/plan/checkout | [`SubscriptionDashboardPage.tsx`](../resources/js/features/billing/pages/SubscriptionDashboardPage.tsx) |
| 2 | MUST | Seat-rank + seat copy in plan-change dialog & plan cards | [`UpgradePlanDialog.tsx`](../resources/js/features/billing/components/UpgradePlanDialog.tsx), [`PlanCard.tsx`](../resources/js/features/billing/components/PlanCard.tsx) |
| 3 | MUST | Seat vocabulary in super-admin plan editor + seats column in plan table + `maxSeats` in `types/billing.ts` | [`PlanForm.tsx`](../resources/js/features/billing/components/PlanForm.tsx), [`PlansTable.tsx`](../resources/js/features/billing/components/PlansTable.tsx), [`types/billing.ts`](../resources/js/types/billing.ts) |
| 4 | MUST | Seat stat card + re-labelled employee records on the company-admin dashboard | [`CompanyAdminDashboard.tsx`](../resources/js/features/dashboard/pages/CompanyAdminDashboard.tsx) |
| 5 | MUST | Seat usage/limits surfaced in super-admin subscriptions + company detail; add `quantity`/seat fields to DTO + mapper | [`SuperAdminSubscriptionsPage.tsx`](../resources/js/features/super-admin/pages/SuperAdminSubscriptionsPage.tsx), [`SuperAdminCompanyDetailPage.tsx`](../resources/js/features/super-admin/pages/SuperAdminCompanyDetailPage.tsx), [`types/super-admin.ts`](../resources/js/types/super-admin.ts), [`useSuperAdmin.ts`](../resources/js/features/super-admin/hooks/useSuperAdmin.ts) |
| 6 | MUST | Capacity-aware (not expiry) error state on web invitation accept; optional on mobile setup | [`AcceptInvitationPage.tsx`](../resources/js/features/invitations/pages/AcceptInvitationPage.tsx) |
| 7 | MUST | Emit `max_seats` from `PublicPlanController`; add to both marketing `PublicPlan` types; seat-first pricing copy | [`PublicPlanController.php`](../app/Http/Controllers/Api/PublicPlanController.php), [`LandingPage.tsx`](../resources/js/features/marketing/pages/LandingPage.tsx), [`GetStartedPage.tsx`](../resources/js/features/marketing/pages/GetStartedPage.tsx) |
| 8 | SHOULD | Seat usage + allowance on `SubscriptionSummaryCard` and company detail; clarify user-account stat | [`SubscriptionSummaryCard.tsx`](../resources/js/features/companies/components/SubscriptionSummaryCard.tsx), [`CompanyDetailPage.tsx`](../resources/js/features/companies/pages/CompanyDetailPage.tsx), [`types/company.ts`](../resources/js/types/company.ts) |
| 9 | SHOULD | Platform seat aggregate + seat column in company ledger; clarify "Users" label | [`SuperAdminDashboard.tsx`](../resources/js/features/super-admin/pages/SuperAdminDashboard.tsx), [`CompanyManagementPage.tsx`](../resources/js/features/super-admin/pages/CompanyManagementPage.tsx) |
| 10 | SHOULD | State-aware locked-company messaging (trial vs cancelled/past-due) | [`LockedCompanyPage.tsx`](../resources/js/features/billing/pages/LockedCompanyPage.tsx) |
| 11 | SHOULD | Seat-refresh on successful activation; seat allowance shown in invite modals | [`useEmployees.ts`](../resources/js/features/employees/hooks/useEmployees.ts), [`SendInviteModal.tsx`](../resources/js/features/employees/components/SendInviteModal.tsx), [`AddEmployeeModal.tsx`](../resources/js/features/employees/components/AddEmployeeModal.tsx) |
| 12 | COULD | Phase out branch-activation/capacity UI as branch subsystem is removed; seat-aware sidebar hint | billing console tabs, [`nav-items.ts`](../resources/js/Components/layout/nav-items.ts) |

---

## 13. Notes / Verification Anchors

- Seat-capacity guard **fires on activation, not on invite**: verified by [`SeatCapacityTest.php`](../tests/Feature/Billing/SeatCapacityTest.php) (accept web/mobile, reset-password promotion, re-activation, downgrade). Frontend employee modals already match this exactly.
- `EMPLOYEE_CAPACITY_REACHED` envelope fields: `errors.used`, `errors.capacity`, `errors.remaining` (asserted in the tests; `handleCapacityError` in [`lib/capacity-errors.ts`](../resources/js/lib/capacity-errors.ts) parses the 422 `errors` map).
- Billing console domain types already carry `maxSeats` + `SeatUsageSummary` ([`features/billing/types.ts`](../resources/js/features/billing/types.ts)) — the misalignment is **copy/derived values**, not the type layer, except in the super-admin/companies/marketing modules where the wire DTOs genuinely lack seat fields.
- This report is read-only; it proposes changes only. Actual implementation should re-verify each line number, as files may shift.
