# Leave Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Leave: `leave_types`, `leave_requests`, employees, users, companies, notifications. Trace: Leave UI → React state/form → API → Laravel → database → response → UI. Audit: Leave Types (list, create, edit, delete), Leave Requests (list, details, create, approve, reject, cancel). Verify: every form/action field, status values, date handling, employee + leave type relationships, approval/rejection fields, notification behavior, role-specific behavior.
> **Method:** Backend/database/API is the **source of truth**. Every field was compared between backend (migration, model, validation, service, controller, resource, routes, policy, seeder, notification) and frontend (types, hooks, schemas, lib, components, pages, routes, nav). Only the frontend was changed — no backend code, migrations, business rules, or API payloads were touched. **Roster is out of scope.**
> **Reference docs:** `.roo/ui-ux.md` (architectural reference — not the ultimate source of truth), `docs/frontend-alignment/system-map.md` (M-04, M-05), `docs/task-14-15-shifts-leave-audit.md`.

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `leave_types` table + `LeaveType` model

| Column | Type / Validation | Notes |
|---|---|---|
| `id` | bigIncrements | |
| `company_id` | foreignId → `companies`, **`cascadeOnDelete`** | Required ownership. Set server-side on create. |
| `name` | string, required | max 255 |
| `code` | string, nullable | max 50 |
| `description` | text, nullable | max 1000 |
| `allowance_days` | decimal, nullable | 0–365 |
| `is_paid` | boolean, default `true` | |
| `allows_rollover` | boolean, default `true` | from `2026_08_17_000002` entitlement-rules migration |
| `max_rollover_days` | unsignedInteger, nullable | |
| `requires_approval` | boolean, default `true` | |
| `allow_half_day` | boolean, default `true` | |
| `max_days_per_request` | unsignedInteger, nullable | |
| `color` | string(7), nullable, **default `#F59E0B`** | regex `^#([A-Fa-f0-9]{6})$` |
| `status` | string, default `'active'` | `in:active,inactive` |
| `created_by` / `updated_by` | foreignId → `users`, nullable `nullOnDelete` | Set server-side |
| `created_at` / `updated_at` | timestamps | |
| `deleted_at` | softDeletes | |

Model `$fillable`: `company_id, name, code, description, allowance_days, is_paid, allows_rollover, max_rollover_days, requires_approval, allow_half_day, max_days_per_request, color, status, created_by, updated_by`. Relations: `company()`, `creator()`, `updater()`, `leaveRequests()`. `scopeActive()` filters `status = 'active'`.

### 1.2 `leave_requests` table + `LeaveRequest` model

| Column | Type / Validation | Notes |
|---|---|---|
| `id` | bigIncrements | |
| `company_id` | foreignId → `companies`, **`cascadeOnDelete`** | Required ownership. Set server-side on create. |
| `employee_id` | foreignId → `employees`, `cascadeOnDelete` | |
| `leave_type_id` | foreignId → `leave_types`, `cascadeOnDelete` | |
| `start_date` / `end_date` | date | `Y-m-d` |
| `start_session` / `end_session` | string | `in:full_day,first_half,second_half` |
| `total_days` | decimal | computed server-side (incl. half-day 0.5 deductions) |
| `reason` | text, nullable | |
| `attachment` | string, nullable | legacy single file path |
| `attachments` | json, nullable | array of file paths (from `2026_08_17_000003`) |
| `status` | string, default `'pending'` | `in:pending,approved,rejected,cancelled` |
| `approved_by` / `approved_at` | foreignId + timestamp, nullable | set on approve |
| `rejected_by` / `rejected_at` | foreignId + timestamp, nullable | set on reject |
| `rejection_reason` | text, nullable | required on reject |
| `admin_notes` | text, nullable | optional on approve |
| `created_by` / `updated_by` | foreignId, nullable | |
| `created_at` / `updated_at` | timestamps | |
| `deleted_at` | softDeletes | |

Model `$fillable`: `company_id, employee_id, leave_type_id, start_date, end_date, start_session, end_session, total_days, reason, attachment, attachments, status, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, admin_notes, created_by, updated_by`. Relations: `company()`, `employee()`, `leaveType()`, `approver()`, `rejecter()`. Scopes: `pending()`, `approved()`.

### 1.3 API surface (all nested under authenticated `api/v1`)

**Leave types** — `Route::apiResource('leave-types', LeaveTypeController::class)` ([`routes/api.php`](routes/api.php)):
- `GET /leave-types` → index, paginated
- `POST /leave-types` → store, 201
- `GET /leave-types/{leaveType}` → show
- `PUT /leave-types/{leaveType}` → update
- `DELETE /leave-types/{leaveType}` → destroy

Index supports server-side filters: `search`, `status`, `per_page` (default 100 in the service). Non-super-admin users are forcibly scoped to their own `company_id`. `store` sets `company_id` (non-super) + `created_by`/`updated_by` server-side; `update` sets `updated_by`.

**Leave requests** — `Route::apiResource('leave-requests', LeaveRequestController::class)->only(['index','store','show'])` + `POST /leave-requests/{leaveRequest}/approve` + `POST /leave-requests/{leaveRequest}/reject`:
- `GET /leave-requests` → index, paginated (filters: `status`, `employee_id`, `leave_type_id`, `date_from`, `date_to`, `per_page`)
- `POST /leave-requests` → store, 201 (multipart, accepts `attachments[]`)
- `GET /leave-requests/{leaveRequest}` → show
- `POST /leave-requests/{leaveRequest}/approve` → approve (optional `admin_notes`, abort 422 unless pending)
- `POST /leave-requests/{leaveRequest}/reject` → reject (required `rejection_reason`, abort 422 unless pending)

Index forces `company_id` for non-super and `employee_id` for the `employee` role (403 if no profile). Store sets `company_id` server-side, forces `employee_id` for the `employee` role, stores `attachments` (multipart) and sets `attachment` = first file.

> ⚠️ **System-map discrepancy (documented, trust the implementation):** [`system-map.md`](docs/frontend-alignment/system-map.md:251) lists `GET/PUT/DELETE /leave-requests/{leaveRequest}`. **The PUT/DELETE routes do not exist** — the resource is `->only(['index','store','show'])`. There is **no update, delete, or cancel endpoint** for leave requests. `cancelled` is a valid DB status value, but no API route transitions a request to it. Per task rules, the actual codebase/API is the source of truth.

### 1.4 Validation

**StoreLeaveTypeRequest** ([`StoreLeaveTypeRequest.php`](app/Http/Requests/LeaveType/StoreLeaveTypeRequest.php:24)): `name` required max 255; `code` nullable max 50; `description` nullable max 1000; `allowance_days` nullable numeric 0–365; `is_paid`/`allows_rollover`/`requires_approval`/`allow_half_day` nullable boolean; `max_rollover_days`/`max_days_per_request` nullable integer; `color` nullable string regex `^#([A-Fa-f0-9]{6})$`; `status` nullable `in:active,inactive`. **Update** mirrors with `sometimes` on key fields.

**StoreLeaveRequestRequest** ([`StoreLeaveRequestRequest.php`](app/Http/Requests/Leave/StoreLeaveRequestRequest.php:24)): `employee_id`/`leave_type_id` required exists; `start_date`/`end_date` required date; `start_session`/`end_session` required `in:full_day,first_half,second_half`; `reason` nullable max 5000; `attachments.*` nullable file max 5120 KB with `mimes:pdf,jpg,jpeg,png,doc,docx`, max 5 files. **ApproveLeaveRequestRequest**: `admin_notes` nullable max 1000. **RejectLeaveRequestRequest**: `rejection_reason` required max 5000.

### 1.5 Resources (response shape)

- [`LeaveTypeResource.php`](app/Http/Resources/LeaveTypeResource.php) — `id, company_id, name, code, description, allowance_days, is_paid, allows_rollover, max_rollover_days, requires_approval, allow_half_day, max_days_per_request, color, status, created_by, updated_by, created_at, updated_at`.
- [`LeaveRequestResource.php`](app/Http/Resources/LeaveRequestResource.php) — `id, company_id, employee_id, leave_type_id, start_date` (`Y-m-d`), `end_date` (`Y-m-d`), `start_session, end_session, total_days, reason, attachment, attachments` (array), `status, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, admin_notes`, relations `employee` (EmployeeResource), `leave_type` (raw model), `approver`/`rejecter` (UserResource), `created_at, updated_at`.
- [`UserResource.php`](app/Http/Resources/UserResource.php) — serializes `permissions` only on `api.auth.me` / `api.auth.login` / `api.auth.register`; `employee_id` via `whenLoaded('employee')`. [`AuthController::me`](app/Http/Controllers/Api/Auth/AuthController.php:80) loads `['roles', 'employee']` → `/auth/me` returns **both** `permissions` and `employee_id`.

### 1.6 Permissions & policy

[`LeaveRequestPolicy.php`](app/Policies/LeaveRequestPolicy.php:8): `before()` grants super_admin all abilities; `viewAny`/`create` = permission; `view` = permission + `belongsToCompany` + employee-own check (`employee.user_id === user.id`); `approve`/`reject` = permission + `belongsToCompany`. **No `update`/`delete`/`cancel` policy methods exist** (no such routes).

[`RoleAndPermissionSeeder.php`](database/seeders/RoleAndPermissionSeeder.php:47) permissions: `leave_type.view/create/edit/delete`, `leave_request.view/create/approve/reject`. Role grants:
- `super_admin` — all (via policy `before()`)
- `company_admin` — all except `company.create/company.delete/subscription.refund` → has all leave permissions
- `scheduler` — `leave_request.view/approve/reject` (**no `leave_type.*`**)
- `employee` — `leave_request.view/create`
- `admin` / `manager` / `owner` — **never seeded (dead roles)**

**Route/nav gating (web app):** [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:404) places `/leave-types` and `/leave-requests/new` under `['company_admin']`; `/leave-requests` and `/leave-requests/:id` under `['company_admin','scheduler']`. [`nav-items.ts`](resources/js/Components/layout/nav-items.ts:55) shows 'Leave Requests' for `COMPANY_ROLES` (company_admin + scheduler) and 'Leave Types' for `COMPANY_ADMIN_ONLY`. Employees have no web nav (`navigationForRole` returns `[]`) and self-serve leave through the mobile/employee surface backed by the same API (`leave_request.view/create`).

### 1.7 Notification behavior

- **Submitted:** [`LeaveRequestService::notifyAdmins()`](app/Services/LeaveRequestService.php:189) queries `User::whereIn('role', ['admin','manager','owner'])` → **dead roles, never seeded** → the "new leave request submitted" notification is **never sent** (backend bug; see §5, M-04 backend).
- **Status change:** `notifyEmployee()` targets the request owner; [`LeaveRequestStatusNotification`](app/Notifications/LeaveRequestStatusNotification.php) and [`LeaveRequestSubmittedNotification`](app/Notifications/LeaveRequestSubmittedNotification.php) are `ShouldQueue` and push both DB (via `toArray`) and FCM (via `toFcm`).
- **Frontend invalidation:** `useCreateLeaveRequest` invalidates `['leave-requests']` + `['rosters']`; `useApproveLeaveRequest` / `useRejectLeaveRequest` invalidate `['notifications']` + `['leave-requests']` + `['rosters']` — so approve/reject results appear in the notification bell.

---

## 2. Frontend State After Alignment

### 2.1 Leave Types — data layer (after M-05 fix)

- [`types/leave-type.ts`](resources/js/types/leave-type.ts) — `LeaveType` (id string, companyId, name, code, description, allowanceDays, isPaid, allowsRollover, maxRolloverDays, requiresApproval, allowsHalfDay, maxDaysPerRequest, color, status, createdAt, updatedAt), `LeaveTypeMutationInput` (**now includes `color: string | null`**), `LEAVE_TYPE_STATUSES=['active','inactive']`, new `LEAVE_TYPE_COLOR_OPTIONS` (10 hex, first = `#F59E0B` amber, the backend default) + `DEFAULT_LEAVE_TYPE_COLOR = LEAVE_TYPE_COLOR_OPTIONS[0]`.
- [`hooks/useLeaveTypes.ts`](resources/js/features/leave-types/hooks/useLeaveTypes.ts) — `useLeaveTypes` (server-side search/status filters, perPage 100), `useCreateLeaveType` / `useUpdateLeaveType` / `useDeleteLeaveType` (invalidate `['leave-types']` + `['leave-requests']`). `mapLeaveType` maps all fields incl. `color`. **`toPayload()` now sends `color: values.color`** (previously omitted — M-05).
- [`schemas.ts`](resources/js/features/leave-types/schemas.ts) — `leaveTypeFormSchema` with **new `color` field** (`hexColour` regex `^#([A-Fa-f0-9]{6})$`, nullable), plus superRefine rollover rules. `LeaveTypeFormValues = z.infer<...>`.

### 2.2 Leave Types — UI

- [`LeaveTypeForm.tsx`](resources/js/features/leave-types/components/LeaveTypeForm.tsx) — right slide-over drawer (Radix Dialog, `max-w-xl`). **New "Colour" swatch picker** (Controller-driven buttons with `Check` overlay, mirroring `PositionFormModal`) added to the "Leave type details" section. `createDefaultValues` seeds `color: DEFAULT_LEAVE_TYPE_COLOR`; `toFormValues` seeds `color: leaveType.color ?? DEFAULT_LEAVE_TYPE_COLOR`. `useForm` now destructures `control`.
- [`LeaveTypesTable.tsx`](resources/js/features/leave-types/components/LeaveTypesTable.tsx) — reusable `DataTable` (search/sort/pagination/column visibility) + `LeaveTypeActions` dropdown (Edit / Delete with AlertDialog confirm) + `RolloverRule` chip.
- [`LeaveTypeStatusBadge.tsx`](resources/js/features/leave-types/components/LeaveTypeStatusBadge.tsx) — active:success, inactive:neutral.
- [`LeaveTypesPage.tsx`](resources/js/features/leave-types/pages/LeaveTypesPage.tsx) — 4 `StatCard`s (Total / Available / Paid / Rollover Enabled), status filter toolbar, error state with refetch, form modal wiring (create + edit), delete confirm.

### 2.3 Leave Requests — data layer (after M-04 fix)

- [`types/leave-request.ts`](resources/js/types/leave-request.ts) — `LeaveRequest` (id, companyId, employeeId, leaveTypeId, startDate/endDate, startSession/endSession, totalDays, reason, attachment, attachments, status, approvedBy/at, rejectedBy/at, rejectionReason, adminNotes, employee?, leaveType?, approver?, rejecter?, createdAt, updatedAt), `LeaveRequestStatus` (pending/approved/rejected/cancelled), `LeaveSession` (full_day/first_half/second_half), `CreateLeaveRequestInput`, `ApproveLeaveRequestInput`, `RejectLeaveRequestInput`, `LeaveBalance`.
- [`hooks/useLeaveRequests.ts`](resources/js/features/leave-requests/hooks/useLeaveRequests.ts) — DTOs matching `LeaveRequestResource`; `mapLeaveRequest` normalizes status/session, parses dates; `toFormData` builds multipart with `employee_id, leave_type_id, start_date, end_date, start_session, end_session, reason, attachments[]` (no `company_id` — server sets it); `fetchLeaveRequests` passes `status/employee_id/leave_type_id/date_from/date_to/per_page`; `useCurrentLeaveUser` calls `GET /auth/me`; `useCreate/Approve/RejectLeaveRequest` with cache invalidation (see §1.7). **`canReviewLeaveRequests()` now checks `leave_request.approve`/`leave_request.reject` + `super_admin` fallback** (previously `leave.approve`/`leave.reject` + dead roles — M-04).
- [`schemas.ts`](resources/js/features/leave-requests/schemas.ts) — `employeeId`, `leaveTypeId`, `startDate`/`endDate` (required date strings, superRefine end ≥ start, one-day session consistency), `startSession`/`endSession` enums, `reason` optional, `attachments` (superRefine: max 5 files, max 5MB each, `application/pdf|image/jpeg|image/png|...`).
- [`lib/leave-request-utils.ts`](resources/js/features/leave-requests/lib/leave-request-utils.ts) — `calculateRequestedDays` (matches backend `calculateTotalDays` incl. half-day 0.5 deductions), `formatLeaveDateRange`, `formatLeaveDuration`, `toAttachmentUrl` (`/storage/` prefix), `toApprovedLeaveCalendarEvents` (for approved-request calendar display).

### 2.4 Leave Requests — UI

- [`LeaveRequestForm.tsx`](resources/js/features/leave-requests/components/LeaveRequestForm.tsx) — create/edit request form: employee select (hidden for non-managers via `canManageRequests`), active leave types (filtered by `status === 'active'`), date + session selects, live `deriveLeaveBalance` summary, "would exceed allowance" guard, reason textarea, attachment upload with per-file remove and size/type enforcement.
- [`ApproveRejectButtons.tsx`](resources/js/features/leave-requests/components/ApproveRejectButtons.tsx) — approve dialog (optional `admin_notes`, max 1000) and reject dialog (required `rejection_reason`); only rendered when `status === 'pending'`.
- [`LeaveRequestCard.tsx`](resources/js/features/leave-requests/components/LeaveRequestCard.tsx) — status classes for all 4 statuses (incl. `cancelled`), attachment count, rejection reason + approval callout.
- [`LeaveRequestDetailPage.tsx`](resources/js/features/leave-requests/pages/LeaveRequestDetailPage.tsx) — detail view: employee + leave type relationships, attachments list with `/storage/` URLs, decision section (approver/rejecter + decision time + admin notes / rejection reason), `cancelled` state handled, `ApproveRejectButtons` when pending and `canReviewLeaveRequests`.
- [`LeaveRequestNewPage.tsx`](resources/js/features/leave-requests/pages/LeaveRequestNewPage.tsx) — create page: `useCurrentLeaveUser` → `currentEmployeeId` for employee self-service; renders `LeaveRequestForm`.
- [`LeaveRequestsListPage.tsx`](resources/js/features/leave-requests/pages/LeaveRequestsListPage.tsx) — 4 `StatCard`s (Total / Pending / Approved / Rejected), status filter (incl. `cancelled`) + employee filter (manager-only), `LeaveRequestCard` list, `canReviewLeaveRequests` gating for inline approve/reject.

---

## 3. Fixes Applied This Task

### 3.1 M-05 — Leave-type `color` missing from the mutation path

- **Where:** [`types/leave-type.ts`](resources/js/types/leave-type.ts:66) `LeaveTypeMutationInput`, [`schemas.ts`](resources/js/features/leave-types/schemas.ts:6) `leaveTypeFormSchema`, [`LeaveTypeForm.tsx`](resources/js/features/leave-types/components/LeaveTypeForm.tsx:33) `createDefaultValues`/`toFormValues` + no colour UI, [`useLeaveTypes.ts`](resources/js/features/leave-types/hooks/useLeaveTypes.ts:85) `toPayload`.
- **Truth:** Backend accepts/returns `color` (nullable, regex hex, default `#F59E0B`) and the read path (`LeaveType` interface, `LeaveTypeDto`, `mapLeaveType`) already handled it.
- **Fix:** Added `color: string | null` to `LeaveTypeMutationInput`; added `color` to the schema (`hexColour` regex, nullable); added `LEAVE_TYPE_COLOR_OPTIONS` (first = `#F59E0B` amber, the backend default) + `DEFAULT_LEAVE_TYPE_COLOR`; seeded `color` in `createDefaultValues`/`toFormValues`; added a Controller-based swatch picker to the form's "Leave type details" section; added `color: values.color` to `toPayload()`.
- **Impact resolved:** Leave types can now be colour-coded from the UI, and the colour chosen on the backend round-trips through create/edit.

### 3.2 M-04 (frontend) — `canReviewLeaveRequests` wrong permission names + dead roles

- **Where:** [`useLeaveRequests.ts`](resources/js/features/leave-requests/hooks/useLeaveRequests.ts:282).
- **Truth:** Backend permissions are `leave_request.approve` / `leave_request.reject` ([`RoleAndPermissionSeeder.php`](database/seeders/RoleAndPermissionSeeder.php:47)); roles `admin`/`manager`/`owner` are never seeded; the correct `super_admin` fallback is via policy `before()`.
- **Fix:** Now checks `user?.permissions?.includes('leave_request.approve') || user?.permissions?.includes('leave_request.reject') || user?.role === 'super_admin'`. Dropped the wrong `leave.approve`/`leave.reject` names and the dead `admin`/`manager`/`owner` fallbacks.
- **Impact resolved:** `company_admin` and `scheduler` (both granted `leave_request.approve/reject`) can now review and decide leave requests; employees (only `leave_request.view/create`) cannot.

### 3.3 Cancel — backend gap, documented (no code change)

The audit item "cancel" resolves to a **backend gap**: `cancelled` is a valid `leave_requests.status` value, but there is **no cancel route/endpoint and no `cancel` policy method**, and the frontend has **no cancel button** (it only shows Approve/Reject for pending). Per frontend-alignment scope (and the Request 9 precedent of not modifying the backend), **no frontend change was made** — a cancel capability would require a backend endpoint first.

### 3.4 M-04 (backend) — `notifyAdmins` dead roles, documented (no code change)

[`LeaveRequestService::notifyAdmins()`](app/Services/LeaveRequestService.php:189) queries `User::whereIn('role', ['admin','manager','owner'])` — none of these roles are seeded, so the "new leave request submitted" notification never fires. Per frontend-alignment scope (no backend modifications), this is **documented here and in [`system-map.md`](docs/frontend-alignment/system-map.md:459)** with a recommended fix (target the `leave_request.approve` permission or seeded `company_admin`/`scheduler` roles). The frontend side of M-04 (the wrong permission names in `canReviewLeaveRequests`) **was** fixed (§3.2).

---

## 4. Field-by-field alignment (backend → frontend)

### 4.1 Leave Types

| Backend | Frontend | State |
|---|---|---|
| `name` (required, max 255) | `name` in schema (required, max 255) | ✅ Aligned |
| `code` (nullable, max 50) | `code` (nullable, max 50) | ✅ Aligned |
| `description` (nullable, max 1000) | `description` (nullable, max 1000) | ✅ Aligned |
| `allowance_days` (decimal 0–365, nullable) | `allowanceDays` (number 0–365, nullable) | ✅ Aligned |
| `is_paid` (bool) | `isPaid` `z.boolean()` toggle | ✅ Aligned |
| `allows_rollover` (bool) | `allowsRollover` toggle + superRefine | ✅ Aligned |
| `max_rollover_days` (int, nullable) | `maxRolloverDays` (number 0–365, nullable, superRefine rules) | ✅ Aligned |
| `requires_approval` (bool) | `requiresApproval` toggle | ✅ Aligned |
| `allow_half_day` (bool) | `allowsHalfDay` toggle | ✅ Aligned |
| `max_days_per_request` (int, nullable) | `maxDaysPerRequest` (int 1–365, nullable) | ✅ Aligned |
| `color` (hex 7, nullable, default `#F59E0B`) | **`color` added** — regex hex, swatch picker, sent in `toPayload()` | ✅ Aligned (**fixed M-05**) |
| `status` (`active`/`inactive`) | `status` enum `LEAVE_TYPE_STATUSES` | ✅ Aligned |
| `company_id` (required FK) | server-side only; scoped by backend | ✅ Aligned (not editable) |
| `created_by` / `updated_by` | server-side only | ✅ Aligned (not editable) |

### 4.2 Leave Requests

| Backend | Frontend | State |
|---|---|---|
| `employee_id` (required FK) | `employeeId` (required, real employee list) | ✅ Aligned |
| `leave_type_id` (required FK) | `leaveTypeId` (required, active types only) | ✅ Aligned |
| `start_date` / `end_date` (`Y-m-d`) | `startDate`/`endDate` (date strings, superRefine end ≥ start) | ✅ Aligned |
| `start_session` / `end_session` | `startSession`/`endSession` enums + one-day rule | ✅ Aligned |
| `total_days` (decimal, computed server-side) | derived client-side for display via `calculateRequestedDays` | ✅ Aligned (never sent) |
| `reason` (text, nullable) | `reason` (optional) | ✅ Aligned |
| `attachment` (string, legacy) | read-only; `toAttachmentUrl` | ✅ Aligned |
| `attachments` (json array) | `attachments[]` multipart (max 5 files, 5MB, pdf/jpg/png/doc/docx) | ✅ Aligned |
| `status` (`pending/approved/rejected/cancelled`) | 4-value `LeaveRequestStatus` + all status classes | ✅ Aligned |
| `approved_by` / `approved_at` | `approvedBy`/`approvedAt` in decision section | ✅ Aligned |
| `rejected_by` / `rejected_at` | `rejectedBy`/`rejectedAt` in decision section | ✅ Aligned |
| `rejection_reason` (required on reject) | required in reject dialog (max 5000) | ✅ Aligned |
| `admin_notes` (nullable on approve) | optional in approve dialog (max 1000) | ✅ Aligned |
| `company_id` (required FK) | server-side only | ✅ Aligned (not editable) |
| `created_by` / `updated_by` | server-side only | ✅ Aligned (not editable) |
| *(no cancel route)* | no cancel button | ⚠️ Backend gap (§3.3) — no frontend change |

### 4.3 Relationship & auth correctness

- **Employee relationship:** form uses the real `useEmployees` list (`Employee.name/position/status`); detail page renders `request.employee` via `LeaveRequestResource`; employee self-service derives `currentEmployeeId` from `/auth/me` `employee_id`.
- **Leave type relationship:** form filters `activeLeaveTypes`; detail page renders `request.leaveType` (raw model returned by the resource — `leaveType.name` correct per system-map).
- **Approval/rejection fields:** approve sends `admin_notes`; reject sends required `rejection_reason`; detail shows approver/rejecter + decision time + notes/reason; buttons only for `pending`.
- **Role-specific behavior:** `canReviewLeaveRequests` gates approve/reject UI (now via correct permissions); employee role self-service is server-enforced (controller forces `employee_id`); web nav/routes gate Leave Requests (company_admin + scheduler) and Leave Types (company_admin only).

---

## 5. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Exit 0 |
| `npx vite build` | ✅ Exit 0 (3859 modules, built in ~42s; only pre-existing chunk-size warning) |
| `php.exe vendor/bin/phpunit --filter "Leave" --colors=never` | ✅ 16 tests, 39 assertions, OK |

---

## 6. References

- `.roo/ui-ux.md` — architectural reference (not ultimate source of truth)
- `docs/frontend-alignment/system-map.md` — M-04 (lines 258, 459, 513), M-05 (lines 466, 516), stale leave-request routes (line 251)
- `docs/task-14-15-shifts-leave-audit.md` — feature audit
- Backend: [`2026_07_27_000012_create_leave_types_table.php`](database/migrations/2026_07_27_000012_create_leave_types_table.php), [`2026_07_27_000013_create_leave_requests_table.php`](database/migrations/2026_07_27_000013_create_leave_requests_table.php), [`2026_08_17_000002_add_entitlement_rules_to_leave_types_table.php`](database/migrations/2026_08_17_000002_add_entitlement_rules_to_leave_types_table.php), [`2026_08_17_000003_add_attachments_to_leave_requests_table.php`](database/migrations/2026_08_17_000003_add_attachments_to_leave_requests_table.php), [`LeaveType.php`](app/Models/LeaveType.php), [`LeaveRequest.php`](app/Models/LeaveRequest.php), [`LeaveTypeController.php`](app/Http/Controllers/Api/LeaveTypeController.php), [`LeaveRequestController.php`](app/Http/Controllers/Api/LeaveRequestController.php), [`LeaveTypeService.php`](app/Services/LeaveTypeService.php), [`LeaveRequestService.php`](app/Services/LeaveRequestService.php), [`StoreLeaveTypeRequest.php`](app/Http/Requests/LeaveType/StoreLeaveTypeRequest.php), [`UpdateLeaveTypeRequest.php`](app/Http/Requests/LeaveType/UpdateLeaveTypeRequest.php), [`StoreLeaveRequestRequest.php`](app/Http/Requests/Leave/StoreLeaveRequestRequest.php), [`ApproveLeaveRequestRequest.php`](app/Http/Requests/Leave/ApproveLeaveRequestRequest.php), [`RejectLeaveRequestRequest.php`](app/Http/Requests/Leave/RejectLeaveRequestRequest.php), [`LeaveTypeResource.php`](app/Http/Resources/LeaveTypeResource.php), [`LeaveRequestResource.php`](app/Http/Resources/LeaveRequestResource.php), [`UserResource.php`](app/Http/Resources/UserResource.php), [`LeaveRequestPolicy.php`](app/Policies/LeaveRequestPolicy.php), [`RoleAndPermissionSeeder.php`](database/seeders/RoleAndPermissionSeeder.php:47), [`LeaveRequestStatusNotification.php`](app/Notifications/LeaveRequestStatusNotification.php), [`LeaveRequestSubmittedNotification.php`](app/Notifications/LeaveRequestSubmittedNotification.php), [`routes/api.php`](routes/api.php), [`AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:80)
- Frontend: [`useLeaveTypes.ts`](resources/js/features/leave-types/hooks/useLeaveTypes.ts), [`useLeaveRequests.ts`](resources/js/features/leave-requests/hooks/useLeaveRequests.ts), [`leave-type.ts`](resources/js/types/leave-type.ts), [`leave-request.ts`](resources/js/types/leave-request.ts), [`schemas.ts`](resources/js/features/leave-types/schemas.ts), [`schemas.ts`](resources/js/features/leave-requests/schemas.ts), [`leave-request-utils.ts`](resources/js/features/leave-requests/lib/leave-request-utils.ts), [`LeaveTypeForm.tsx`](resources/js/features/leave-types/components/LeaveTypeForm.tsx), [`LeaveTypesTable.tsx`](resources/js/features/leave-types/components/LeaveTypesTable.tsx), [`LeaveTypeStatusBadge.tsx`](resources/js/features/leave-types/components/LeaveTypeStatusBadge.tsx), [`LeaveTypesPage.tsx`](resources/js/features/leave-types/pages/LeaveTypesPage.tsx), [`LeaveRequestForm.tsx`](resources/js/features/leave-requests/components/LeaveRequestForm.tsx), [`ApproveRejectButtons.tsx`](resources/js/features/leave-requests/components/ApproveRejectButtons.tsx), [`LeaveRequestCard.tsx`](resources/js/features/leave-requests/components/LeaveRequestCard.tsx), [`LeaveRequestDetailPage.tsx`](resources/js/features/leave-requests/pages/LeaveRequestDetailPage.tsx), [`LeaveRequestNewPage.tsx`](resources/js/features/leave-requests/pages/LeaveRequestNewPage.tsx), [`LeaveRequestsListPage.tsx`](resources/js/features/leave-requests/pages/LeaveRequestsListPage.tsx), [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:404), [`nav-items.ts`](resources/js/Components/layout/nav-items.ts:55), [`useAuth.ts`](resources/js/features/auth/hooks/useAuth.ts:34), [`useEmployees.ts`](resources/js/features/employees/hooks/useEmployees.ts:425)
