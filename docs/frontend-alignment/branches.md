# Branches Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Branches (`/branches`) and branch-level subscription management: list, search, filter, pagination, create, edit, view, delete/deactivate, branch status, company relationship, subscription relationship.
> **Method:** Backend/database/API is the **source of truth**. Every field was compared between backend (migrations, models, requests, controller, service, resources, routes, policy) and frontend (types, hooks, schemas, defaults, forms, pages, table, settings). Only the frontend was changed — no backend code, migrations, or business rules were touched. **Roster is out of scope.**

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `branches` table + `Branch` model fillable fields

| Field | Validation (`Store`/`Update`) | Notes |
|---|---|---|
| `name` | required, string, max:255 | |
| `manager_id` | nullable, exists:employees,id | |
| `phone` | nullable, string, max:50 | |
| `address` | nullable, string, max:1000 | |
| `latitude` | nullable, numeric, between:-90,90 | **was missing from the frontend create/edit payload** |
| `longitude` | nullable, numeric, between:-180,180 | **was missing from the frontend create/edit payload** |
| `timezone` | required, valid timezone | |
| `status` | required, in:active,inactive | |
| `default_opens_at` / `default_closes_at` | nullable, `HH:MM` (via `ValidatesBranchSchedule`) | |
| `default_break_minutes` | nullable, int, 0..480 | |
| `default_break_paid` | nullable, boolean | |
| `day_schedules` | nullable, JSON per-weekday overrides | |

### 1.2 `branch_subscriptions` table + `BranchSubscription` model

`id`, `company_id`, `branch_id`, `subscription_id`, `status`, `employee_capacity`, `started_at`, `ended_at`, `created_at`, `updated_at`. One active branch subscription per branch (`scopeActive`); `employee_capacity` is the branch's entitled headcount (null = plan default).

### 1.3 `BranchResource` (what the API actually returns)

`id`, `company_id`, `manager_id`, `name`, `phone`, `address`, `latitude`, `longitude`, `timezone`, `default_opens_at`, `default_closes_at`, `default_break_minutes`, `default_break_paid`, `day_schedules`, `status`, `company` (nested when loaded), `manager` (nested when loaded), `users_count`, `employees_count`, `shifts_count`, `created_at`, `updated_at`.

### 1.4 Permissions (Spatie roles + `BranchPolicy`)

- `super_admin` — `before()` grants **all** branch abilities (viewAny, view, create, update, delete, activate, deactivate, manageCapacity).
- `company_admin` — the same abilities but only for branches belonging to their own company (`belongsToCompany`).
- `BranchController::index` scopes to `$request->user()->company_id` for non-super-admin → **Company Admin only sees/manages their own company's branches**.

### 1.5 API surface

- `GET /branches` → paginated `BranchResource` (`search`, `status`, `per_page` params; scoped to own company for non-super-admin)
- `POST /branches` → `StoreBranchRequest`
- `GET /branches/{branch}` → `BranchResource`
- `PUT /branches/{branch}` → `UpdateBranchRequest`
- `DELETE /branches/{branch}` → branch delete
- `POST /branches/{branch}/activate` → `ActivateBranchRequest` (optional `employee_capacity`)
- `POST /branches/{branch}/deactivate` → deactivate branch subscription
- `PUT /branches/{branch}/capacity` → `UpdateBranchCapacityRequest` (`employee_capacity`)
- `GET /subscription/usage` → `PlanSubscriptionController::usage` → `branches_usage:[{id,name,active,employees_used,employee_capacity,remaining}]`
- Branch mutation endpoints (`activate`/`deactivate`/`capacity`) return `usage: usageFor()` → `{branches:{used,limit}, branch_usage:[{branch_id,employees_used,capacity,remaining}]}` — **no `name`/`active`**

**Two distinct usage shapes** (verified):
- `GET /subscription/usage` (`PlanSubscriptionController`) → `branches_usage` with `name`/`active` — consumed by `useUsageOverview`.
- Branch mutation responses (`UsageService::usageFor()`) → `branch_usage` with only `branch_id`/`employees_used`/`capacity`/`remaining` — consumed by `useBranchBilling`.

---

## 2. Frontend Before → After

### 2.1 [`resources/js/types/branch.ts`](resources/js/types/branch.ts)

**Added** to the `Branch` interface, decoupling staff headcount from provisioned accounts:

- `employeesCount: number | null` — maps `employees_count` (staff linked through `employees.branch_id`).
- `usersCount: number | null` — now distinct, maps `users_count` (directly provisioned accounts).
- `shiftsCount: number | null` — maps `shifts_count`.

Previously the detail page conflated `employees_count` and `users_count` into a single `usersCount`.

### 2.2 [`resources/js/features/branches/hooks/useBranches.ts`](resources/js/features/branches/hooks/useBranches.ts)

- **`mapBranch`** now maps the three counts separately: `employeesCount: dto.employees_count ?? null`, `usersCount: dto.users_count ?? null`, `shiftsCount: dto.shifts_count ?? null` (previously `usersCount: dto.employees_count ?? dto.users_count ?? null`).
- **`toBranchPayload`** now sends the coordinates (previously omitted entirely):
  ```ts
  latitude: values.latitude ?? null,
  longitude: values.longitude ?? null,
  ```
  Because the payload never sent them, the backend always stored `null` regardless of what the UI accepted.
- `fetchBranches` already sent `search`/`status`/`per_page` — no change needed (company scoping is server-side for company_admin).

### 2.3 [`resources/js/features/branches/schemas.ts`](resources/js/features/branches/schemas.ts)

- **Added** `optionalCoordinate(min, max, fieldLabel)` helper that normalises empty strings to `undefined` (so the equator `0` / prime meridian `0` remain valid) and enforces the backend's range caps.
- **Added** to `branchFormSchema` (after `address`):
  ```ts
  latitude: optionalCoordinate(-90, 90, 'Latitude'),
  longitude: optionalCoordinate(-180, 180, 'Longitude'),
  ```

### 2.4 [`resources/js/features/branches/lib/branch-form-defaults.ts`](resources/js/features/branches/lib/branch-form-defaults.ts)

- `EMPTY_BRANCH_FORM` now includes `latitude: ''`, `longitude: ''` (after `address`).
- `toBranchFormDefaults` returns `latitude: branch.latitude ?? ''`, `longitude: branch.longitude ?? ''` (after `address`).

### 2.5 [`resources/js/features/branches/components/BranchFormModal.tsx`](resources/js/features/branches/components/BranchFormModal.tsx)

- **Added** a two-column coordinate grid between the Address block and the Timezone block: `Latitude` (`type="number" step="any" min="-90" max="90"`) and `Longitude` (`type="number" step="any" min="-180" max="180"`), both registered with React Hook Form and rendering inline schema errors.

### 2.6 [`resources/js/features/branches/pages/BranchDetailPage.tsx`](resources/js/features/branches/pages/BranchDetailPage.tsx)

- The relation-count StatCard grid now shows **three distinct cards** matching the company-feature pattern:
  - "Employees" (`employeesCount`, `Users` icon, "Staff linked to this branch")
  - "User accounts" (`usersCount`, `Briefcase` icon, "Directly provisioned accounts")
  - "Shifts" (`shiftsCount`, `CalendarClock` icon, "Scheduled at this location")
- "Open today" remains as a fourth card below.
- **Added** `Briefcase` to the lucide-react imports.

### 2.7 [`resources/js/features/billing/hooks/useBranchBilling.ts`](resources/js/features/billing/hooks/useBranchBilling.ts)

- `BranchMutationDto['usage'].branch_usage` items: `name?: string | null` and `active?: boolean` are now **optional** (the mutation endpoints report only `branch_id / employees_used / capacity / remaining`).
- **`mapUsage`** defaults tolerant placeholders with a comment explaining the shape difference: `name: item.name ?? ''`, `active: item.active ?? false`.
- **Cache-shape bug fixed in `refreshUsage`**: previously it seeded `SUBSCRIPTION_KEYS.usage` with the name-less `SubscriptionUsage` (`branchUsage`) object, but `useUsageOverview` reads that same key expecting `UsageOverview` (`branchesUsage`). The summary cache seeding is retained, but the usage cache is now **invalidated** so `GET /subscription/usage` refetches the correct `branches_usage` shape:
  ```ts
  void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEYS.usage });
  ```
  Without this fix, after any branch activation/deactivation/capacity change the branches-list usage column read an incompatible shape until a manual refetch.

### 2.8 [`resources/js/features/settings/pages/SettingsDashboardPage.tsx`](resources/js/features/settings/pages/SettingsDashboardPage.tsx)

- The "Branches" tab no longer renders the invented mock labour-rate form (`MOCK_BRANCH`, `handleBranchSubmit`, `BranchForm`). It now mirrors the subscription tab's pattern: an explanatory blurb plus a `Link` to the real **Branches dashboard** (`/branches`) with a `MapPin` + `ArrowUpRight` button.
- Removed the now-unused `BranchConfiguration` / `BranchFormValues` type imports and `BranchForm` import.

### 2.9 [`resources/js/types/settings.ts`](resources/js/types/settings.ts)

**Removed** (fields that do not exist on the backend `branches` table / were orphaned by the BranchForm deletion):

- `LaborRateMultipliers`, `BranchConfiguration`, `BranchFormValues` interfaces (invented labour-rate UI fields not on the backend).
- `AUSTRALIAN_STATES`, `AustralianState`, `AUSTRALIAN_STATE_LABELS` (orphaned; the companies feature imports its own `AUSTRALIAN_STATES` from `@/types/company`).
- **Kept** `AUSTRALIAN_TIMEZONES` / `AustralianTimezone` / `AUSTRALIAN_TIMEZONE_LABELS` because `OrganizationProfile.defaultTimezone: AustralianTimezone` still references them.

### 2.10 Deleted — [`resources/js/features/settings/components/BranchForm.tsx`](resources/js/features/settings/components/BranchForm.tsx)

The mock labour-rate branch form. Its only consumer was the Settings "Branches" tab; no remaining references after the tab was replaced with a link to `/branches`.

### 2.11 No-change confirmations

- [`resources/js/features/billing/hooks/useSubscription.ts`](resources/js/features/billing/hooks/useSubscription.ts) — `fetchUsage` reads `branches_usage` with `name`/`active`, which **matches** `GET /subscription/usage`; `mapBranchUsage` already tolerates the `id`/`branch_id` and `capacity`/`employee_capacity` aliases. No change needed.
- [`resources/js/features/branches/pages/BranchesListPage.tsx`](resources/js/features/branches/pages/BranchesListPage.tsx) — server-side status filter + `useBranches({perPage: 100})`; KPI cards from `meta.total` + client counts; capacity dialog flow intact.
- [`resources/js/features/branches/components/BranchesTable.tsx`](resources/js/features/branches/components/BranchesTable.tsx) / [`resources/js/Components/tables/DataTable.tsx`](resources/js/Components/tables/DataTable.tsx) — **list/search/filter/pagination** already consistent with the app-wide pattern: server-driven list fetch, server-side status filter, client-side search (`searchKey="name"` via `getFilteredRowModel`), client-side sorting + pagination footer. No change needed.
- [`resources/js/features/branches/components/BranchStatusBadge.tsx`](resources/js/features/branches/components/BranchStatusBadge.tsx) — status `active`/`inactive` pill already matches the backend `status` enum.
- [`resources/js/features/billing/components/BranchCapacityDialog.tsx`](resources/js/features/billing/components/BranchCapacityDialog.tsx) — capacity set/confirm dialog (activate/increase) already matches `ActivateBranchRequest` / `UpdateBranchCapacityRequest`.
- [`resources/js/features/branches/components/BranchScheduleCard.tsx`](resources/js/features/branches/components/BranchScheduleCard.tsx) / `BranchHoursFields` / `BranchAdvancedHours` / `BranchDayScheduleRow` — operating-hours UI already matches the `day_schedules` JSON + default hours fields.

---

## 3. Field-by-field comparison

### 3.1 Branch create / edit

| Backend field | Was in frontend? | Action |
|---|---|---|
| `name` | Yes | OK |
| `manager_id` | Yes | OK |
| `phone` | Yes | OK |
| `address` | Yes | OK |
| `latitude` | **Type only (not form/payload)** | **Fixed** — added to schema, form inputs, defaults, and `toBranchPayload` |
| `longitude` | **Type only (not form/payload)** | **Fixed** — added to schema, form inputs, defaults, and `toBranchPayload` |
| `timezone` | Yes | OK |
| `status` | Yes | OK |
| `default_opens_at` / `default_closes_at` | Yes | OK |
| `default_break_minutes` | Yes | OK |
| `default_break_paid` | Yes | OK |
| `day_schedules` | Yes | OK |

### 3.2 Branch read / view

| Backend field | Was in frontend? | Action |
|---|---|---|
| `company` / `company_id` | Yes (`companyName`) | OK |
| `manager` / `manager_id` | Yes | OK |
| `users_count` | Yes | OK |
| `employees_count` | **Conflated into `usersCount`** | **Fixed** — now its own `employeesCount` field + StatCard |
| `shifts_count` | Yes | OK |
| `created_at` / `updated_at` | Yes | OK |

### 3.3 Branch status & subscription

| Backend concept | Frontend handling | Action |
|---|---|---|
| `status` (`active`/`inactive`) | `BranchStatusBadge` + status filter + form select | OK |
| Branch activate (`POST /branches/{branch}/activate`) | `useActivateBranch` + `BranchCapacityDialog` | OK |
| Branch deactivate (`POST /branches/{branch}/deactivate`) | `useDeactivateBranch` (available via billing hook) | OK |
| Capacity (`PUT /branches/{branch}/capacity`) | `useUpdateBranchCapacity` + dialog | OK |
| `GET /subscription/usage` shape (`branches_usage`) | `useUsageOverview` | OK (no change) |
| Mutation `usageFor()` shape (`branch_usage`, no name/active) | `useBranchBilling` | **Fixed** — tolerant DTO/mapping + cache invalidation instead of incompatible seed |

### 3.4 Removed obsolete frontend-only UI

| Removed | Why |
|---|---|
| Settings "Branches" mock labour-rate form (`BranchForm.tsx`, `MOCK_BRANCH`, `handleBranchSubmit`) | Fields did not exist on the backend; replaced with a link to the real `/branches` dashboard |
| `LaborRateMultipliers`, `BranchConfiguration`, `BranchFormValues` (settings types) | Invented fields not on the backend `branches` table |
| `AUSTRALIAN_STATES`, `AustralianState`, `AUSTRALIAN_STATE_LABELS` (settings types) | Orphaned after the mock form removal; companies feature owns its own copy |

---

## 4. Verification

### 4.1 TypeScript / build

- `npx tsc --noEmit` — clean (exit 0).
- `npx vite build` — succeeds (3854 modules transformed, exit 0).

### 4.2 Backend tests (API contract the frontend targets)

`Branch/BranchManagementTest`, `Branch/BranchScheduleTest`, `Billing/BranchCapacityTest`, `Billing/BranchSubscriptionTest`, `Billing/BranchUsageRulesTest` — **83 passed, 293 assertions**: branch list/create/update/delete, schedule validation, activation, deactivation, capacity, usage rules.

### 4.3 Flow coverage

- **List / Search / Filter / Pagination:** server-driven fetch (`per_page:100`) + server-side status filter; client-side name search, sorting, pagination via `DataTable`. Confirmed consistent with the positions / leave-types / shift-templates pattern.
- **Create / Edit:** `BranchFormModal` POSTs/PUTs `toBranchPayload` incl. `latitude`/`longitude`; list/detail invalidated on success.
- **View:** `useBranch` maps `employeesCount`/`usersCount`/`shiftsCount`/`companyName`/schedule; delete confirmed via alert dialog then navigates back to the list.
- **Delete:** `DELETE /branches/{id}` via `useDeleteBranch` with confirmation dialog + toast.
- **Status / deactivate:** status pill + filter; branch subscription lifecycle via `useActivateBranch` / `useDeactivateBranch` / `useUpdateBranchCapacity` with the capacity dialog.
- **Subscription relationship:** usage columns + capacity dialog driven by `useUsageOverview` (`branches_usage`) and the branch mutation payloads (`branch_usage`); the two shapes are now handled correctly (no cache-shape collision).
- **Company relationship:** company_admin scoping is server-side; detail page shows `companyName`.

---

## 5. Files changed

| File | Change |
|---|---|
| `resources/js/types/branch.ts` | Added `employeesCount`; `usersCount`/`shiftsCount` clarified as distinct counts |
| `resources/js/features/branches/hooks/useBranches.ts` | `mapBranch` splits the three counts; `toBranchPayload` sends `latitude`/`longitude` |
| `resources/js/features/branches/schemas.ts` | Added `optionalCoordinate` helper + `latitude`/`longitude` fields |
| `resources/js/features/branches/lib/branch-form-defaults.ts` | Added `latitude`/`longitude` to empty form + defaults |
| `resources/js/features/branches/components/BranchFormModal.tsx` | Added coordinate grid (Latitude / Longitude inputs) |
| `resources/js/features/branches/pages/BranchDetailPage.tsx` | Split Employees / User accounts / Shifts StatCards; added `Briefcase` import |
| `resources/js/features/billing/hooks/useBranchBilling.ts` | Optional `name`/`active` on `branch_usage` DTO; tolerant `mapUsage`; fixed usage-cache seeding via `invalidateQueries` |
| `resources/js/features/settings/pages/SettingsDashboardPage.tsx` | Branches tab now links to `/branches`; removed mock branch form |
| `resources/js/types/settings.ts` | Removed `LaborRateMultipliers`, `BranchConfiguration`, `BranchFormValues`, `AUSTRALIAN_STATES`, `AustralianState`, `AUSTRALIAN_STATE_LABELS` |
| `resources/js/features/settings/components/BranchForm.tsx` | **Deleted** (mock labour-rate form) |

No backend files, migrations, or business rules were modified.
