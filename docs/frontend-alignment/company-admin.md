# Company Admin Frontend Alignment

> **Status:** Implemented — all Company Admin frontend surfaces are aligned with the actual backend.
> **Scope:** Dashboard, Employees, Branches, Departments, Positions, Availability, Shift Templates, Leave Requests, Notifications, Subscription, Billing, Company Settings, Profile.
> **Method:** Backend/database/API is the **source of truth**. Every visible action was traced UI → API → controller/service → database, and the response shape mapped back to the frontend. Only the frontend was changed — no backend code, migrations, or business rules were touched. **Roster is out of scope.**

---

## 0. Summary

Of the 13 Company Admin surfaces, **11 were already fully real and aligned** (delivered by prior alignment requests: Shift Templates, Leave, Notifications, Subscriptions & Billing, plus the original Dashboard/Employees/Branches/Departments/Positions/Availability surfaces). This request found **exactly two outstanding issues**, both fixed:

| Issue | Severity | Status |
|---|---|---|
| **M-02** — `/settings` was served by a mock `SettingsDashboardPage` (hardcoded org/branch/policies, `setTimeout` stub, legacy `AUSTRALIAN_TIMEZONES`/rate-multiplier fields with no backend table). | CRITICAL | **Fixed** — `/settings` now renders the real `CompanySettingsPage` for the admin's own company (`company_id` from `GET /auth/me`). Mock feature deleted. |
| **Broken `/settings/profile` link** in the Header dropdown — no SPA route, no backend profile-update endpoint (only `PUT /auth/password` exists). | HIGH | **Fixed** — dead Profile menu item removed; Settings remains the correct target. |

No other mismatches remain. **M-01** (mock availability) and **M-03** (shift templates UI) were fixed in prior requests; **M-04** (backend `notifyAdmins` dead roles) is a backend bug documented in [`leave.md`](docs/frontend-alignment/leave.md) — only the frontend `canReviewLeaveRequests` fix was applied here; **M-07** (`assignRole` unused) is accepted as-is (LOW, intentional).

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 Company-access route group (`routes/api.php` §5)

All Company Admin operational routes live behind `['auth:sanctum', 'account.active']` + `company.access` middleware:

| Method | URI | Controller / Service |
|---|---|---|
| GET | `dashboard/overview` | `DashboardController::companyOverview` |
| GET | `entitlements` | `EntitlementService` |
| GET/PUT | `companies/{company}/settings` | `CompanySettingController` → `CompanyService` |
| GET/POST | `companies` (apiResource, no show) | `CompanyController` (index scoped to own company) |
| apiResource | `branches` + `branches/{branch}/activate\|deactivate\|capacity` | `BranchController` / `BranchService` / `BranchSubscriptionService` |
| GET | `usage` | `UsageService` |
| apiResource | `departments`, `positions` | `DepartmentController` / `PositionController` |
| POST | `employees/invite` | `InvitationService` |
| POST | `employees/{employee}/role\|department\|position\|photo\|transfer` | `EmployeeController` |
| POST/DELETE | `employees/{employee}/invitation` | `InvitationService` |
| apiResource | `employees` | `EmployeeController` |
| nested | `employees/{employee}/availabilities` (index/store/sync/show/update/destroy) | `EmployeeAvailabilityController` → `EmployeeAvailabilityService` |
| apiResource | `shift-templates` | `ShiftTemplateController` → `ShiftTemplateService` |
| apiResource | `leave-types` | `LeaveTypeController` → `LeaveTypeService` |
| POST | `leave-requests/{id}/approve\|reject` | `LeaveRequestController` → `LeaveRequestService` |
| apiResource | `leave-requests` (index/store/show only) | `LeaveRequestController` |
| POST/DELETE | `device-tokens` | `DeviceTokenController` |
| GET | `notifications` + `notifications/read-all\|{id}/read\|{id}/destroy` | `NotificationController` |

### 1.2 Company billing (self-service, §4 — outside `company.access`)

`subscription`, `subscription/plans|usage|features|payments|invoices|checkout|upgrade|downgrade|cancel|resume|billing-period|billing-portal` — the company is derived **from the authenticated user**, never from a URL id, so cross-tenant isolation is structural.

### 1.3 Cross-tenant isolation (server-side, double-layered)

- `CompanySettingController::show/update` → `$this->authorize('view'/'update', $company)` → `CompanyPolicy::belongsToCompany`.
- `CompanyController::index` scopes to `$request->user()->company_id` for non-super-admin.
- `DashboardController::companyOverview` takes the company id from the authenticated user's session.
- Branches/Departments/Positions/Employees/ShiftTemplates/LeaveRequests all scope to the user's company; policies reject any foreign-company record.

---

## 2. Alignment Matrix (page → API → DB → UI)

| # | Page / Route | Frontend file(s) | Backend API | DB table | Real? |
|---|---|---|---|---|---|
| 1 | Dashboard `/dashboard` | [`CompanyAdminDashboard.tsx`](resources/js/features/dashboard/pages/CompanyAdminDashboard.tsx) + [`useDashboardAnalytics.ts`](resources/js/features/dashboard/hooks/useDashboardAnalytics.ts) | `GET dashboard/overview` | aggregates | ✅ |
| 2 | Employees `/employees` | [`EmployeeListPage.tsx`](resources/js/features/employees/pages/EmployeeListPage.tsx) + [`useEmployees.ts`](resources/js/features/employees/hooks/useEmployees.ts) | apiResource `employees` + invite/role/photo/transfer | `employees` | ✅ |
| 3 | Branches `/branches` | [`BranchesListPage.tsx`](resources/js/features/branches/pages/BranchesListPage.tsx) | apiResource `branches` + activate/deactivate/capacity | `branches`, `branch_subscriptions` | ✅ |
| 4 | Departments `/departments` | [`DepartmentsListPage.tsx`](resources/js/features/departments/pages/DepartmentsListPage.tsx) + [`useDepartments.ts`](resources/js/features/departments/hooks/useDepartments.ts) | apiResource `departments` | `departments` | ✅ |
| 5 | Positions `/positions` | [`PositionsListPage.tsx`](resources/js/features/positions/pages/PositionsListPage.tsx) + [`usePositions.ts`](resources/js/features/positions/hooks/usePositions.ts) | apiResource `positions` | `positions` | ✅ |
| 6 | Availability `/employees/:id/availability` | [`EmployeeAvailabilityPage.tsx`](resources/js/features/availability/pages/EmployeeAvailabilityPage.tsx) | nested `employees/{id}/availabilities` + `sync` | `employee_availabilities` | ✅ |
| 7 | Shift Templates `/shift-templates` | [`ShiftTemplatesListPage.tsx`](resources/js/features/shift-templates/pages/ShiftTemplatesListPage.tsx) | apiResource `shift-templates` | `shift_templates` | ✅ |
| 8 | Leave `/leave-requests` | [`LeaveRequestsListPage.tsx`](resources/js/features/leave-requests/pages/LeaveRequestsListPage.tsx) + detail/new | apiResource `leave-requests` + approve/reject | `leave_requests` | ✅ |
| 9 | Notifications (header bell + `/notifications`) | [`NotificationCenterPage.tsx`](resources/js/features/notifications/pages/NotificationCenterPage.tsx) + `NotificationBell` | `device-tokens` + `notifications` | `notifications`, `device_tokens` | ✅ |
| 10 | Subscription `/subscription` | [`SubscriptionDashboardPage.tsx`](resources/js/features/billing/pages/SubscriptionDashboardPage.tsx) + [`useSubscription.ts`](resources/js/features/billing/hooks/useSubscription.ts) | §4 self-service `subscription/...` | `subscriptions`, `plans`, `branch_subscriptions` | ✅ |
| 11 | Billing (part of `/subscription`) | same as above | `subscription/payments|invoices|billing-portal` | `subscription_payments` | ✅ |
| 12 | Company Settings `/companies/:id/settings` and **`/settings`** | [`CompanySettingsPage.tsx`](resources/js/features/companies/pages/CompanySettingsPage.tsx) + **new** [`CompanySettingsRoute.tsx`](resources/js/features/companies/pages/CompanySettingsRoute.tsx) | `GET/PUT companies/{company}/settings` | `company_settings` | ✅ (was mock → **fixed**) |
| 13 | Profile (header dropdown) | [`Header.tsx`](resources/js/Components/layout/Header.tsx) | *(none — no profile endpoint)* | — | ✅ (**dead link removed**) |

---

## 3. What Was Fixed (Request 14)

### 3.1 M-02 — Replace the mock `/settings` page with the real settings (CRITICAL)

**Before:** `/settings` → `SettingsDashboardPage` rendered `MOCK_ORGANIZATION`, `MOCK_BRANCH`, `MOCK_POLICIES`, a `setTimeout`-based save stub, and legacy `AUSTRALIAN_TIMEZONES`/`baseHourlyRate`+rate-multiplier fields with **no backend table**. Its "Departments" tab said "coming soon", and the 5 "Operational Policy" toggles had no storage.

**After:**

1. [`CompanySettingsPage.tsx`](resources/js/features/companies/pages/CompanySettingsPage.tsx) now accepts an optional `companyId` prop that overrides the `:id` route param:
   ```tsx
   const { id: paramId = '' } = useParams<{ id: string }>();
   const id = companyId ?? paramId;
   ```
   This keeps the existing `/companies/:id/settings` and `/super-admin/companies/:id/settings` routes working unchanged, while letting a param-less route inject the id.

2. **New** [`CompanySettingsRoute.tsx`](resources/js/features/companies/pages/CompanySettingsRoute.tsx) resolves the admin's **own** company id from the web session and renders the real page:
   ```tsx
   const session = useWebSession();
   const companyId = session.data?.company_id ? String(session.data.company_id) : null;
   if (!companyId) return <Navigate to="/dashboard" replace />;
   return <CompanySettingsPage companyId={companyId} />;
   ```
   The id always comes from `GET /auth/me`, never from user input — a Company Admin cannot open another company's settings here. The backend `GET/PUT companies/{company}/settings` still enforces `CompanyPolicy::belongsToCompany` as a second line of defence.

3. [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx) — `/settings` now renders `<CompanySettingsRoute />` (inside the existing `company_admin`-only `RoleRoute` block); the dead `SettingsDashboardPage` import was removed.

4. **Deleted** the orphaned mock feature directory `resources/js/features/settings/` (`SettingsDashboardPage.tsx`, `PolicyTogglePanel.tsx`). No live imports remained.

### 3.2 Remove the broken Profile link in the Header (HIGH)

**Before:** the user dropdown had `Profile → /settings/profile` — a route that did not exist in `AppRoutes.tsx`, backed by no backend endpoint (the only profile-ish endpoint is `PUT /auth/password`; there is no `GET/PUT` profile-update API).

**After:** [`Header.tsx`](resources/js/Components/layout/Header.tsx) — removed the dead `Profile` `DropdownMenuItem` and its now-unused `User` lucide icon. The dropdown now shows **Settings** (→ `/settings`, now real) and **Sign out**.

---

## 4. Verified Aligned (no changes needed)

Each of these was traced end-to-end and confirmed consistent with the backend:

- **Dashboard** — `useDashboardAnalytics` maps `dashboard/overview` exactly: `stats {total_employees, active_employees, total_branches, total_departments, shifts_this_week, pending_leave_requests, published_rosters}`, `department_allocation`, `week {start,end}`, plus `usage` for the branch-usage cards. All metrics are **real** (aggregated server-side); the dashboard has no mock numbers.
- **Employees** — 9 profile fields (`dob`, `gender`, `address`, `emergency_contact`, etc.) now present (M-06 fixed in a prior request); phone read-only (no backend write); contractor/terminated employment types; photo upload via `POST employees/{id}/photo`. Deactivation/reactivation + invitations all wired.
- **Branches** — list/create/edit/delete, activate/deactivate, capacity dialog, per-branch subscription management; `useUsageOverview` + `useActivateBranch` + `useUpdateBranchCapacity` all hit real endpoints; `canManageBranchBilling` gates billing actions.
- **Departments / Positions** — real CRUD, `color`/`description`/`code`/`positions_count` mapped; positions parse `default_hourly_rate` correctly (`parseRate`).
- **Availability** — real per-employee editor at `/employees/:id/availability` (`useEmployeeAvailability` + `useSyncWeeklyAvailability`); the old in-memory mock (`useAvailability.ts`) is gone (M-01 fixed).
- **Shift Templates** — full UI + route wired to `useShiftTemplates` (M-03 fixed); **note:** the `/apply` and `/roster-options` routes documented in the hook comments do **not** exist — creating a shift from a template uses `POST /shifts`, and roster options come from `GET /rosters` (documented discrepancy; UI is correct).
- **Leave Requests** — submit/approve/reject wired to `leave-requests/{id}/approve|reject`; leave-type `color` (M-05 fixed); `canReviewLeaveRequests` now gates on `leave_request.approve/reject` permissions + `super_admin` — no dead `admin/manager/owner` fallback (M-04 frontend part). **Backend** `LeaveRequestService::notifyAdmins()` still queries the never-seeded `admin/manager/owner` roles — this is a **backend bug** documented in [`leave.md`](docs/frontend-alignment/leave.md), left untouched per the frontend-only rule.
- **Notifications** — device-token registration, real-time bell unread count, read-all/single-read/delete all wired; approving leave notifies the employee user.
- **Subscription & Billing** — two aligned surfaces (Super Admin `/super-admin/subscriptions`, Company Admin self-service `/subscription`). `useSubscription` maps `SubscriptionSummaryResource` (which omits Stripe secrets), handles both `branch_usage` and `branches_usage` response keys, and drives checkout/upgrade/downgrade/cancel/resume/billing-period/billing-portal.
- **Cross-tenant isolation** — every server surface derives the company from the authenticated user or authorizes the route-model binding; Company Admin cannot reach another company's data (verified by `Security/RoleAccessControlTest` and `Billing/TrialLifecycleTest`).

---

## 5. Verification

- **TypeScript build:** `npm run build` (`tsc && vite build`) — **passed**, 3858 modules, no type errors.
- **Backend feature tests** (Laragon PHP 8.3, 393 passed / 0 failures):
  - `tests/Feature/Company` + `Branch` + `Department` + `Position` + `Security` → 116 passed (incl. `RoleAccessControlTest` cross-tenant cases).
  - `tests/Feature/Employee` + `Leave` + `Notification` + `ShiftTemplate` → 91 passed.
  - `tests/Feature/Billing` (full suite incl. self-service surface, capacity, trial lifecycle, webhooks) → 186 passed.

---

## 6. Remaining Backend-Only Notes (out of scope for frontend)

- **M-04 backend:** `LeaveRequestService::notifyAdmins()` targets never-seeded roles → "new leave request" admin notification never fires. Requires a backend change; frontend already gates correctly.
- **M-07 (LOW):** `POST /employees/{employee}/role` (`assignRole`) has no frontend caller — roles change only via the invite flow. Accepted; no change.
- **No `GET/PUT` profile endpoint exists** in the backend, so there is intentionally no Profile page in the SPA. The dead link was removed rather than building a fake page.
