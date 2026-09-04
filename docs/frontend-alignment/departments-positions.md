# Departments & Positions Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Departments (`/departments`) and Positions (`/positions`): list, search, filter, create, edit, delete, status, colour, company relationship, and the Company → Departments → Positions → Employees hierarchy. Roster is out of scope.
> **Method:** Backend/database/API is the **source of truth**. Every field was compared between backend (migrations, models, requests, controller, service, resources, routes, policy) and frontend (types, hooks, schemas, defaults, forms, pages, tables, settings). Only the frontend was changed — no backend code, migrations, or business rules were touched. **Roster is out of scope.**

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `departments` table + `Department` model fillable fields

| Field | Validation (`Store`/`Update`) | Notes |
|---|---|---|
| `name` | required, string, max:255 | `sometimes` required on update |
| `code` | nullable, string, max:50 | |
| `description` | nullable, string, max:1000 | |
| `color` | nullable, `regex:/^#([A-Fa-f0-9]{6})$/` | Backend default `#6366F1` (indigo) |
| `status` | `sometimes`, required, `in:active,inactive` | |
| `company_id` | required on store only (never update) | Forced server-side to the user's company for non-super-admin |
| `created_by` / `updated_by` | auto-set by controller | |

### 1.2 `positions` table + `Position` model fillable fields

| Field | Validation (`Store`/`Update`) | Notes |
|---|---|---|
| `name` | required, string, max:255 | `sometimes` required on update |
| `department_id` | nullable, `exists:departments,id` | Kept on update; null = company-wide position |
| `code` | nullable, string, max:50 | |
| `description` | nullable, string, max:1000 | |
| `default_hourly_rate` | nullable, numeric, 0..99999999.99 | The "pay scale" |
| `color` | nullable, `regex:/^#([A-Fa-f0-9]{6})$/` | Backend default `#3B82F6` (blue) |
| `status` | `sometimes`, required, `in:active,inactive` | |
| `company_id` | required on store only (never update) | Forced server-side for non-super-admin |

### 1.3 Resources (what the API actually returns)

- **`DepartmentResource`** — `id`, `company_id`, `name`, `code`, `description`, `color`, `status`, `created_by`, `updated_by`, `company` (nested when loaded), `positions_count` (when counted), `created_at`, `updated_at`.
- **`PositionResource`** — same as above plus `department_id`, `default_hourly_rate`, and `department` (nested when loaded).

### 1.4 Relationship chain (Company → Departments → Positions → Employees)

- `Company` `hasMany` `Department`; `Department` `belongsTo` `Company` and `hasMany` `Position` (+ `hasMany` `Shift`).
- `Position` `belongsTo` `Company` and `belongsTo` `Department` (nullable — positions may be company-wide).
- `Employee` links a person to a `company`, an optional `branch`, an optional `department` and an optional `position` (the `employees` table carries `department_id` / `position_id`). The Company → Departments → Positions chain therefore flows through employees at the record level: an employee belongs to a company, may sit in a department, and may hold a position.

### 1.5 Permissions (Spatie roles + policies)

- `super_admin` — `before()` grants **all** department/position abilities (viewAny, view, create, update, delete).
- `company_admin` — the same abilities, but `DepartmentPolicy` / `PositionPolicy::belongsToCompany` restricts every model-level ability to the user's own company.
- `scheduler` — **view-only**: `department.view`, `position.view` (no create/update/delete).
- `employee` — none of these permissions.
- `DepartmentController::index` / `PositionController::index` force `company_id = $request->user()->company_id` for non-super-admin → **Company Admin only sees/manages their own company's departments & positions** (company isolation is server-side; the frontend never needs to send `company_id`).

### 1.6 API surface

- `GET /departments` → paginated `DepartmentResource` (`search`, `status`, `per_page`; scoped to own company)
- `POST /departments` → `StoreDepartmentRequest`
- `GET /departments/{department}` → `DepartmentResource`
- `PUT /departments/{department}` → `UpdateDepartmentRequest`
- `DELETE /departments/{department}` → delete (soft delete)
- `GET /positions` → paginated `PositionResource` (`search`, `status`, `department_id`, `per_page`; scoped to own company)
- `POST /positions` → `StorePositionRequest`
- `GET /positions/{position}` → `PositionResource`
- `PUT /positions/{position}` → `UpdatePositionRequest`
- `DELETE /positions/{position}` → delete (soft delete)
- Routes live in the `company.access` middleware group: `Route::apiResource('departments')`, `Route::apiResource('positions')`.

---

## 2. Frontend Before → After

### 2.1 [`resources/js/types/department.ts`](resources/js/types/department.ts)

- **Added** `#6366F1` (indigo — the backend's default) as the first swatch in `DEPARTMENT_COLOR_OPTIONS`, so the palette and the new-department default now match the backend.
- `DEFAULT_DEPARTMENT_COLOR = DEPARTMENT_COLOR_OPTIONS[0]` now resolves to `#6366F1` (previously the first swatch was `#2563EB`, so a new department was created with a colour the backend never chose by default).
- The `Department` domain type (`id`, `companyId`, `name`, `code`, `description`, `color`, `status`, `companyName`, `positionsCount`, `createdAt`, `updatedAt`) was verified to map 1:1 to `DepartmentResource` — no change needed.

### 2.2 [`resources/js/types/position.ts`](resources/js/types/position.ts)

- **Added** `#3B82F6` (blue — the backend's default) as the first swatch in `POSITION_COLOR_OPTIONS`.
- `DEFAULT_POSITION_COLOR = POSITION_COLOR_OPTIONS[0]` now resolves to `#3B82F6` (previously `#2563EB`).
- The `Position` domain type (`id`, `companyId`, `departmentId`, `name`, `code`, `description`, `defaultHourlyRate`, `color`, `status`, `companyName`, `departmentName`, `createdAt`, `updatedAt`) was verified to map 1:1 to `PositionResource` — no change needed. `PositionListParams` already carried `departmentId`.

### 2.3 [`resources/js/types/settings.ts`](resources/js/types/settings.ts)

**Removed** the obsolete `DepartmentParameters` interface (previously lines 48-60), which referenced `branchId`, `minimumStaffPerShift` and `colorToken` — none of these fields exist on the backend `departments` table, migrations, or any API. The header docblock was updated to drop the "department parameters" mention.

### 2.4 [`resources/js/features/settings/pages/SettingsDashboardPage.tsx`](resources/js/features/settings/pages/SettingsDashboardPage.tsx)

- The "Departments" tab previously rendered invented "coming soon… minimum staffing levels and colour themes" copy with no way to reach the real feature.
- It now mirrors the Branches/Subscription tab pattern: an explanatory blurb plus a `Link` to the real **Departments dashboard** (`/departments`) with a `Network` icon + `ArrowUpRight` button ("Open Departments dashboard").
- **Added** `Network` to the lucide-react import block (was a compile error until added).

### 2.5 [`resources/js/features/positions/pages/PositionsListPage.tsx`](resources/js/features/positions/pages/PositionsListPage.tsx)

- **Added** a server-side department filter to mirror the backend's `department_id` support in `PositionService::paginate` (the endpoint already accepted it, but the UI never surfaced it):
  - Imported `useDepartmentOptions` from `@/features/departments/hooks/useDepartments`.
  - New state `departmentId` (sentinel `'all'` = no filter) + `departmentOptions`/`isLoadingDepartments` from `useDepartmentOptions`.
  - The `usePositions` query now passes `departmentId: departmentId === 'all' ? undefined : Number(departmentId)`.
  - The filter toolbar gained a department `<select>` (with "All departments" / "Loading departments…" option states, `disabled:opacity-60` while loading) placed before the existing status select.
  - Updated the docblock to mention both server-side filters (`search`, `status`, `company_id`, `department_id`).

### 2.6 No-change confirmations (verified aligned)

- [`resources/js/features/departments/hooks/useDepartments.ts`](resources/js/features/departments/hooks/useDepartments.ts) — `DepartmentDto` matches `DepartmentResource`; `toDepartmentPayload` sends `name/code/description/color/status` (matches `Store`/`UpdateDepartmentRequest`; no `company_id` sent — correct, server forces it); `useDepartmentOptions` fetches `{status:'active', perPage:100}` for dropdowns; `mapDepartment` maps `positions_count`/`company` correctly.
- [`resources/js/features/positions/hooks/usePositions.ts`](resources/js/features/positions/hooks/usePositions.ts) — `PositionDto` matches `PositionResource`; `toPositionPayload` sends `name`, `department_id` (cast via `Number(...)` so a position is genuinely linked to the department record; `null` clears it for company-wide roles), `code`, `description`, `default_hourly_rate`, `color`, `status`; `usePositionOptions(departmentId?)` narrows dropdowns by department; `parseRate` tolerates the decimal-string `default_hourly_rate`.
- [`resources/js/features/departments/schemas.ts`](resources/js/features/departments/schemas.ts) / [`resources/js/features/positions/schemas.ts`](resources/js/features/positions/schemas.ts) — `name` required max:255, `code` max:50, `description` max:1000, `color` regex `/^#([A-Fa-f0-9]{6})$/`, `status` enum `active|inactive`, position `payScale` numeric 0..99999999.99, `departmentId` optional string. All match backend validation.
- [`resources/js/features/departments/components/DepartmentFormModal.tsx`](resources/js/features/departments/components/DepartmentFormModal.tsx) / [`resources/js/features/positions/components/PositionFormModal.tsx`](resources/js/features/positions/components/PositionFormModal.tsx) — name / code / description / colour picker (from the swatch palettes) / status; the position form's department select uses real `useDepartmentOptions` data (with a "No department (company-wide)" option) rather than free text or a fabricated list. `EMPTY_DEFAULTS` status `'active'` matches backend.
- [`resources/js/features/departments/components/DepartmentsTable.tsx`](resources/js/features/departments/components/DepartmentsTable.tsx) / [`resources/js/features/positions/components/PositionsTable.tsx`](resources/js/features/positions/components/PositionsTable.tsx) — name / code / description / positions|department+pay scale / status badge / row actions columns; status pills match the backend `status` enum; list/search/filter/pagination flow through the reusable `DataTable`.
- [`resources/js/features/departments/pages/DepartmentsListPage.tsx`](resources/js/features/departments/pages/DepartmentsListPage.tsx) — server-side status filter + `useDepartments({perPage:100})`, KPI cards from `meta.total` + client counts. No change needed.
- [`resources/js/routes/AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx) — `/departments` and `/positions` are routed inside `RoleRoute roles={['company_admin']}`.

---

## 3. Field-by-field comparison

### 3.1 Department create / edit

| Backend field | Was in frontend? | Action |
|---|---|---|
| `name` | Yes | OK |
| `code` | Yes | OK |
| `description` | Yes | OK |
| `color` | Yes | **Fixed default** — palette + `DEFAULT_DEPARTMENT_COLOR` aligned to backend default `#6366F1` |
| `status` | Yes | OK |
| `company_id` | Never sent (correct) | OK — forced server-side |

### 3.2 Department read / view

| Backend field | Was in frontend? | Action |
|---|---|---|
| `company` / `company_id` | Yes (`companyId`, `companyName`) | OK |
| `positions_count` | Yes (`positionsCount`) | OK |
| `created_by` / `updated_by` | Not displayed | OK (audit metadata, not surfaced on list) |
| `created_at` / `updated_at` | Yes | OK |

### 3.3 Position create / edit

| Backend field | Was in frontend? | Action |
|---|---|---|
| `name` | Yes | OK |
| `department_id` | Yes | OK — select fed by `useDepartmentOptions`, sent as `Number(...)` id; `null` = company-wide |
| `code` | Yes | OK |
| `description` | Yes | OK |
| `default_hourly_rate` | Yes (`payScale`) | OK — numeric schema + `parseRate` on read |
| `color` | Yes | **Fixed default** — palette + `DEFAULT_POSITION_COLOR` aligned to backend default `#3B82F6` |
| `status` | Yes | OK |
| `company_id` | Never sent (correct) | OK — forced server-side |

### 3.4 Position read / view

| Backend field | Was in frontend? | Action |
|---|---|---|
| `company` / `company_id` | Yes (`companyId`, `companyName`) | OK |
| `department` / `department_id` | Yes (`departmentId`, `departmentName`) | OK |
| `created_at` / `updated_at` | Yes | OK |

### 3.5 Removed obsolete frontend-only UI

| Removed | Why |
|---|---|
| `DepartmentParameters` interface in [`resources/js/types/settings.ts`](resources/js/types/settings.ts) | Referenced `branchId`, `minimumStaffPerShift`, `colorToken` — none exist on the backend `departments` table, migrations, or any API |
| Settings "Departments" tab "coming soon… minimum staffing levels and colour themes" copy | Invented features not backed by any backend endpoint; replaced with a link to the real `/departments` dashboard |

---

## 4. Noted-but-consistent discrepancy (unchanged by design)

The backend grants the **scheduler** role view-only `department.view` and `position.view` permissions, but:

- [`resources/js/Components/layout/nav-items.ts`](resources/js/Components/layout/nav-items.ts) marks Branches, Departments and Positions all as `COMPANY_ADMIN_ONLY`, and
- [`resources/js/routes/AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx) gates `/departments` and `/positions` behind `RoleRoute roles={['company_admin']}`.

This exactly mirrors the **Branches** precedent (kept `COMPANY_ADMIN_ONLY` in that alignment pass as well), so it was deliberately left unchanged for consistency. Schedulers can still read department/position data indirectly through the real dropdowns on the employee and shift screens (`useDepartmentOptions` / `usePositionOptions` fetch active records), which is the intended read path for that role.

---

## 5. Verification

### 5.1 TypeScript / build

- `npx tsc --noEmit` — clean (exit 0).
- `npx vite build` — succeeds (3854 modules transformed, exit 0).

### 5.2 Backend tests (API contract the frontend targets)

`DepartmentManagementTest` + `PositionManagementTest` — **OK (34 tests, 70 assertions)**: department/position list, create, update, delete, validation and permission/company-isolation behaviour. Run via:

```
C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe vendor\bin\phpunit --filter "DepartmentManagementTest|PositionManagementTest"
```

### 5.3 Flow coverage

- **List / Search / Filter / Pagination:** server-driven fetch (`per_page:100`) + server-side status filter for both; positions additionally server-side department filter (`department_id`); client-side name search, sorting, pagination via `DataTable`.
- **Create / Edit:** form modals POST/PUT snake_case payloads (`toDepartmentPayload` / `toPositionPayload`) matching the `Store`/`Update` requests; list query invalidated on success.
- **Delete:** `DELETE /departments/{id}` / `DELETE /positions/{id}` via dedicated mutations with confirmation dialog + toast.
- **Dropdown data:** position form's department select uses real `useDepartmentOptions`; employee/shift screens use `usePositionOptions(departmentId?)` for real job-title records — no free-text or fabricated lists.
- **IDs / value mapping:** `department_id` is sent as a numeric id (not a name); `id` is stringified for routing, restored to numeric where the API expects it.
- **Company relationship & isolation:** company_admin scoping is entirely server-side (forced `company_id`); the frontend never sends `company_id`; tables show `companyName` when the relation is loaded.

---

## 6. Files changed

| File | Change |
|---|---|
| `resources/js/types/department.ts` | Added `#6366F1` (backend default) as first swatch; `DEFAULT_DEPARTMENT_COLOR` now `#6366F1` |
| `resources/js/types/position.ts` | Added `#3B82F6` (backend default) as first swatch; `DEFAULT_POSITION_COLOR` now `#3B82F6` |
| `resources/js/types/settings.ts` | Removed obsolete `DepartmentParameters`; updated header docblock |
| `resources/js/features/settings/pages/SettingsDashboardPage.tsx` | Departments tab now links to `/departments` (Network icon) instead of "coming soon" copy; added `Network` import |
| `resources/js/features/positions/pages/PositionsListPage.tsx` | Added server-side department filter (uses `useDepartmentOptions`, passes `department_id`) |

No backend files, migrations, or business rules were modified.
