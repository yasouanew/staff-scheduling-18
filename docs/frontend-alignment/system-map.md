# Staff Scheduling SaaS — System Map & Frontend Alignment Audit

> **Status:** Read-only audit. No code was modified.
> **Scope:** Every non-roster feature of the Staff Scheduling SaaS (Laravel 11 API + React 18 SPA).
> **Method:** Backend/database/API is the **source of truth**. Frontend was checked against the real controllers, services, routes, requests, resources, models and migrations. Where the old UI/design docs conflict with the backend, the backend wins.
> **Roster exclusion:** All roster functionality (tables, models, controllers, services, hooks, components, pages) is deliberately excluded and out of scope for this audit.

---

## 1. Architecture Overview

### 1.1 Stack

| Layer | Technology |
|---|---|
| Backend | Laravel 11 (API) |
| Auth | Laravel Sanctum (bearer tokens), email verification, password confirmation |
| Roles/Permissions | Spatie Permission (`roles`, `permissions`, `role_has_permissions`, `model_has_roles`, `model_has_permissions`) |
| Audit log | Spatie Activitylog (`activity_log`) |
| Billing | Laravel Cashier + Stripe Checkout/Customer Portal/Webhooks |
| Realtime | Laravel Reverb + Echo (private channels) |
| Frontend | React 18 + Vite + TypeScript, React Router, TanStack Query, React Hook Form + Zod, Tailwind, Radix UI, Sonner, date-fns, Lucide icons |

### 1.2 API conventions

- Base URL: `/api/v1`
- Response envelope (`App\Traits\ApiResponse`): `{ success: bool, message: string|null, data: ... }`
- Auth via `Authorization: Bearer <token>` (storage key `staff_saas.auth_token`)
- Middleware aliases: `auth:sanctum`, `account.active`, `company.access`, `feature:<key>`, `subscription.active`
- Exception renderers for billing limits return `{ success:false, message, code, errors }` with codes:
  `EMPLOYEE_CAPACITY_REACHED`, `BRANCH_LIMIT_REACHED`, `DOWNGRADE_BRANCH_LIMIT_EXCEEDED`
- Axios interceptors (403 → toast; 401 → clear token + redirect `/login`); `getApiErrorMessage` handles 429/Retry-After; 409 is treated as a stale-version error

### 1.3 Frontend conventions

- Each feature page owns a feature-scoped `QueryClient` (`refetchOnWindowFocus: false`, `retry: 1`) wrapped in `QueryClientProvider`
- Hook-convention pattern:
  - `X_KEYS` query registry (TanStack Query)
  - `snake_case XDto` interfaces mirroring Laravel resources
  - `normalizeStatus()` coercing backend values into the UI union
  - `toXPayload()` serializers for mutations
  - `mapX()` DTO → domain mappers
- Browser role gating: `RoleRoute` + `ProtectedRoute` + `navigationForRole()` (in `resources/js/Components/layout/nav-items.ts`), driven by `useWebSession()` (`GET /auth/me`) and `normalizeWebRole()`

### 1.4 Seeded roles

`super_admin`, `company_admin`, `scheduler`, `employee`. **There are NO `admin`/`manager`/`owner` roles** in the system. Any backend code or frontend logic referencing `admin`/`manager`/`owner` is dead code (see mismatches).

---

## 2. Feature Map

### 2.1 Authentication

| Artifact | Location |
|---|---|
| DB tables | `users`, `personal_access_tokens` (Sanctum), `password_reset_tokens` |
| Models | `App\Models\User` (Sanctum `HasApiTokens`, Spatie `HasRoles`/`LogsActivity`, Cashier `Billable`) |
| Controllers | `App\Http\Controllers\Api\AuthController` |
| Domain actions | `App\Domains\Auth\Actions\{RegisterAction, LoginAction, LogoutAction, ForgotPasswordAction, ResetPasswordAction, ConfirmPasswordAction, VerifyEmailAction}` |
| API routes | `routes/auth.php`, `routes/api.php` — register, login, logout, `/auth/me`, email verification, forgot/reset password, password confirmation |
| React pages | `resources/js/features/auth/pages/{LoginPage,RegisterPage,ForgotPasswordPage,ResetPasswordPage,ConfirmPasswordPage,VerifyEmailPage}` |
| React components | `AuthLayout` |
| React hooks | `useAuth.ts` (session, login, logout, register), `useWebSession.ts` (`GET /auth/me`) |
| React types | `AuthUser` in `useAuth.ts` (`role`, `roles[]`, `permissions[]`, `company_id`, `company_access.{trial_is_active,trial_ends_at}`) |

**Notes:** Login synchronises device tokens (`DeviceToken::updateOrCreate`). Web roles drive browser gating via `normalizeWebRole`.

### 2.2 Users

| Artifact | Location |
|---|---|
| DB tables | `users` |
| Models | `App\Models\User` |
| Controllers | User CRUD is exposed through employee/invitation flows; no standalone UserController surface found |
| API routes | via `/auth/*` (own profile), employees invite/role/department endpoints |
| React | user data flows through `useAuth`/`useWebSession` and employee hooks |
| Types | `AuthUser`, `EmployeeRole` |

### 2.3 Companies

| Artifact | Location |
|---|---|
| DB tables | `companies` (incl. `trial_ends_at`, `locked_at`, `trial_ending_reminded_at`) |
| Models | `App\Models\Company` (LogsActivity) |
| Controllers | `App\Http\Controllers\Api\CompanyController` |
| Services | `App\Services\CompanyService` (create/suspend/reactivate, trial) |
| API routes | `GET/PUT /company` (own company), `GET/POST /companies` (super-admin scope), `POST /companies/{id}/status` |
| React hooks | `resources/js/features/companies/hooks/useCompanies.ts` (useCompany, useUpdateCompany, useUpdateCompanyStatus) |
| React pages | Company settings embedded in `CompanySettingsForm`; super-admin `SuperAdminCompanyDetailPage` |
| Types | `resources/js/types/company.ts` (`Company`, `CompanyStatus` = active/inactive/suspended) |

### 2.4 Company Settings

| Artifact | Location |
|---|---|
| DB tables | `company_settings` |
| Models | `App\Models\CompanySetting` |
| Controllers | `App\Http\Controllers\Api\CompanySettingController` |
| React components | `resources/js/features/companies/components/CompanySettingsForm.tsx` (logo upload, switch toggles) |
| React hooks | within `useCompanies.ts` |
| Types | `resources/js/types/company.ts` |

**MISMATCH:** The legacy **Settings** feature (`/settings` → `SettingsDashboardPage`) is a **mock**. It renders `MOCK_ORGANIZATION`, `MOCK_BRANCH`, `MOCK_POLICIES`, a `setTimeout`-based save stub and `AUSTRALIAN_TIMEZONES`/`baseHourlyRate`+4 rate-multiplier legacy fields that **do not exist in any backend table**. Real settings live in `company_settings`, real branches in `branches`, real departments/positions in their own tables. The page's "Departments" tab says "coming soon" and "Operational Policies" toggles (preventSchedulingDuringLeave, enforceMandatoryBreaks, autoPublishRosters, notifyOnShiftSwap, restrictOvertimeWithoutApproval) have no backend storage. See **M-02 (CRITICAL)**.

### 2.5 Branches

| Artifact | Location |
|---|---|
| DB tables | `branches` (incl. `operating_hours` from `2026_08_23_000002`) |
| Models | `App\Models\Branch` |
| Controllers | `App\Http\Controllers\Api\BranchController` |
| Services | `App\Services\BranchService` |
| API routes | `GET/POST /branches`, `GET/PUT/DELETE /branches/{branch}` (inside `company.access`) |
| Requests | `StoreBranchRequest`, `UpdateBranchRequest` |
| Resources | `BranchResource` |
| React hooks | `resources/js/features/branches/hooks/useBranches.ts` |
| React pages | `resources/js/features/branches/pages/BranchesListPage.tsx` |
| React components | `BranchFormModal` etc. |
| Types | `resources/js/types/branch.ts` |

### 2.6 Departments

| Artifact | Location |
|---|---|
| DB tables | `departments` |
| Models | `App\Models\Department` |
| Controllers | `App\Http\Controllers\Api\DepartmentController` |
| Services | `App\Services\DepartmentService` |
| API routes | `GET/POST /departments`, `GET/PUT/DELETE /departments/{department}` |
| Requests | `StoreDepartmentRequest`, `UpdateDepartmentRequest` |
| Resources | `DepartmentResource` |
| React hooks | `resources/js/features/departments/hooks/useDepartments.ts` |
| React pages | `resources/js/features/departments/pages/DepartmentsListPage.tsx` |
| Types | `resources/js/types/department.ts` |

### 2.7 Positions

| Artifact | Location |
|---|---|
| DB tables | `positions` |
| Models | `App\Models\Position` |
| Controllers | `App\Http\Controllers\Api\PositionController` |
| Services | `App\Services\PositionService` |
| API routes | `GET/POST /positions`, `GET/PUT/DELETE /positions/{position}` |
| Requests | `StorePositionRequest`, `UpdatePositionRequest` |
| Resources | `PositionResource` |
| React hooks | `resources/js/features/positions/hooks/usePositions.ts` |
| React pages | `resources/js/features/positions/pages/PositionsListPage.tsx` |
| Components | `PositionFormModal` |
| Types | `resources/js/types/position.ts` |

### 2.8 Employees

| Artifact | Location |
|---|---|
| DB tables | `employees` |
| Models | `App\Models\Employee` (LogsActivity, SoftDeletes) |
| Controllers | `App\Http\Controllers\Api\EmployeeController` |
| Services | `App\Services\EmployeeService` (invite, assignRole, assignDepartment, assignPosition) |
| Policies | `App\Policies\EmployeePolicy` |
| API routes | `GET/POST /employees`, `GET/PUT/DELETE /employees/{employee}`, `POST /employees/invite`, `POST /employees/{employee}/invitation`, `POST /employees/{employee}/role`, `POST /employees/{employee}/department`, `POST /employees/{employee}/position` |
| Requests | `StoreEmployeeRequest` (contractor/inactive/terminated), `UpdateEmployeeRequest` (contract + pending), `AssignRoleRequest` (`role in:company_admin,scheduler,employee`), `AssignAttributeRequest` |
| Resources | `EmployeeResource` |
| React hooks | `resources/js/features/employees/hooks/useEmployees.ts` (useEmployees, useCreateEmployee, useInviteEmployee, useSendInvitation, useUpdateEmployee, useAssignRole/useAssignDepartment) |
| React pages | `resources/js/features/employees/pages/EmployeeListPage.tsx` |
| Components | `AddEmployeeModal`, `EditEmployeeModal`, `SendInviteModal`, `EmployeeRowActions` |
| Types | `resources/js/types/employee.ts` (`EmployeeRole` = company_admin/scheduler/employee, `EMPLOYEE_ROLES`, `EMPLOYEE_ROLE_LABELS`, `EMPLOYEE_ROLE_DESCRIPTIONS`) |

**MISMATCH (MEDIUM):** Backend `Employee` model + `EmployeeResource` + `UpdateEmployeeRequest` accept `dob`, `gender`, `address`, `emergency_contact` fields, but the frontend `Employee` type, `mapEmployee()`, `AddEmployeeModal` and `EditEmployeeModal` omit them entirely. See **M-06**.

### 2.9 Employee Invitations

| Artifact | Location |
|---|---|
| DB tables | `employee_invitations` |
| Models | `App\Models\EmployeeInvitation` |
| Controllers | `App\Http\Controllers\Api\InvitationController` (public preview/accept) + `EmployeeController::invite` |
| Services | `App\Services\EmployeeInvitationService` (web + mobile channels) |
| Config | `config/invitations.php` — web: `web_expires_in_minutes` 2880; mobile: `code_length` 6, `code_expires_in_minutes` 15, `code_max_attempts` 5, `setup_token_expires_in_minutes` 30 |
| API routes | `GET /invitations` (preview), `POST /invitations/accept`, `POST /employees/invite`, `POST /employees/{employee}/invitation` |
| Requests | `InvitationPreviewRequest`, `AcceptInvitationRequest`, `StoreInvitationRequest` |
| Resources | `EmployeeInvitationResource` |
| React hooks | `resources/js/features/invitations/hooks/useInvitation.ts` (preview, accept), `useEmployees.ts` (invite/send invitation) |
| React pages | `resources/js/features/invitations/pages/{AcceptInvitationPage,DownloadAppPage}.tsx` |
| Components | `SendInviteModal` (`resolveChannel`: role → web/mobile) |
| Types | `InvitationChannel` (web/mobile), `InvitationStatus`, `EmployeeInvitation` in `employee.ts` |

**Dual-channel design:** company_admin/scheduler → tokenised **set-password web link**; employee → **mobile email code flow**. All secrets stored as SHA-256 hashes. Fully wired on both ends — no mismatch.

### 2.10 Employee Availability

| Artifact | Location |
|---|---|
| DB tables | `employee_availabilities` (`day_of_week` 0=Sunday..6=Saturday) |
| Models | `App\Models\EmployeeAvailability` |
| Controllers | `App\Http\Controllers\Api\EmployeeAvailabilityController` |
| Services | `App\Services\EmployeeAvailabilityService` |
| API routes | `GET/PUT /employees/{employee}/availability` |
| Requests | `UpsertAvailabilityRequest` |
| Resources | `EmployeeAvailabilityResource` |
| React pages | `resources/js/features/availability/pages/EmployeeAvailabilityPage.tsx` (REAL — `/employees/:id/availability`) |
| Components | `AvailabilityWeekGrid`, `AvailabilityRangeModal`, `TimeRangePicker` |
| Types | `resources/js/types/employee-availability.ts` (real), `resources/js/types/availability.ts` (legacy) |

**MISMATCH (CRITICAL):** The route **`/availability`** (nav item "Availability" for `COMPANY_ROLES`) is served by a **mock** `AvailabilityDashboard` using `useAvailability.ts` with an in-memory `AVAILABILITY_STORE`/`leaveRequestStore`, `NETWORK_DELAY_MS` 500ms setTimeout stubs and hardcoded `AVAILABILITY_EMPLOYEES` (emp-001 Olivia Bennett, emp-002 Liam Nguyen, emp-004 Noah Patel). The real feature is per-employee at `/employees/:id/availability`. See **M-01**.

### 2.11 Shift Templates

| Artifact | Location |
|---|---|
| DB tables | `shift_templates` |
| Models | `App\Models\ShiftTemplate` |
| Controllers | `App\Http\Controllers\Api\ShiftTemplateController` |
| Services | `App\Services\ShiftTemplateService` |
| API routes | `GET/POST /shift-templates`, `GET/PUT/DELETE /shift-templates/{shiftTemplate}`, `POST /shift-templates/{shiftTemplate}/apply`, `GET /roster-options` |
| Requests | `StoreShiftTemplateRequest`, `UpdateShiftTemplateRequest` |
| Resources | `ShiftTemplateResource` |
| React hooks | `resources/js/features/shift-templates/hooks/useShiftTemplates.ts` (useShiftTemplates, useShiftTemplate, useRosterOptions, useCreateShiftTemplate, useUpdateShiftTemplate, useDeleteShiftTemplate, useCreateShiftFromTemplate) |
| React components | `ShiftTemplatesTable`, `ShiftTemplatePreview` |
| Types | `resources/js/types/shift-template.ts` |

**MISMATCH (HIGH):** Full backend + hooks + components exist, but there is **no page or route** for shift templates — **backend with no UI**. See **M-03**.

### 2.12 Leave Types

| Artifact | Location |
|---|---|
| DB tables | `leave_types` (incl. `entitlement`/allowance rules from `2026_08_17_000002`) |
| Models | `App\Models\LeaveType` |
| Controllers | `App\Http\Controllers\Api\LeaveTypeController` |
| Services | `App\Services\LeaveTypeService` |
| API routes | `GET/POST /leave-types`, `GET/PUT/DELETE /leave-types/{leaveType}` |
| Requests | `StoreLeaveTypeRequest`, `UpdateLeaveTypeRequest` |
| Resources | `LeaveTypeResource` |
| React hooks | `resources/js/features/leave-types/hooks/useLeaveTypes.ts` |
| React pages | `resources/js/features/leave-types/pages/LeaveTypesListPage.tsx` |
| Types | `resources/js/types/leave-type.ts` |

**MISMATCH (MEDIUM):** `useLeaveTypes.ts` `toPayload()` omits the `color` field even though the backend accepts/returns `color`, and the frontend form schema has no colour field. See **M-05**.

### 2.13 Leave Requests

| Artifact | Location |
|---|---|
| DB tables | `leave_requests` (incl. `attachments` from `2026_08_17_000003`) |
| Models | `App\Models\LeaveRequest` (LogsActivity, SoftDeletes) |
| Controllers | `App\Http\Controllers\Api\LeaveRequestController` |
| Services | `App\Services\LeaveRequestService` (create, approve, reject, allowance checks, notifications) |
| Policies | `App\Policies\LeaveRequestPolicy` |
| API routes | `GET/POST /leave-requests`, `GET/PUT/DELETE /leave-requests/{leaveRequest}`, `POST /leave-requests/{leaveRequest}/approve`, `POST /leave-requests/{leaveRequest}/reject` |
| Requests | `StoreLeaveRequestRequest`, `ApproveLeaveRequestRequest`, `RejectLeaveRequestRequest` |
| Resources | `LeaveRequestResource` |
| React hooks | `resources/js/features/leave-requests/hooks/useLeaveRequests.ts` |
| React pages | `resources/js/features/leave-requests/pages/LeaveRequestsPage.tsx` |
| Types | `resources/js/types/leave-request.ts` |

**MISMATCH (HIGH):** `LeaveRequestService::notifyAdmins()` queries `User::whereIn('role', ['admin','manager','owner'])` — roles that are **never seeded**. The "new leave request" notification is therefore never sent. Frontend `canReviewLeaveRequests` mirrors this dead fallback (`role === 'admin'|'manager'|'owner'`) but the correct gate is the `leave.approve`/`leave.reject` permissions. See **M-04**.

### 2.14 Notifications

| Artifact | Location |
|---|---|
| DB tables | `notifications` (Laravel database channel, uuid PK) |
| Models | `App\Models\User` (Notifiable); notification classes incl. `ShiftAssignedNotification`, `LeaveRequestSubmittedNotification`, `LeaveRequestStatusNotification`, `SubscriptionActivatedNotification` |
| Controllers | `App\Http\Controllers\Api\NotificationController` (index, markAsRead, markAllAsRead, destroy) |
| API routes | `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/{notification}/read`, `DELETE /notifications/{notification}` (inside `company.access`) |
| Resources | `NotificationResource` (`type` from `data['type'] ?? class_basename`) |
| Realtime | Echo private channel `App.Models.User.{id}` (Reverb) |
| React hooks | `resources/js/features/notifications/hooks/useNotifications.ts` (`normalizeType` handles dotted+underscored forms; `toActionUrl` maps leave_request_id → /leave-requests/:id, shift_id → /shifts) |
| React pages | `resources/js/features/notifications/pages/NotificationCenterPage.tsx` (`/notifications`, filter tabs all/unread/read, pagination perPage 20) |
| Components | `NotificationBell` (popover, perPage 5, realtime), `NotificationsList`, `NotificationItem` |
| Types | `resources/js/types/notification.ts` (`NOTIFICATION_TYPES`, `AppNotification`, `NotificationPagination`) |

**Fully wired, no mismatch.** Backend filter (`all`/`unread`/`read`) matches the UI tabs; the realtime private channel matches Laravel broadcast channel naming; `normalizeType` gracefully handles both dotted (`shift.assigned`) and underscored (`shift_assigned`) type strings.

### 2.15 Device Tokens

| Artifact | Location |
|---|---|
| DB tables | `device_tokens` |
| Models | `App\Models\DeviceToken` (company_id, user_id, device_name, platform, token, app_version, os_version, is_active, last_used_at) |
| Controllers | `App\Http\Controllers\Api\DeviceTokenController` (store 201, destroy) |
| Services | `App\Services\DeviceTokenService` (`updateOrCreate` by token re-pointing to current user; unregister deletes) |
| Channels | `App\Notifications\Channels\FcmChannel` (lazy Messaging; deactivates dead tokens on NotFound) |
| API routes | `POST /device-tokens`, `DELETE /device-tokens` (inside `company.access`) |
| Requests | `RegisterDeviceTokenRequest` (platform in: ios,android,web), `DeleteDeviceTokenRequest` |
| Resources | `DeviceTokenResource` (intentionally does NOT expose the token) |

**No web UI by design** — mobile-only FCM registration. Not flagged as a mismatch.

### 2.16 Plans

| Artifact | Location |
|---|---|
| DB tables | `plans` (name, slug, description, price_monthly/price_six_monthly/price_yearly, currency, stripe_*_price_id, stripe_product_id, max_employees, max_branches, features, is_active, sort_order, metadata) |
| Models | `App\Models\Plan` (hasUnlimitedEmployees/Branches, subscriptions, planFeatures, features belongsToMany via `plan_features`) |
| Controllers | `App\Http\Controllers\Api\PlanController` (super-admin CRUD), `PublicPlanController` (`GET /public/plans`), `FeatureController::index` (entitlements) |
| Services | `App\Services\PlanService` |
| API routes | `GET/POST /plans`, `GET/PUT/DELETE /plans/{plan}` (super-admin), `GET /public/plans`, `GET /features` |
| Requests | `StorePlanRequest`, `UpdatePlanRequest` |
| Resources | `PlanResource` |
| React hooks | `useBilling.ts` (`useBillingPlans`, `useCreatePlan`, `useUpdatePlan`, `useDeletePlan`); `useSubscription.ts` (`useManagementPlans`) |
| React pages | `resources/js/features/billing/pages/PlansPage.tsx`, `SubscriptionDashboardPage` (plan tab) |
| Components | `PlanForm`, `PlansTable`, `PlanCard` |
| Types | `resources/js/types/billing.ts` (`BillingPlan` incl. stripe price ids + subscriptionsCount, `PlanInput`), `features/billing/types.ts` (`ManagementPlan`) |

### 2.17 Features

| Artifact | Location |
|---|---|
| DB tables | `features` (key, label, description, is_active, sort_order) |
| Models | `App\Models\Feature` (keyEnum → `App\Enums\Feature`) |
| Enums | `App\Enums\Feature` — 14 cases: roster, employee_management, branch_management, leave, availability, notifications, shift_swap, advanced_reporting, analytics, audit_log, multi_branch, api_access, advanced_permissions, payroll_integration; `isBranchScoped()` = roster/employee_management/branch_management/leave/availability/notifications/shift_swap |
| Seeders | `FeatureSeeder` (mirrors enum 1:1), `PlanFeatureSeeder` |
| Controllers | `FeatureController::index` returns company entitlements `{plan, entitled, features:[{key,label,branch_scoped,enabled,limit}]}`; `reporting()` gated by `feature:advanced_reporting` |
| React hooks | `useSubscription.ts` (`useManagementPlans` → plan features), `FeatureController` consumption in `SubscriptionDashboardPage` |

### 2.18 Plan Features

| Artifact | Location |
|---|---|
| DB tables | `plan_features` (plan_id, feature_id, is_enabled, limit_value, configuration) |
| Models | `App\Models\PlanFeature` |
| Seeders | `PlanFeatureSeeder` (Free/Starter/Professional/Enterprise × features) |
| React | consumed via plan `features` in `PlanResource`/entitlements |

### 2.19 Subscriptions

| Artifact | Location |
|---|---|
| DB tables | `subscriptions` (stripe_id, stripe_status, stripe_price, checkout_session_id, quantity, status, billing_cycle, starts_at, ends_at, trial_ends_at, cancelled_at, cancel_at_period_end, renewal_reminded_at, activation_notified_at, past_due_since, grace_ends_at, suspended_at, webhook_event_ids, metadata) |
| Models | `App\Models\Subscription` (scopes active/trialing; isActive/isOnTrial/isCancelled; company/user/plan/payments/branchSubscriptions) |
| Controllers | **Self-service:** `PlanSubscriptionController` (OUTSIDE `company.access` — for locked-company reactivation): show (summary), plans, usage, features, upgrade, downgrade, billingPeriod, cancel, billingPortal, checkout, resume, payments, invoices. **Super-admin:** `SubscriptionController` (explicit company): index, store, show, cancel, resume, swap |
| Services | `App\Services\SubscriptionService` (changePlan, startCheckout, cancel, resume, billing portal) |
| API routes (self-service) | `GET /subscription`, `/subscription/plans`, `/subscription/usage`, `/subscription/features`, `/subscription/payments`, `/subscription/invoices`; `POST /subscription/checkout`, `/upgrade`, `/downgrade`, `/cancel`, `/resume`, `/billing-period`, `/billing-portal` |
| API routes (super-admin) | `GET/POST /companies/{company}/subscriptions`, `GET /companies/{company}/subscriptions/{subscription}`, `POST .../{subscription}/cancel|resume|swap`, `GET .../{subscription}/payments` |
| Requests | `ChangeSubscriptionPlanRequest` |
| Resources | `SubscriptionResource`, `SubscriptionSummaryResource` (deliberately omits Stripe secrets) |
| React hooks | `useSubscription.ts` (self-service full surface), `useBilling.ts` (super-admin surface) |
| React pages | `SubscriptionDashboardPage` (tabs: overview/plan/usage/branches/billing/invoices), `PlansPage`, `LockedCompanyPage` |
| Components | `PlanCard`, `UpgradePlanDialog`, `CheckoutDialog`, `BranchCapacityDialog`, `BranchUsageCard`, `CapacityWarning`, `InvoiceHistoryTable` |
| Types | `features/billing/types.ts` (`BillingCycle` monthly/six_month/yearly, `SubscriptionSummary`, `SubscriptionState`, `TrialInfo`, `UsageOverview`, `BillingErrorCode`) |

### 2.20 Branch Subscriptions

| Artifact | Location |
|---|---|
| DB tables | `branch_subscriptions` (company_id, branch_id, subscription_id, status, employee_capacity, started_at, ended_at, cancelled_at, metadata) |
| Models | `App\Models\BranchSubscription` — `booted()` creating/updating hooks call `assertConsistentCompanyScope()` (RuntimeException if branch/subscription belong to different company); scopes active/entitled; `grantsAccess()` |
| Controllers | `App\Http\Controllers\Api\BranchSubscriptionController` (usage, activate, deactivate, updateCapacity) |
| Services | `App\Services\BranchSubscriptionService` / `UsageService` |
| API routes | `POST /branches/{branch}/activate`, `POST /branches/{branch}/deactivate`, `PUT /branches/{branch}/capacity` (inside `company.access`), `GET /subscription/usage` |
| Requests | `ActivateBranchRequest` (employee_capacity), `UpdateBranchCapacityRequest` |
| React hooks | `useBranchBilling.ts` (`useActivateBranch`, `useDeactivateBranch`, `useUpdateBranchCapacity`, refreshUsage seeds summary+usage caches) |
| React pages | `SubscriptionDashboardPage` (usage + branches tabs) |
| Types | `BranchUsageItem`, `BranchCapacityResult`, `BranchBillingMutationResult` |

### 2.21 Subscription Payments

| Artifact | Location |
|---|---|
| DB tables | `subscription_payments` (subscription_id, amount, currency, payment_provider, provider_reference, stripe_payment_intent_id, status, amount_refunded, paid_at, refunded_at) |
| Models | `App\Models\SubscriptionPayment` (scopes succeeded/failed/refunded; isSuccessful/isRefunded/isRefundable) |
| Controllers | `SubscriptionPaymentController` (index perPage 15, refund super-admin-only) |
| Services | `App\Services\PaymentService` (refund) |
| API routes | `GET /companies/{company}/subscriptions/{subscription}/payments`, `POST .../payments/{payment}/refund`, `GET /subscription/payments`, `GET /subscription/invoices` |
| Resources | `SubscriptionPaymentResource` (incl. is_refundable/is_refunded) |
| React hooks | `useSubscription.ts` (`useSubscriptionPayments`, `useSubscriptionInvoices`), `useBilling.ts` (`useBillingPayments`, `useRefundPayment`), `useSuperAdmin.ts` (`usePlatformPayments`) |
| React pages | `SubscriptionDashboardPage` (billing + invoices tabs), `SuperAdminPaymentsPage` |
| Types | `BillingPayment` in `types/billing.ts` |

### 2.22 Stripe Webhook Events

| Artifact | Location |
|---|---|
| DB tables | `stripe_webhook_events` (event_id, type, status, payload, processed_at) |
| Models | `App\Models\WebhookEvent` |
| Controllers | `App\Http\Controllers\Api\StripeBillingWebhookController::handle` — signature verification (503 if unconfigured, 400 if missing/invalid), **global idempotency** via `stripe_webhook_events`, `DB::transaction`, dispatchEvent match (checkout.session.completed, invoice.paid, invoice.payment_failed/invoice.failed, customer.subscription.created/updated/deleted); handleInvoicePaid → markPaid + activateSubscription (unlock company + notify company_admin via `SubscriptionActivatedNotification`, `activation_notified_at` idempotency); handleSubscriptionUpdated reconciles status + `reconcilePlanFromProvider` (Stripe price id → local plan) |
| API routes | `POST /webhooks/stripe/billing` (outside auth) |
| React | none (server-side only) |

### 2.23 Platform Settings

| Artifact | Location |
|---|---|
| DB tables | `platform_settings` (trial_period_days) |
| Models | `App\Models\PlatformSetting` (static `current()` = firstOrCreate id 1, default 14) |
| Controllers | `App\Http\Controllers\Api\PlatformTrialSettingController` (show/update, ensureSuperAdmin) |
| API routes | `GET /platform-settings/trial`, `PUT /platform-settings/trial` (super-admin) |
| React hooks | `useBilling.ts` (`usePlatformTrialSetting`, `useUpdatePlatformTrialSetting`) |
| React pages | `resources/js/features/super-admin/pages/SuperAdminPlatformSettingsPage.tsx` (`/super-admin/settings` — TrialSettingCard, min 1 max 365) |
| Types | via `useBilling.ts` (trial_period_days) |

**Fully wired, no mismatch.** Backend min 1 / max 365 matches the UI validation.

### 2.24 Activity Logs

| Artifact | Location |
|---|---|
| DB tables | `activity_log` (Spatie Activitylog) |
| Models | LogsActivity on `User`, `Company`, `Employee`, `LeaveRequest`, `Roster`, `Shift` |
| Controllers | `SuperAdminController::audit` — platform event list: plan_changed, plan_created, plan_updated, plan_deactivated, plan_activated, subscription_created, subscription_cancelled, subscription_resumed, subscription_swapped, payment_failed, payment_succeeded, refund_issued, company_suspended, company_reactivated, company_created; filters event/search; resolves company from subject/properties |
| API routes | `GET /super-admin/audit` (perPage 20) |
| React hooks | `useSuperAdmin.ts` (`usePlatformAudit`) |
| React pages | `resources/js/features/super-admin/pages/SuperAdminAuditPage.tsx` (`/super-admin/audit`, eventLabel/eventTone maps) |
| Types | `PlatformAuditEvent` in `types/super-admin.ts` |

**Fully wired, no mismatch.** The 15 platform events in the backend exactly match the `eventLabel()` switch in `SuperAdminAuditPage.tsx`.

### 2.25 Roles

| Artifact | Location |
|---|---|
| DB tables | `roles`, `model_has_roles` (Spatie Permission, migration `2026_07_27_125352_create_permission_tables.php`) |
| Models | Spatie `Role`; `User` uses `HasRoles` |
| Seeders | `RoleAndPermissionSeeder` — super_admin (all), company_admin (all except company.create/company.delete/subscription.refund), scheduler (branch.view, employee.view, department.view, position.view, roster.*, shift.*, shift_template.view/create/edit, leave_request.view/approve/reject, report.view), employee (shift.view, roster.view, leave_request.view/create) |
| API routes | none dedicated; role assignment via `POST /employees/{employee}/role` (AssignRoleRequest in: company_admin,scheduler,employee) |
| React | role gating via `useWebSession`/`normalizeWebRole`/`RoleRoute`/`ProtectedRoute`/`nav-items.ts`; role set via invite + `SendInviteModal` role select; `EMPLOYEE_ROLES`/`EMPLOYEE_ROLE_DESCRIPTIONS` in `types/employee.ts` |

**MISMATCH (LOW):** Backend `POST /employees/{employee}/role` (`assignRole`) exists but no frontend call to it was found; the frontend changes roles exclusively through the invite flow (`/employees/invite`, `/employees/{id}/invitation`). Also, the `super_admin` role is **not** in the frontend `EmployeeRole` union (`company_admin | scheduler | employee`) — consistent with `AssignRoleRequest` (in: company_admin,scheduler,employee) so **not a mismatch**; employees can never be granted super_admin via the app. See **M-07**.

### 2.26 Permissions

| Artifact | Location |
|---|---|
| DB tables | `permissions`, `role_has_permissions`, `model_has_permissions` |
| Models | Spatie `Permission` |
| Seeders | `RoleAndPermissionSeeder` — grouped: company.*, branch.*, user.*, employee.*, department.*, position.*, roster.*, shift.*, shift_template.*, leave_type.*, leave_request.*, subscription.view/manage/refund, report.view, settings.view/edit |
| Policies | `EmployeePolicy`, `LeaveRequestPolicy`, `BranchPolicy`, etc. |
| React | `useWebSession` exposes `user.permissions[]`; `features/billing/lib/permissions.ts` (`canViewBilling`, `canManageBilling`, `canManageBranchBilling`) checks `permissions.includes('subscription.view'/'subscription.manage'/'branch.edit')` |

---

## 3. Confirmed Mismatches (severity-classified)

### CRITICAL

**M-01 — Mock Availability Dashboard replaces a real feature**
- **Where:** `/availability` route + nav item "Availability" → mock `AvailabilityDashboard`; `resources/js/features/availability/hooks/useAvailability.ts` uses in-memory `AVAILABILITY_STORE`/`leaveRequestStore`, `NETWORK_DELAY_MS` 500ms setTimeout stubs, hardcoded `AVAILABILITY_EMPLOYEES` (emp-001 Olivia Bennett, emp-002 Liam Nguyen, emp-004 Noah Patel), legacy `@/types/availability` types.
- **Truth:** Real backend feature (`employee_availabilities` table, `EmployeeAvailabilityController`, `GET/PUT /employees/{employee}/availability`) is rendered by the per-employee `EmployeeAvailabilityPage` at `/employees/:id/availability`.
- **Impact:** Users reach a fake dashboard that saves nothing and displays hardcoded people; the real availability editor is buried under each employee. Data shown/edited at `/availability` is not persisted.
- **Action:** Remove/redirect the `/availability` nav+route, or re-point it to the real per-employee editor with real data.

**M-02 — Mock Settings page (Settings feature)**
- **Where:** `/settings` → `resources/js/features/settings/pages/SettingsDashboardPage.tsx` + `components/BranchForm.tsx`, `PolicyTogglePanel.tsx`; `resources/js/types/settings.ts`.
- **Truth:** Real company settings live in `company_settings`; real branches in `branches`; departments/positions in their own tables. Settings are surfaced by `CompanyController`/`CompanySettingController` and the `CompanySettingsForm` component.
- **Impact:** The page ships hardcoded `MOCK_ORGANIZATION`/`MOCK_BRANCH`/`MOCK_POLICIES`, legacy fields (`AUSTRALIAN_TIMEZONES`, `baseHourlyRate` + weekday/saturday/sunday/publicHoliday rate multipliers) that no backend table stores, a "Departments coming soon" placeholder, and 5 "Operational Policies" toggles with no backend storage. Submitting just `console.log`s after a `setTimeout`.
- **Action:** Wire the page to `GET/PUT /company`, `/branches`, `/departments`, `/positions`; remove mock/legacy fields; reconcile policy toggles against real backend config (or remove them).

### HIGH

**M-03 — Shift Templates: backend with no UI**
- **Where:** Full `shift_templates` table/model/controller/service/resources + `useShiftTemplates.ts` hook (with `useCreateShiftFromTemplate`, `useRosterOptions`) + `ShiftTemplatesTable`/`ShiftTemplatePreview` components, but **no page or route** references them. No `/shift-templates` route in `AppRoutes.tsx`; no nav item.
- **Impact:** A complete feature (create/apply templates, roster-options) is unreachable by users.
- **Action:** Add a Shift Templates page + route + nav entry wired to the existing hook/components.

**M-04 — Leave-request admin notification never fires (dead roles)**
- **Where:** `app/Services/LeaveRequestService.php::notifyAdmins()` queries `User::whereIn('role', ['admin','manager','owner'])` — none of these roles exist (seeded roles are `company_admin`, `scheduler`, `employee`, `super_admin`).
- **Also:** `resources/js/features/leave-requests/hooks/useLeaveRequests.ts` `canReviewLeaveRequests` includes dead fallbacks `user?.role === 'admin'|'manager'|'owner'`.
- **Impact:** The "new leave request submitted" notification is never sent to any manager. Frontend review gating works only through the correct `leave.approve`/`leave.reject` permission check.
- **Action:** Change the backend query to the Spatie permission `leave_request.approve` (or seeded roles) and drop the dead role fallbacks in the hook.

### MEDIUM

**M-05 — Leave-type `color` omitted in frontend payload**
- **Where:** `resources/js/features/leave-types/hooks/useLeaveTypes.ts` `toPayload()` omits `color`; the create/edit form schema has no colour field.
- **Truth:** Backend `LeaveType` model + `Store/UpdateLeaveTypeRequest` + `LeaveTypeResource` accept and return `color`.
- **Impact:** Colour chosen on the backend (used for calendar/roster theming) is never sent, so leave types cannot be colour-coded from the UI.
- **Action:** Add a colour field to the form schema and include `color` in `toPayload()`.

**M-06 — Employee profile fields missing from frontend**
- **Where:** `resources/js/types/employee.ts`, `useEmployees.ts` `mapEmployee()`, `AddEmployeeModal.tsx`, `EditEmployeeModal.tsx`.
- **Truth:** Backend `Employee` model + `EmployeeResource` + `UpdateEmployeeRequest` include `dob`, `gender`, `address`, `emergency_contact`.
- **Impact:** Backend stores these but the UI can neither read nor edit them.
- **Action:** Add the fields to the type, mapper, and edit modal.

### LOW

**M-07 — `assignRole` endpoint unused by frontend**
- **Where:** `POST /employees/{employee}/role` (`EmployeeController::assignRole`, `EmployeeService::assignRole` → `syncRoles`) has **no frontend caller**.
- **Truth:** Frontend changes roles exclusively through invite/send-invitation (`/employees/invite`, `/employees/{id}/invitation`), which also re-emails onboarding.
- **Impact:** Low — role changes for an already-onboarded user have no UI path other than re-inviting.
- **Action:** Either surface role change in the row menu (via `assignRole`) or remove the endpoint.

---

## 4. Resolved Non-Mismatches (verified correct)

These were examined and confirmed **correct** — no change needed:

- **Billing — fully REAL on both surfaces.** Self-service (`PlanSubscriptionController`, outside `company.access`) and super-admin (`SubscriptionController`, explicit company) are both wired to real data. Stripe Checkout + Customer Portal + webhooks with global idempotency; MRR/ARR/revenue/churn computed from real billing data only; `SubscriptionSummaryResource` deliberately omits Stripe secrets. No mock data in billing.
- **Notifications — fully wired** (backend filter matches UI tabs; Echo private channel matches Laravel naming; `normalizeType` handles dotted+underscored).
- **Device Tokens — mobile-only by design** (no web UI required; FcmChannel deactivates dead tokens; `DeviceTokenResource` hides the token).
- **Platform Settings — fully wired** (trial_period_days, min 1 / max 365 matches UI).
- **Activity Logs — fully wired** (15 platform events match the audit page `eventLabel()` map exactly).
- **Roles/Permissions seeding** — `super_admin` excluded from the employee role union is consistent with `AssignRoleRequest` `in:company_admin,scheduler,employee`.
- **`/subscription/usage`** — `branches_usage` vs `branch_usage` handled by `mapUsage()` (both shapes).
- **StoreShiftRequest `paid_break`** — correct.
- **LeaveRequestResource returns the raw `leave_type` model** — frontend `leaveType.name` correct.
- **UpdateEmployeeRequest accepts `contract` + `pending`** — matches `EditEmployeeModal`.
- **StoreEmployeeRequest only `contractor`/`inactive`/`terminated`** — consistent because `AddEmployeeModal` sends a role, not employment_type/status.
- **Employee availability day indexing** — backend 0=Sunday..6=Saturday, frontend renders Monday-first via `DAY_ORDER [1,2,3,4,5,6,0]`.

---

## 5. Prioritized Implementation Plan

| Priority | Ref | Work | Effort | Dependencies |
|---|---|---|---|---|
| P0 | M-01 | Replace mock `/availability` dashboard with the real per-employee availability editor (or remove the fake route/nav and surface the real one). Delete `useAvailability.ts` in-memory store and legacy `types/availability.ts` usage. | M | Backend already complete |
| P0 | M-02 | Rewire `/settings` to real `GET/PUT /company`, `/branches`, `/departments`, `/positions`. Remove mock org/branch/policies + legacy `AUSTRALIAN_TIMEZONES`/rate-multiplier fields. Map/replace the 5 policy toggles against real backend config or remove. | L | Backend already complete |
| P1 | M-04 | Fix `notifyAdmins()` to target the `leave_request.approve` permission (or seeded `company_admin`/`scheduler`); drop `admin/manager/owner` fallbacks in `canReviewLeaveRequests`. | S | Backend change + frontend |
| P1 | M-03 | Add a Shift Templates page + route + nav entry wired to existing `useShiftTemplates` hook and `ShiftTemplatesTable`/`ShiftTemplatePreview`. | M | Backend/hooks complete |
| P2 | M-06 | Add `dob`, `gender`, `address`, `emergency_contact` to the employee type, mapper, and Edit modal. | S | — |
| P2 | M-05 | Add `color` to leave-type form schema + `toPayload()`. | S | — |
| P3 | M-07 | Decide: surface role change via `assignRole` in the employee row menu, or remove the unused endpoint. | S | — |

---

## 6. Audit Scope & Method Notes

- **Source of truth:** Backend migrations, models, controllers, services, routes, requests, resources, seeders, config, policies, enums.
- **Frontend evidence:** `resources/js` feature directories, hooks (`use*`), pages, components, types, routes (`AppRoutes.tsx`, `ProtectedRoute.tsx`, `nav-items.ts`), `lib/api-client.ts`.
- **No roster code was inspected or modified.**
- **No code was changed.** This is a read-only audit per the master rule in `.roo/ui-ux.md`.
- Where old UI/design docs (`docs/*-audit.md`, `docs/frontend-ui-audit.md`) conflicted with the backend, the backend was treated as authoritative.
