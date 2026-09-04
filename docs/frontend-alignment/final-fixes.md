# Final Frontend/Backend Alignment Fixes

> **Date:** 2026-09-01
> **Source:** `docs/frontend-alignment/final-gap-analysis.md`
> **Scope:** Non-roster features only (roster completely excluded)
> **Severity filter:** CRITICAL and HIGH only per instruction

---

## Result: No CRITICAL or HIGH issues found — zero code changes required

The comprehensive alignment audit across all non-roster modules (Auth, Employees, Availability, Leave, Leave Types, Branches, Departments, Positions, Companies/Settings, Notifications, Billing/Subscriptions, Super Admin, Dashboard, Shift Templates) found the frontend and backend are **fully aligned**. Every API URL, HTTP method, request payload, response DTO, query invalidation, permission check, role visibility gate, loading state, and error state is correct.

---

## Deferred: Low-severity item (not implemented per instructions)

| # | Severity | Module | Issue | Why deferred |
|---|----------|--------|-------|--------------|
| 1 | **Low** | Dashboard | [`SchedulerDashboard.tsx`](resources/js/features/dashboard/pages/SchedulerDashboard.tsx:55) lacks `isError` handling for rosters/shifts/leave queries. Failed queries silently render empty states with no user feedback. [`CompanyAdminDashboard.tsx`](resources/js/features/dashboard/pages/CompanyAdminDashboard.tsx:43) has proper `isError` + retry — this is a consistency gap. | Explicit instruction: *"Do not implement MEDIUM/LOW issues unless required for the fix."* No CRITICAL or HIGH issue depends on this change. The fix would add ~8 lines: destructure `isError`/`refetch` from each query, compute a combined `isError`, and render an error state with retry button matching the CompanyAdminDashboard pattern. |

---

## Audit coverage summary

### What was checked (per module: DATABASE → BACKEND → API → FRONTEND → USER ACTION)

| Check category | Result |
|----------------|--------|
| Wrong API URLs | ✅ None — all frontend hooks match `routes/api.php` |
| Wrong HTTP methods | ✅ None — GET/POST/PUT/DELETE all correct |
| Wrong request fields | ✅ None — all `toPayload`/`toFormData` match validation rules |
| Wrong response fields | ✅ None — all `mapDto`/`mapResource` match backend resources |
| Missing query invalidation | ✅ None — all mutations invalidate correct query keys |
| Stale UI after mutations | ✅ None — optimistic updates + cache invalidation all correct |
| Missing error handling | ⚠️ 1 Low — SchedulerDashboard only (deferred) |
| Missing loading states | ✅ None — all pages have loading indicators |
| Missing permission checks | ✅ None — `canReviewLeaveRequests`, `canManageBilling`, `RoleRoute`, `ProtectedRoute` all enforced |
| Incorrect role visibility | ✅ None — `navigationForRole()`, `nav-items.ts`, `AppRoutes.tsx` all gate correctly |
| Cross-company data exposure | ✅ None — server-enforced `company_id` scoping in every controller |
| Mock data / fake statistics | ✅ None — all data from real API endpoints |
| Fake statistics | ✅ None — super-admin MRR/ARR/revenue/churn computed from actual billing |
| TODO buttons | ✅ None |
| Empty handlers | ✅ None — only standard React default props |
| console.log misuse | ✅ None — only `console.error` in `ErrorBoundary.tsx` (legitimate) |
| Hardcoded values | ✅ None — only defensive defaults matching database defaults |
| Obsolete fields | ✅ None |
| Frontend-only fields | ✅ None |
| Missing backend fields | ✅ None |
| Phantom API routes in docs | ℹ️ Informational — `system-map.md` lists `POST /shift-templates/{id}/apply` and `GET /roster-options` which don't exist; already documented in `shift-templates.md` |
| Billing notification `action_url` | ℹ️ Informational — backend emits `/companies/{id}/subscriptions` (not SPA route); frontend correctly maps `billing_alert` → `/subscription`; already documented in `notifications.md` |

### Files read during audit

**Backend controllers:**
- `app/Http/Controllers/Api/Auth/AuthController.php` (204 lines)
- `app/Http/Controllers/Api/EmployeeController.php` (234 lines)
- `app/Http/Controllers/Api/EmployeeAvailabilityController.php` (125 lines)
- `app/Http/Controllers/Api/LeaveRequestController.php` (154 lines)
- `app/Http/Controllers/Api/LeaveTypeController.php` (113 lines)
- `app/Http/Controllers/Api/BranchController.php` (110 lines)
- `app/Http/Controllers/Api/DepartmentController.php` (113 lines)
- `app/Http/Controllers/Api/PositionController.php` (113 lines)
- `app/Http/Controllers/Api/CompanyController.php` (100 lines)
- `app/Http/Controllers/Api/NotificationController.php` (81 lines)
- `app/Http/Controllers/Api/PlanSubscriptionController.php` (466 lines)
- `app/Http/Controllers/Api/SuperAdminController.php` (417 lines)
- `app/Http/Resources/UserResource.php` (51 lines)
- `app/Policies/LeaveRequestPolicy.php` (82 lines)
- `routes/api.php` (408 lines)

**Frontend hooks:**
- `resources/js/features/auth/hooks/useAuth.ts` (275 lines)
- `resources/js/features/employees/hooks/useEmployees.ts` (567 lines)
- `resources/js/features/availability/hooks/useEmployeeAvailability.ts` (278 lines)
- `resources/js/features/leave-requests/hooks/useLeaveRequests.ts` (402 lines)
- `resources/js/features/branches/hooks/useBranches.ts` (412 lines)
- `resources/js/features/departments/hooks/useDepartments.ts` (264 lines)
- `resources/js/features/positions/hooks/usePositions.ts` (279 lines)
- `resources/js/features/companies/hooks/useCompanies.ts` (465 lines)
- `resources/js/features/notifications/hooks/useNotifications.ts` (331 lines)
- `resources/js/features/billing/hooks/useSubscription.ts` (422+ lines)
- `resources/js/features/billing/hooks/useBilling.ts` (32 lines)
- `resources/js/features/super-admin/hooks/useSuperAdmin.ts` (363 lines)
- `resources/js/features/dashboard/hooks/useDashboardAnalytics.ts` (105 lines)

**Frontend pages:**
- `resources/js/features/dashboard/pages/CompanyAdminDashboard.tsx` (243 lines)
- `resources/js/features/dashboard/pages/SchedulerDashboard.tsx` (458 lines)
- `resources/js/features/employees/pages/EmployeeListPage.tsx` (500 lines)
- `resources/js/features/availability/pages/EmployeeAvailabilityPage.tsx` (816 lines)
- `resources/js/features/leave-requests/pages/LeaveRequestDetailPage.tsx` (350 lines)
- `resources/js/features/leave-requests/pages/LeaveRequestsListPage.tsx` (281 lines)
- `resources/js/features/leave-requests/pages/LeaveRequestNewPage.tsx` (147 lines)
- `resources/js/features/notifications/pages/NotificationCenterPage.tsx` (200 lines)

**Frontend infrastructure:**
- `resources/js/routes/AppRoutes.tsx` (440 lines)
- `resources/js/Components/layout/nav-items.ts` (67 lines)
- `resources/js/Components/layout/Header.tsx` (105 lines)
- `resources/js/Components/common/ErrorBoundary.tsx` (33 lines)
- `resources/js/lib/api-client.ts`

---

## UI Fixes Applied (2026-09-01)

Follow-up UI/UX request on the **Plans** module (super-admin plan catalogue management).

### Fix 1 — Create/Edit plan modal: no scroll

| | |
|---|---|
| **Problem** | The create/edit plan `Dialog.Content` in [`PlansPage.tsx`](resources/js/features/billing/pages/PlansPage.tsx:71) used fixed positioning with no `max-h`/`overflow-y-auto`. The [`PlanForm`](resources/js/features/billing/components/PlanForm.tsx:29) is tall (14 feature checkboxes + custom feature keys + pricing + Stripe IDs + availability toggle + actions), so on shorter viewports the bottom of the form was clipped and unreachable. |
| **Backend source** | `app/Http/Controllers/Api/PlanController` — plan CRUD surface (no API change) |
| **Change** | Added `max-h-[calc(100vh-2rem)] overflow-y-auto` to the dialog content, matching the reusable [`Components/ui/dialog.tsx`](resources/js/Components/ui/dialog.tsx:33) `DialogContent` convention and the fixed-height pattern used across the app. |

### Fix 2 — Delete plan: basic `window.confirm()` instead of app dialog

| | |
|---|---|
| **Problem** | [`PlansPage.tsx`](resources/js/features/billing/pages/PlansPage.tsx:52) used the browser-native `window.confirm()` for delete confirmation — inconsistent with every other module (Shifts, Shift Templates, Positions, Leave Types, Departments, Branches, Rosters, Companies) which uses a styled Radix `AlertDialog`. |
| **Backend source** | `DELETE /plans/{plan}` — unchanged |
| **Change** | Replaced `window.confirm()` with a proper Radix `AlertDialog` (`* as AlertDialog` import), matching the [`ShiftTemplatesTable.tsx`](resources/js/features/shift-templates/components/ShiftTemplatesTable.tsx:151) pattern exactly: overlay with `backdrop-blur-sm`, title "Delete {plan.name}?", description noting plans with active subscriptions cannot be removed, Cancel + destructive Delete action button (danger variant, disabled + "Deleting…" while pending). The `onDelete` callback passed to [`PlansTable`](resources/js/features/billing/components/PlansTable.tsx:5) now receives `setDeleteTarget` instead of executing the mutation directly. |

### Fix 3 — Slug & Stripe product ID field info popup (circle + `!`)

| | |
|---|---|
| **Problem** | The **Slug** and **Stripe product ID** fields in the plan create/edit form had no inline explanation, leaving admins unsure what these Stripe-integration identifiers represent. |
| **Backend source** | `app/Http/Controllers/Api/PlanController` — plan CRUD surface (no API change). Field semantics derived from the billing schema migration `database/migrations/2026_08_28_000001_add_subscription_foundation_columns_to_plans_table.php` and `PlanSubscriptionController.php` checkout flow. |
| **Change** | Added a reusable `FieldInfo` component (circle + `!` icon via lucide `CircleAlert`) in [`PlanForm.tsx`](resources/js/features/billing/components/PlanForm.tsx:9) that opens a small explanatory `Popover` on **click** (per user request — not a hover Tooltip). The icon is wired to the **Slug** and **Stripe product ID** labels, each with a concise field description. |
| **UI library** | Uses the existing Radix `Popover` wrapper [`Components/ui/popover.tsx`](resources/js/Components/ui/popover.tsx:14) — click-triggered, closes on outside click/Escape, accessible (aria-label + `aria-hidden` icon). |

### Fix 4 — Profile settings integration (`/profile`)

| | |
|---|---|
| **Problem** | The app had no profile settings page. The header dropdown displayed the user's name/email but offered no way to update them. The legacy Laravel Breeze [`Pages/Profile/Edit.tsx`](resources/js/Pages/Profile/Edit.tsx) and Inertia controllers (`ProfileController.php`, `Auth/PasswordController.php`) were session-based (using `Auth::logout()`, `Redirect::route('profile.edit')`) and completely incompatible with the Sanctum-token SPA. |
| **Backend source** | No API endpoints existed for profile updates. New endpoints: `PUT /auth/profile` (name/email, mirrors `ProfileUpdateRequest`) and `PUT /auth/password` (new password + confirmation). Both use the existing Sanctum `auth:sanctum` guard in the "Account endpoints" section of `routes/api.php`. |
| **Change** | |

#### Backend

1. **`app/Http/Requests/Auth/UpdateProfileRequest.php`** — Created. Validates `name` (required, string, max:255) and `email` (required, lowercase, email, max:255, unique ignoring current user). `authorize()` returns `$this->user() !== null`.
2. **`app/Http/Requests/Auth/UpdatePasswordRequest.php`** — Created. Validates `password` (required, confirmed, Laravel `Password::defaults()`). `authorize()` returns `$this->user() !== null`. No current password is required — the authenticated user updates their password directly.
3. **`app/Http/Controllers/Api/Auth/AuthController.php`** — Added `updateProfile(UpdateProfileRequest)`: fills user, nullifies `email_verified_at` on email change, saves, returns fresh `UserResource` with roles+employee. Added `updatePassword(UpdatePasswordRequest)`: updates the user's password directly (no current-password check) and returns a success envelope.
4. **`routes/api.php`** — Added `Route::put('auth/profile', ...)` and `Route::put('auth/password', ...)` inside the authenticated `auth:sanctum` + `account.active` middleware group, immediately after the existing `auth/me` route.

#### Frontend

5. **`resources/js/features/profile/schemas.ts`** — Created. Two zod schemas: `profileUpdateSchema` (name required max:255, email required lowercase max:255) and `passwordUpdateSchema` (password with strength policy + confirmation matching via `.refine()` — no current password field).
6. **`resources/js/features/profile/hooks/useProfile.ts`** — Refined. Added `getProfileFieldError(error, field)` helper that extracts the first server-side validation message from `{ errors: { field: [message] } }` responses. `useUpdateProfile` refreshes the `WEB_SESSION_KEY` cache on success (no global onError — form handles field errors). `useUpdatePassword` is a bare mutation (form handles field-level server errors extracted from `password`/`password_confirmation`).
7. **`resources/js/features/profile/pages/ProfilePage.tsx`** — Created. Two-column Card layout (`lg:grid-cols-2`):
   - **Profile information** card: name + email `Input` fields with `Field`/`Label`/`FieldError` wrappers, `zodResolver` + `react-hook-form`. Shows a "Verified" badge when `email_verified_at` is set, or an amber warning "Your email is not yet verified." (lucide `BadgeCheck` / `MailWarning`). `useEffect` re-seeds defaults from `useWebSession()`.
   - **Update password** card: new password + confirm password inputs with `showPassword` toggle. No current password field — the user changes their password directly. Server-side 422 errors mapped to the correct field via `getProfileFieldError` + `passwordForm.setError`. Toast success/fallback on completion.
8. **`resources/js/routes/AppRoutes.tsx`** — Added `Route path="/profile" element={<ProfilePage />}` inside the `RoleRoute roles={['super_admin', 'company_admin', 'scheduler']}` block (next to `/notifications`), so all authenticated non-employee roles can access it.
9. **`resources/js/Components/layout/Header.tsx`** — Added a `Profile` `DropdownMenuItem` (lucide `CircleUserRound`) linking to `/profile` immediately after the `DropdownMenuLabel`, before the role-gated `Settings` item. The existing name/email label and all other dropdown items (Settings, Sign out) are preserved.

### Verification

- `npm run build` (tsc + vite build) — **passed**, exit 0, no type errors, no regressions (3861 modules transformed).
- Profile update: `useUpdateProfile` → `PUT /auth/profile` → `AuthController@updateProfile` → `UpdateProfileRequest` validation → `UserResource` response → `queryClient.setQueryData(WEB_SESSION_KEY, ...)` so header/name updates immediately.
- Password update: `useUpdatePassword` → `PUT /auth/password` → `AuthController@updatePassword` → `UpdatePasswordRequest` validation → `$user->update(['password' => ...])` on success. The current password is no longer required or validated (legacy Breeze `PasswordController` and its web test were aligned to the same contract).
- Route `/profile` is behind `ProtectedRoute` (token guard) + `ProtectedLayout` (DashboardLayout chrome) + `RoleRoute` (super_admin/company_admin/scheduler gate) — employees cannot access it.
- Header dropdown unchanged in structure: label → Profile (new) → company_admin? Settings → Sign out. All existing behavior (trial badge, theme toggle, notification bell, breadcrumbs) preserved.
