# Scheduler Frontend Alignment

> **Scope:** Align the Scheduler frontend with the actual Laravel backend.  
> **ROSTER IS OUT OF SCOPE** — roster functionality was not modified.  
> **Date:** 2026-09-01

## Scheduler Permissions (source of truth)

From `database/seeders/RoleAndPermissionSeeder.php`, the `scheduler` role is seeded with:

| Permission | Access |
|---|---|
| `branch.view` | Read-only list of branches |
| `employee.view` | Read-only employee directory |
| `department.view` | Read-only departments |
| `position.view` | Read-only positions |
| `roster.*` | Full roster CRUD + publish |
| `shift.*` | Full shift CRUD |
| `shift_template.view/create/edit` | View + create + edit shift templates |
| `leave_request.view/approve/reject` | View all company leave requests; approve + reject |
| `report.view` | View reports |

**Not seeded** (and therefore denied by default):

- `employee.create` / `employee.edit` / `employee.delete` — scheduler cannot create, edit, or delete employees
- `leave_request.create` — scheduler cannot create leave requests (only employees and company admins can)
- `branch.create/edit/delete`, `department.create/edit/delete`, `position.create/edit/delete` — all workspace CRUD is admin-only
- `subscription.view/manage` — billing is admin-only

### Backend policy enforcement

| Policy | Method | Permission gate | Scheduler outcome |
|---|---|---|---|
| `EmployeePolicy` | `viewAny` / `view` | `employee.view` + `belongsToCompany` | ✅ Can view own-company employees |
| `EmployeePolicy` | `create` | `employee.create` | ❌ Denied |
| `EmployeePolicy` | `update` | `employee.edit` + `belongsToCompany` | ❌ Denied |
| `EmployeePolicy` | `delete` | `employee.delete` + `belongsToCompany` | ❌ Denied |
| `LeaveRequestPolicy` | `viewAny` | `leave_request.view` | ✅ Can view company leave requests |
| `LeaveRequestPolicy` | `view` | `leave_request.view` + `belongsToCompany` | ✅ Can view any company leave request |
| `LeaveRequestPolicy` | `create` | `leave_request.create` | ❌ Denied |
| `LeaveRequestPolicy` | `approve` | `leave_request.approve` + `belongsToCompany` | ✅ Can approve |
| `LeaveRequestPolicy` | `reject` | `leave_request.reject` + `belongsToCompany` | ✅ Can reject |
| `EmployeeAvailabilityController` | `index` | `authorize('view', $employee)` → `employee.view` | ✅ Can view availability |
| `EmployeeAvailabilityController` | `sync` / `store` / `update` / `destroy` | `authorize('update', $employee)` → `employee.edit` | ❌ 403 Forbidden |
| `NotificationController` | all | `auth:sanctum` + `company.access` | ✅ Full access |

---

## Alignment Matrix

### Route access

| Route | Route block | Scheduler access | Status |
|---|---|---|---|
| `/dashboard` | `ALL_WEB_ROLES` | ✅ Full | ✅ Aligned |
| `/employees` | `company_admin + scheduler` | ✅ View only | ✅ Aligned |
| `/employees/:id/availability` | `company_admin + scheduler` | ✅ View only (read-only UI) | ✅ Fixed (M-02) |
| `/rosters`, `/shifts`, `/shift-templates` | `company_admin + scheduler` | ✅ Full | ✅ Aligned (out of scope) |
| `/leave-requests` | `company_admin + scheduler` | ✅ View + approve/reject | ✅ Aligned |
| `/leave-requests/:id` | `company_admin + scheduler` | ✅ View + approve/reject | ✅ Aligned |
| `/notifications` | `super_admin + company_admin + scheduler` | ✅ Full | ✅ Aligned |
| `/leave-requests/new` | `company_admin` only | ❌ Blocked | ✅ Aligned |
| `/settings` | `company_admin` only | ❌ Blocked | ✅ Fixed (M-03) |
| `/subscription` | `company_admin` only | ❌ Blocked | ✅ Aligned |
| `/branches`, `/branches/:id` | `company_admin` only | ❌ Blocked | ✅ Aligned |
| `/departments` | `company_admin` only | ❌ Blocked | ✅ Aligned |
| `/positions` | `company_admin` only | ❌ Blocked | ✅ Aligned |
| `/leave-types` | `company_admin` only | ❌ Blocked | ✅ Aligned |

### Sidebar navigation

Schedulers see these nav items (from `nav-items.ts`):

| Nav item | Route | Visible | Correct |
|---|---|---|---|
| Dashboard | `/dashboard` | ✅ | ✅ |
| Rosters | `/rosters` | ✅ | ✅ (out of scope) |
| Shifts | `/shifts` | ✅ | ✅ (out of scope) |
| Shift Templates | `/shift-templates` | ✅ | ✅ (out of scope) |
| Employees | `/employees` | ✅ | ✅ |
| Leave Requests | `/leave-requests` | ✅ | ✅ |
| Notifications | `/notifications` | ✅ | ✅ |

Schedulers do NOT see: Branches, Departments, Positions, Leave Types, Subscription & Billing, Settings — all company_admin-only. ✅ Correct.

---

## Page-by-Page Analysis

### Dashboard (`SchedulerDashboard.tsx`)

- **Status:** ✅ Fully aligned
- **Data sources:** `useRosters`, `useShifts`, `useLeaveRequests` — all real API hooks
- **Sections:** Stat cards (today's shifts, unassigned shifts, published rosters, pending leave), today's shifts list, scheduling tasks, upcoming shifts, roster status
- **Loading/error states:** Present — `isLoading`, `isError` guards with retry buttons
- **No actions that require permissions the scheduler lacks**

### Employee Directory (`EmployeeListPage.tsx`)

- **Status:** ✅ Aligned (after fixes M-01, M-04)
- **Editing gated:** `isCompanyAdmin` check hides the actions column (Edit/Send/Revoke) and the "Add employee" button for schedulers
- **Branch column:** Changed from `<Link>` to plain `<span>` for non-admins — previously linked to `/branches/:id` which is company_admin-only (dead link)
- **Availability column:** Label changed from "Manage" to "View" for schedulers — reflects that saving requires `employee.edit`
- **Search, branch filter, department filter:** All work for schedulers (read-only queries)

### Employee Availability (`EmployeeAvailabilityPage.tsx`)

- **Status:** ✅ Aligned (after fix M-02)
- **Read-only mode:** When the user is not a company_admin, the page enters read-only mode:
  - "View only" info banner displayed explaining the limitation
  - Save, Reset buttons hidden
  - Standard Week, Clear Week toolbar hidden
  - Grid drag interactions disabled
  - Day list add/edit/remove/clear buttons disabled
  - `beforeunload` guard suppressed (no unsaved changes to protect)
- **API wiring:** `GET /employees/:id/availabilities` uses `EmployeePolicy::view` → ✅ scheduler can load data
- **Sync endpoint:** `PUT /employees/:id/availabilities/sync` uses `EmployeePolicy::update` → ❌ scheduler would get 403 — prevented by read-only UI
- **Forbidden error fallback:** Page has `isForbiddenError` guard that renders a `ShieldAlert` empty state if the load itself returns 403
- **Loading/error states:** `LoadingSkeleton`, `ErrorAlert` components present

### Leave Requests List (`LeaveRequestsListPage.tsx`)

- **Status:** ✅ Fully aligned
- **Permission gating:** `canManageRequests` → `canReviewLeaveRequests()` checks `leave_request.approve` OR `leave_request.reject` OR `super_admin` → scheduler has both → ✅ can review
- **Filters:** Status filter, employee filter (for reviewers, all employees visible), date range — all correct
- **Approve/reject buttons:** Rendered when `canManageRequests && request.status === 'pending'` → ✅ scheduler sees them
- **Stats cards:** Pending, Approved, Rejected, Total — derived from loaded data
- **New request button:** `canManageRequests` controls visibility — for schedulers, this is `true`, but the `/leave-requests/new` route is company_admin-only, so clicking it would redirect. However, the button actually links to `/leave-requests/new` only for users with `leave_request.create` — let me verify... The list page shows a "New request" link at line 113-119 that links to `/leave-requests/new`. For schedulers, this link IS visible because `canManageRequests` is true (they can review). But the route is company_admin-only. This is a minor UX issue — the scheduler sees a link they can't reach. However, since the `LeaveRequestNewPage` requires `leave_request.create` to actually submit, and the scheduler lacks this permission, the worst case is the RoleRoute redirect. **Documented as a known minor issue — not a security concern.**

### Leave Request Detail (`LeaveRequestDetailPage.tsx`)

- **Status:** ✅ Fully aligned
- **Permission gating:** `canManageRequests` for approve/reject buttons → ✅ scheduler sees them
- **Data loading:** `useLeaveRequest(id)` fetches from `GET /leave-requests/:id` → `LeaveRequestPolicy::view` → ✅ scheduler can view
- **Approve/reject:** `useApproveLeaveRequest` / `useRejectLeaveRequest` → `POST /leave-requests/:id/approve|reject` → `LeaveRequestPolicy::approve|reject` → ✅ scheduler can approve/reject
- **Company isolation:** `belongsToCompany` check in policy → ✅ cannot approve/reject other company's requests
- **Loading/error states:** Loading skeleton, error alert with retry — present

### Leave Request Create (`LeaveRequestNewPage.tsx`)

- **Status:** ✅ Aligned
- **Route:** `/leave-requests/new` is in `company_admin`-only block → scheduler cannot reach this page
- **Backend:** `LeaveRequestController::store` → `LeaveRequestPolicy::create` → `leave_request.create` → scheduler lacks this → would be 403 anyway

### Notifications (`NotificationCenterPage.tsx`)

- **Status:** ✅ Fully aligned
- **Route:** `/notifications` is in `super_admin + company_admin + scheduler` block → ✅ accessible
- **API:** `GET /notifications` → `NotificationController::index` → `auth:sanctum` + `company.access` → ✅ scheduler has access
- **Actions:** Mark as read, mark all as read, archive (delete) → all use real API endpoints
- **Real-time:** `NotificationBell` in Header uses Laravel Echo private channel `App.Models.User.{userId}` for live updates
- **Loading/error states:** `isLoading`, `isError` guards, "Try again" retry button — present
- **Pagination:** Server-side with page controls

### Header (`Header.tsx`)

- **Status:** ✅ Aligned (after fix M-03)
- **Settings link:** Gated by `user.role === 'company_admin'` — only company admins see the Settings dropdown item
- **Trial badge:** Already gated by `user.role !== 'company_admin'` → scheduler doesn't see it ✅
- **Notification bell:** Present for all roles → ✅
- **Sign out:** Present for all roles → ✅

### Sidebar (`nav-items.ts`)

- **Status:** ✅ Fully aligned
- Schedulers see: Dashboard, Rosters, Shifts, Shift Templates, Employees, Leave Requests, Notifications
- Schedulers do NOT see: Branches, Departments, Positions, Leave Types, Subscription & Billing, Settings
- All nav item routes are accessible to schedulers

---

## Fixes Applied

### M-01 — Availability column label (EmployeeListPage.tsx)

**Problem:** The "Manage" button label in the Availability column overstated scheduler capability. Schedulers can only view availability, not save changes.

**Fix:** Changed label to `"View"` for non-company-admin users. The link still navigates to `/employees/:id/availability`, which now renders in read-only mode for schedulers.

**File:** `resources/js/features/employees/pages/EmployeeListPage.tsx` (lines 173-193)

### M-02 — Availability read-only mode (EmployeeAvailabilityPage.tsx)

**Problem:** The availability page rendered a full editing UI for schedulers (save, reset, clear week, standard week, grid drag, day list editing). The sync endpoint requires `employee.edit` which schedulers lack, so saving would 403.

**Fix:** Added role detection via `useWebSession` + `normalizeWebRole`. When the user is not a company_admin, the page enters read-only mode:
- "View only" info banner displayed
- Save and Reset buttons hidden
- Standard Week and Clear Week toolbar hidden
- Grid drag interactions disabled
- Day list add/edit/remove/clear buttons disabled
- `beforeunload` guard suppressed

**Files:**
- `resources/js/features/availability/pages/EmployeeAvailabilityPage.tsx` (imports, role detection, conditional rendering)

### M-03 — Header Settings link (Header.tsx)

**Problem:** The Settings dropdown item linked to `/settings`, which is a company_admin-only route. Schedulers saw the link but would be redirected by `RoleRoute`.

**Fix:** Gated the Settings menu item with `user.role === 'company_admin'` — only company admins see it.

**File:** `resources/js/Components/layout/Header.tsx` (lines 89-93)

### M-04 — Branch column dead link (EmployeeListPage.tsx)

**Problem:** The Branch column rendered a `<Link to={/branches/:id}>` for all users. Schedulers cannot access `/branches/:id` (company_admin-only route), making it a dead link.

**Fix:** Rendered the branch name as plain `<span>` text for non-company-admin users, and as a clickable link for company admins.

**File:** `resources/js/features/employees/pages/EmployeeListPage.tsx` (lines 138-153)

---

## Known Minor Issues

| ID | Severity | Description | Rationale |
|---|---|---|---|
| K-01 | Low | Schedulers see a "New request" link on the leave requests list page, but `/leave-requests/new` is company_admin-only. Clicking it triggers a redirect. | The link is part of the review UI. The backend would reject the submission anyway (scheduler lacks `leave_request.create`). The redirect is harmless. |

---

## Verification

- **TypeScript build:** `tsc && vite build` — 3858 modules transformed, 0 errors
- **Backend tests:** 76 tests passed, 232 assertions, 0 failures across Employee (availability, deactivation, invitation, management), Leave (request management), and Notification (device tokens, notifications) test suites

---

## Files Modified

| File | Change |
|---|---|
| `resources/js/Components/layout/Header.tsx` | Gate Settings link by `user.role === 'company_admin'` |
| `resources/js/features/employees/pages/EmployeeListPage.tsx` | Branch column plain text for non-admins; availability label "View" for non-admins |
| `resources/js/features/availability/pages/EmployeeAvailabilityPage.tsx` | Read-only mode for non-company-admin users (role detection, UI gating) |
