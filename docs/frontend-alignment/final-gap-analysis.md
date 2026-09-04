# Final Frontend/Backend Alignment Audit — Non-Roster Features

> **Date:** 2026-09-01
> **Scope:** All non-roster features (roster completely excluded)
> **Method:** Read-only audit of DATABASE → BACKEND → API → FRONTEND → USER ACTION across every module
> **Source of truth:** Actual codebase (Laravel backend + React frontend), NOT system-map.md

---

## Executive Summary

Every non-roster module has been audited end-to-end against the live API surface defined in `routes/api.php`. The codebase is **substantially aligned**. Prior alignment passes (M-01 through M-07 in earlier docs) and Request 15's scheduler fixes have resolved all previously-identified gaps.

**Remaining actionable gap: 1 (Low severity)**
**Documented discrepancies (informational, no code change needed): 2**

No mock data, fake statistics, TODO buttons, empty handlers, console.log misuse, wrong API URLs, wrong HTTP methods, wrong request/response fields, missing query invalidation, stale UI after mutations, or cross-company data exposure were found outside of the items documented below.

---

## Gap Table

| Module | Page | Component | Issue | Backend Source | DB Tables | Severity | Recommended Fix |
|--------|------|-----------|-------|----------------|-----------|----------|-----------------|
| Dashboard | SchedulerDashboard | SchedulerDashboard.tsx | No `isError` handling for rosters/shifts/leave queries. Failed queries silently render empty states with no user feedback. CompanyAdminDashboard has proper `isError` + retry — this is an inconsistency. | `GET /dashboard/overview`, `GET /rosters`, `GET /shifts`, `GET /leave-requests` (all real, no mock) | rosters, shifts, leave_requests | Low | Add `isError` check with retry button to match `CompanyAdminDashboard.tsx` pattern. Lines 164–165 in `SchedulerDashboard.tsx` should destructure `isError` from each query and render an error state. |
| Documentation | system-map.md | (stale route entries) | Lists `POST /shift-templates/{shiftTemplate}/apply` — does NOT exist in `routes/api.php`. Actual implementation uses `POST /shifts` to create individual shifts from template values. Also lists `GET /roster-options` which does NOT exist; actual: `GET /rosters` with `per_page=50`. | `routes/api.php` (lines 320–325 for shift-templates CRUD, line 332 for rosters) | — | Informational | Update `system-map.md` to remove phantom routes. Already documented in `docs/frontend-alignment/shift-templates.md`. |
| Notifications | NotificationCenterPage | useNotifications.ts `toActionUrl()` | Backend billing notifications emit `action_url: /companies/{id}/subscriptions` which is NOT a React SPA route. Frontend correctly maps `billing_alert` → `/subscription` (the actual SPA route). Works correctly but the backend `action_url` is misleading. | `NotificationController.php` + billing notification classes | notifications | Informational | Either update backend notification `action_url` to `/subscription` (SPA route) or accept the frontend mapping as the correct layer. Already documented in `docs/frontend-alignment/notifications.md`. |

---

## Module-by-Module Audit Results

### Auth — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `users` table: id, company_id, branch_id, employee_id, name, email, phone, role, status, web_welcome_completed_at, web_feature_tips, email_verified_at, last_login_at |
| **BACKEND** | [`AuthController`](app/Http/Controllers/Api/Auth/AuthController.php:25): register (201, returns user+token), login (401 on AuthException), me, completeWebWelcome (403 for employee), dismissWebFeatureTip, logout, logoutAll, forgotPassword, resetPassword, resendVerification, confirmPassword |
| **API** | `POST /auth/register\|login\|forgot-password\|reset-password` (throttle:6,1); `GET /auth/me`; `POST /auth/web-welcome/complete\|web-feature-tips/dismiss\|logout\|logout-all\|email/resend\|confirm-password` |
| **FRONTEND** | [`useAuth.ts`](resources/js/features/auth/hooks/useAuth.ts:187): login/register payloads match backend rules; `useSyncExternalStore` token store with cross-tab sync; `AuthUser` interface mirrors `UserResource` including `company_access` object |
| **USER ACTION** | Login → POST /auth/login → token committed → `/auth/me` fetched → role-based redirect. Register → POST /auth/register → same flow. Logout → POST /auth/logout + local clear. Password flows all wired. |
| **PERMISSIONS** | `UserResource` returns `permissions` only on `auth.me`/`auth.login`/`auth.register` routes. Role gating via `RoleRoute` + `ProtectedRoute` + `navigationForRole()`. |

### Employees — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `employees` table: id, company_id, user_id, branch_id, department_id, position_id, first_name, last_name, email, phone, employment_type, hourly_rate, status, photo_path, invitation_token, invitation_expires_at |
| **BACKEND** | [`EmployeeController`](app/Http/Controllers/Api/EmployeeController.php:22): index (search/status/company_id/department_id/position_id/branch_id/employment_type/per_page), store, invite, show (loads company/user/department/position/branch), update, destroy, assignRole, assignDepartment, assignPosition, uploadPhoto (multipart), transfer (transactional capacity check) |
| **API** | `POST /employees/invite` (creates user + employee + sends invitation); `POST /employees/{id}/role\|department\|position\|photo\|transfer`; `POST/DELETE /employees/{id}/invitation`; `apiResource employees` |
| **FRONTEND** | [`useEmployees.ts`](resources/js/features/employees/hooks/useEmployees.ts:425): createEmployee → POST `/employees/invite` (correct); updateEmployee → PUT `/employees/{id}` (phone deliberately omitted — backend has no rule for it on update); all mutations invalidate `EMPLOYEES_KEYS.all` + setQueryData detail |
| **USER ACTION** | Employee list → GET /employees (filtered). Create → POST /employees/invite. Edit → PUT /employees/{id}. Photo → multipart POST. Transfer → POST /employees/{id}/transfer (validates destination capacity). |
| **ROLE VISIBILITY** | [`EmployeeListPage`](resources/js/features/employees/pages/EmployeeListPage.tsx:248): `isCompanyAdmin` gates edit/invite/revoke buttons; scheduler sees read-only list. Branch column renders plain text for schedulers (cannot reach `/branches/:id`). |

### Availability — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `employee_availabilities` table: id, employee_id, day_of_week, start_time, end_time |
| **BACKEND** | [`EmployeeAvailabilityController`](app/Http/Controllers/Api/EmployeeAvailabilityController.php:16): index, store, sync (bulk weekly), show, update, destroy; nested under `employees/{employee}/availabilities` |
| **API** | `apiResource employees/{employee}/availabilities` (index/store/sync/show/update/destroy) |
| **FRONTEND** | [`useEmployeeAvailability.ts`](resources/js/features/availability/hooks/useEmployeeAvailability.ts:180): nested URLs correct; `syncWeek` → POST `/employees/{id}/availabilities/sync`; create/update/delete mutations all invalidate availability keys |
| **USER ACTION** | View availability (read-only for scheduler per Request 15), add/edit/delete ranges, clear week, apply standard week. All mutations persisted to backend. |
| **READ-ONLY MODE** | `EmployeeAvailabilityPage.tsx` lines 261–290: checks `session.data.role === 'scheduler'` → sets `readOnly = true` → hides all edit controls. Verified in Request 15. |

### Leave — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `leave_requests` table: id, company_id, employee_id, leave_type_id, start_date, end_date, start_session, end_session, status, reason, total_days, admin_notes, rejection_reason, reviewed_by, reviewed_at, approved_at, rejected_at, attachments, attachment |
| **BACKEND** | [`LeaveRequestController`](app/Http/Controllers/Api/LeaveRequestController.php:17): index (status/company_id/employee_id/leave_type_id/date_from/date_to/per_page); store (multipart, handles `attachments[]` file array); show; approve (422 if not pending); reject (422 if not pending). Employee role forced to own `employee_id`. |
| **API** | `apiResource leave-requests` (only index/store/show); `POST leave-requests/{id}/approve\|reject` |
| **FRONTEND** | [`useLeaveRequests.ts`](resources/js/features/leave-requests/hooks/useLeaveRequests.ts:319): `canReviewLeaveRequests` checks `leave_request.approve`/`leave_request.reject` permissions or `super_admin` role. `toFormData` sends all fields + `attachments[]`. Approve sends `{ admin_notes }`, reject sends `{ rejection_reason }`. Mutations invalidate `['leave-requests']`, `['rosters']`, `['notifications']`. |
| **USER ACTION** | List (filtered by status/employee/date). Create → multipart POST. Detail → GET /leave-requests/{id}. Approve/Reject → POST with admin notes/reason. Permission-gated UI in `LeaveRequestDetailPage.tsx`. |
| **PERMISSIONS** | [`LeaveRequestDetailPage`](resources/js/features/leave-requests/pages/LeaveRequestDetailPage.tsx:60): `canManageRequests = canReviewLeaveRequests(currentUserQuery.data)` gates approve/reject buttons. [`LeaveRequestPolicy`](app/Policies/LeaveRequestPolicy.php:8) enforces company ownership + role checks server-side. |

### Leave Types — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `leave_types` table: id, company_id, name, description, default_days_per_year, color, is_active, created_by, updated_by |
| **BACKEND** | [`LeaveTypeController`](app/Http/Controllers/Api/LeaveTypeController.php:15): standard CRUD; sets created_by/updated_by |
| **API** | `apiResource leave-types` |
| **FRONTEND** | Standard CRUD hooks with query invalidation |
| **ROLE VISIBILITY** | Route `/leave-types` is `company_admin` only in both [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:404) and [`nav-items.ts`](resources/js/Components/layout/nav-items.ts:56). |

### Branches — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `branches` table: id, company_id, name, address, city, state, postcode, country, phone, email, latitude, longitude, manager_id, status, day_schedules (JSON), employee_capacity |
| **BACKEND** | [`BranchController`](app/Http/Controllers/Api/BranchController.php:15): index (search/status/company_id/per_page); show (loads `loadCount(['users','employees','shifts'])->load(['company','manager'])`); `POST branches/{branch}/activate\|deactivate`; `PUT branches/{branch}/capacity` |
| **API** | `apiResource branches`; `POST branches/{branch}/activate\|deactivate`; `PUT branches/{branch}/capacity` |
| **FRONTEND** | [`useBranches.ts`](resources/js/features/branches/hooks/useBranches.ts:169): `mapDaySchedules` with WEEKDAYS fallback; `toDaySchedulesPayload` sends only custom days (useDefault skipped, closed days send `{is_open:false}`); `toBranchPayload` includes coordinates; `useBranchOptions` with staleTime:0 + refetchOnMount:'always'. `useDeleteBranch` (line 401) removes detail query + invalidates all. |
| **USER ACTION** | List (filtered). Create/Edit with day schedules (custom/inherited per weekday). Activate/Deactivate. Capacity management. Delete. |

### Departments — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `departments` table: id, company_id, name, description, is_active |
| **BACKEND** | [`DepartmentController`](app/Http/Controllers/Api/DepartmentController.php:15): standard CRUD |
| **API** | `apiResource departments` |
| **FRONTEND** | [`useDepartments.ts`](resources/js/features/departments/hooks/useDepartments.ts:195): `DEPARTMENTS_KEYS {all, list, detail, options}`; create/update invalidate all; delete removes detail + invalidates all |
| **ROLE VISIBILITY** | Route `/departments` is `company_admin` only. |

### Positions — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `positions` table: id, company_id, department_id, name, description, default_hourly_rate, is_active |
| **BACKEND** | [`PositionController`](app/Http/Controllers/Api/PositionController.php:15): standard CRUD; `department_id` nullable |
| **API** | `apiResource positions` |
| **FRONTEND** | [`usePositions.ts`](resources/js/features/positions/hooks/usePositions.ts:190): `usePositionOptions(departmentId?)` filters by department; `toPositionPayload` sends `department_id` (null clears) and `default_hourly_rate` (from `payScale`) |
| **ROLE VISIBILITY** | Route `/positions` is `company_admin` only. |

### Companies/Settings — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `companies` table: id, name, slug, abn, business_type, country, state, timezone, status; `company_settings` table: company_id, logo, primary_color, secondary_color, date_format, time_format, currency, language, week_start |
| **BACKEND** | [`CompanyController`](app/Http/Controllers/Api/CompanyController.php:15): index (with `$companyScope` for non-super-admin); show (loads `loadCount(['branches','employees','users'])->load('settings')`); `PUT companies/{company}/settings` |
| **API** | `apiResource companies` (except show has separate auth); `GET/PUT companies/{company}/settings` |
| **FRONTEND** | [`useCompanies.ts`](resources/js/features/companies/hooks/useCompanies.ts:126): `mapSettings` with defaults (Australia/Sydney, d/m/Y, 24h, Monday, 480, 30, AUD, en); `fetchCurrentSubscription` GETs `/companies/{id}/subscriptions` per_page 1 (catches ALL errors → resolves null, intentional degradation for 403); `toSettingsPayload` includes logo/primary_color/secondary_color; all mutations invalidate appropriately |
| **USER ACTION** | Company list (super_admin). Company detail + settings. Status toggle via PUT /companies/{id} with {status}. |

### Notifications — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `notifications` table: id, type, data (JSON), read_at, created_at; uses Laravel's `HasDatabaseNotifications` trait |
| **BACKEND** | [`NotificationController`](app/Http/Controllers/Api/NotificationController.php:11): index (`?filter=unread\|read`, paginate 15-100), returns `{notifications, unread_count, meta}`; markAsRead; markAllAsRead; destroy |
| **API** | `GET /notifications`; `POST /notifications/read-all\|{notification}/read`; `DELETE /notifications/{notification}` |
| **FRONTEND** | [`useNotifications.ts`](resources/js/features/notifications/hooks/useNotifications.ts:65): `normalizeType` maps backend notification types to frontend types; `toActionUrl` maps leave→`/leave-requests/{id}`, shift_assigned→`/shifts` or `/rosters`, billing_alert→`/subscription`; Echo realtime on `App.Models.User.{id}` private channel invalidates all notifications; `NotificationBell.tsx` + `NotificationCenterPage.tsx` both wired correctly |
| **USER ACTION** | View notifications (filter all/unread). Mark read. Mark all read. Delete. Click → navigate to relevant page. |

### Billing/Subscriptions — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `subscriptions` table: id, company_id, plan_id, status, billing_cycle, stripe_* fields, trial_ends_at, cancelled_at; `subscription_payments` table; `plans` table |
| **BACKEND** | [`PlanSubscriptionController`](app/Http/Controllers/Api/PlanSubscriptionController.php:57): self-service surface (OUTSIDE `company.access`): show, plans (active, excludes Stripe IDs), usage (branches used/limit + branches_usage), features, upgrade/downgrade, billingPeriod, cancel, billingPortal, checkout (plan_id + billing_cycle + trial_days), resume, payments, invoices (=payments). Company scoped via `resolveCompany()`. |
| **API** | `GET/POST /subscription/*` (show, plans, usage, features, payments, invoices, checkout, upgrade, downgrade, cancel, resume, billing-period, billing-portal) |
| **FRONTEND** | [`useSubscription.ts`](resources/js/features/billing/hooks/useSubscription.ts:287): all 11 self-service endpoints mapped with correct URLs, payloads, and response shapes. `useBilling.ts` handles super-admin platform surface (`/plans`, `/companies/{id}/subscriptions/*`). Plan DTOs match backend: `price_monthly`/`price_six_monthly`/`price_yearly`/`interval`/`max_branches`/`max_employees`/`features` — Stripe IDs excluded. |
| **USER ACTION** | View summary. Browse plans. Checkout (Stripe hosted). Upgrade/downgrade. Change billing period. Cancel/resume. Billing portal (Stripe customer portal). View payments/invoices. |

### Super Admin — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | Companies, subscriptions, plans, subscription_payments, activity_log (Spatie) |
| **BACKEND** | [`SuperAdminController`](app/Http/Controllers/Api/SuperAdminController.php:15): subscriptions (with active_branches_count, filters status/plan_id/search); payments (with subscription.company/plan, is_refundable/is_refunded); audit (platform events whitelist, with causer/subject, resolveCompanyFromSubject); metrics (**real** mrr/arr/revenue/churn computed from actual billing data — no fabricated data) |
| **API** | `GET /super-admin/subscriptions\|payments\|audit\|metrics`; `companies/{company}/subscriptions` (GET index/POST store/GET show/POST cancel/resume/swap); `GET companies/{company}/subscriptions/{subscription}/payments`; `POST .../payments/{payment}/refund` |
| **FRONTEND** | [`useSuperAdmin.ts`](resources/js/features/super-admin/hooks/useSuperAdmin.ts:123): fetchPlatformMetrics → GET /dashboard/overview (maps plan_distribution with sharePct); useTenantCompanies → GET /companies per_page 15; useSuspendedTenantCount → GET /companies status=suspended per_page 1; usePlatformBillingMetrics → GET /super-admin/metrics (mrr/arr/revenue/churnRate); usePlatformSubscriptions/Payments/Audit → paginated queries. |
| **USER ACTION** | Platform dashboard (metrics). Tenant company list. View/manage subscriptions per company. View payments. View audit log. All server-enforced via `ensureSuperAdmin()`. |

### Dashboard — ✅ No Gaps (1 minor UX item noted above)

| Layer | Verified |
|-------|----------|
| **DATABASE** | Aggregated from companies, employees, branches, departments, rosters, shifts, leave_requests |
| **BACKEND** | `GET /dashboard/overview` — role-aware: company admins get workforce stats + department allocation + week summary; schedulers get shifts/leave/rosters data; super admins get platform metrics |
| **API** | `GET /dashboard/overview` (single endpoint, role-scoped response shape) |
| **FRONTEND** | [`CompanyAdminDashboard`](resources/js/features/dashboard/pages/CompanyAdminDashboard.tsx:43): uses `useCompanyDashboardOverview` (GET /dashboard/overview) + `useUsageOverview` (GET /subscription/usage). Has loading, error (with retry), and empty states. [`SchedulerDashboard`](resources/js/features/dashboard/pages/SchedulerDashboard.tsx:55): uses `useRosters` + `useShifts` + `useLeaveRequests` — all real API data, no mock. Has loading and empty states. **Missing `isError` handling** (see gap table). |
| **USER ACTION** | View KPIs (total/active employees, branches, departments). Department allocation chart. This-week summary. Subscription & branch usage. Scheduler: today's shifts, unassigned shifts, published rosters, pending leave, scheduling tasks, leave conflicts, upcoming shifts, roster status. |

### Shift Templates — ✅ No Gaps

| Layer | Verified |
|-------|----------|
| **DATABASE** | `shift_templates` table: id, company_id, name, start_time, end_time, break_minutes, is_paid_break, position_id, branch_id, notes |
| **BACKEND** | Standard `apiResource shift-templates`. No `apply` endpoint — creating shifts from a template uses `POST /shifts` directly. |
| **API** | `apiResource shift-templates` (index/store/show/update/destroy) |
| **FRONTEND** | CRUD hooks aligned. No template "apply" button in UI (fixed in M-03). Scheduler has no `shift_template.delete` permission — frontend hides delete for scheduler (verified in Request 15). |

---

## Cross-Cutting Concerns Verified

| Concern | Status | Details |
|---------|--------|---------|
| **Company isolation** | ✅ | Server-side enforced in every controller via `$request->user()->company_id` for non-super-admins. No endpoint returns cross-company data. |
| **Role gating (browser)** | ✅ | `RoleRoute` + `ProtectedRoute` in [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:363) enforce route-level access. `navigationForRole()` in [`nav-items.ts`](resources/js/Components/layout/nav-items.ts:63) filters sidebar items. |
| **Role gating (server)** | ✅ | Spatie permissions checked via policies + `$this->authorize()`. `UserResource.permissions` returned only on auth routes. |
| **Query invalidation** | ✅ | All mutation hooks invalidate relevant query keys on success. Optimistic updates used where appropriate (notifications read/delete). |
| **Loading states** | ✅ | Every page and major component has loading skeletons or `isLoading` checks. |
| **Error states** | ⚠️ | Most pages have error states with retry. SchedulerDashboard is the only page missing `isError` handling. |
| **Mutation feedback** | ✅ | All mutations use toast notifications (success/error) via sonner. |
| **API URL correctness** | ✅ | All frontend API calls match `routes/api.php` endpoints. No phantom URLs. |
| **HTTP method correctness** | ✅ | GET for reads, POST for creates/actions, PUT for updates, DELETE for removals — all correct. |
| **Request payload alignment** | ✅ | All frontend `toPayload`/`toFormData` functions send fields matching backend validation rules. |
| **Response DTO alignment** | ✅ | All frontend `mapDto`/`mapResource` functions consume fields matching backend resource output. |
| **Mock data** | ✅ | None found in non-roster code. All statistics computed from real data (super-admin MRR/ARR/revenue/churn from actual subscriptions/payments). |
| **console.log misuse** | ✅ | Only `console.error` in `ErrorBoundary.tsx` (correct production observability pattern). |
| **Hardcoded values** | ✅ | All hardcoded values are defensive defaults (date format, timezone, currency) that match database defaults. Department/position/branch options always fetched from API. |

---

## Prior Fixes Already Documented

These items were identified and resolved in earlier alignment passes. They remain clean:

| Fix | Document | Description |
|-----|----------|-------------|
| M-01 | `branches.md` | Branch day schedules alignment |
| M-02 | `branches.md` | Employee/users/shifts counts as distinct fields |
| M-03 | `shift-templates.md` | No "apply template" backend endpoint — UI correctly uses individual shift creation |
| M-04 | `leave.md` | `canReviewLeaveRequests` permission check (`leave_request.approve`/`.reject`) |
| M-05 | `employees.md` | Employee create via `/employees/invite` (creates user + employee + sends invite) |
| M-06 | `super-admin.md` | Real MRR/ARR/revenue/churn from billing data (no fabricated metrics) |
| M-07 | `notifications.md` | Billing alert `action_url` → frontend maps to SPA route `/subscription` |
| Request 15 | `scheduler.md` | Header Settings link gating, availability read-only mode, branch column plain text, availability label "View" |
