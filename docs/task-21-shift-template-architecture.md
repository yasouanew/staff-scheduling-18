# Task 21 — Shift Template Architectural Map

> **Scope:** Complete end-to-end map of the Shift Template feature — every backend and frontend component where it is defined, referenced, or depends upon other system modules, its data flow, its role in the broader shift scheduling system, and its coupling/integration points.

---

## 1. Executive Summary

Shift Templates is a **company-scoped configuration module** that lets a scheduler/company admin define *reusable shift patterns* (times, break, colour, default role, branch/department scope) and then **materialise them into real shifts inside rosters**. It is a pure CRUD domain on the backend, wrapped in a tenant-isolation + permission model, and a read-heavy, preview-rich UI on the frontend.

The feature sits inside the **Scheduling** section of the product, adjacent to Rosters and Shifts. Its single most important architectural trait is that it is **not a source of truth for schedules** — a template is a *blueprint*; only the **Shifts** it produces are authoritative. This gives it two distinct surfaces:

1. **CRUD surface** — manage the template catalogue (`/shift-templates`).
2. **Materialisation surface** — turn a template into a `Shift` inside a `Roster` (`POST /shifts`), which is where it couples into the rest of the scheduling system.

A secondary, *conceptual* reuse also exists: the roster grid's copy/paste ("shift clipboard") uses a `ShiftTemplateValues` abstraction that mirrors the same idea of a reusable shift pattern without ever touching the `shift_templates` table.

---

## 2. Backend Component Inventory

### 2.1 Routes

| Route | Method | Handler | Middleware |
|---|---|---|---|
| `/api/v1/shift-templates` | `GET` | `ShiftTemplateController@index` | `auth:sanctum`, `account.active`, `company.access` |
| `/api/v1/shift-templates` | `POST` | `ShiftTemplateController@store` | same |
| `/api/v1/shift-templates/{shiftTemplate}` | `GET` | `ShiftTemplateController@show` | same |
| `/api/v1/shift-templates/{shiftTemplate}` | `PUT` | `ShiftTemplateController@update` | same |
| `/api/v1/shift-templates/{shiftTemplate}` | `DELETE` | `ShiftTemplateController@destroy` | same |

- Declared as `Route::apiResource('shift-templates', ShiftTemplateController::class)` at [`routes/api.php:310`](routes/api.php:310).
- The API is versioned under `/api/v1` and registered inside the `Route::middleware('company.access')` group (opened at [`routes/api.php:227`](routes/api.php:227)).
- **`company.access` is the critical middleware gate**: it uses [`CheckCompanyAccess`](app/Http/Middleware/CheckCompanyAccess.php:28), which delegates to [`AccessStateService`](app/Services/AccessStateService.php:25) (server-clock authoritative). This means **templates cannot be listed/created/edited while the company's trial or subscription is not active**, and device-clock manipulation cannot bypass it.
- `company_id` scoping: non-super-admin users always have their templates forced to their own company, so the route group itself guarantees tenant isolation in addition to the Policy layer.

### 2.2 Controller

[`app/Http/Controllers/Api/ShiftTemplateController.php`](app/Http/Controllers/Api/ShiftTemplateController.php:15)

| Method | Behaviour |
|---|---|
| `index()` | Authorises `viewAny`, reads filters from request, **forces `company_id` = user's company for non-super-admins**, returns `ShiftTemplateResource::collection` |
| `store()` | Authorises `create`, forces `company_id` + `created_by` (even when a client submits another company), returns `201` |
| `show()` | Authorises `view`, returns resource |
| `update()` | Authorises `update`, returns resource |
| `destroy()` | Authorises `delete`, returns `ApiResponse` success |

All data methods eager-load `['company', 'branch', 'department', 'position']` so the resource can embed readable relation names without N+1 queries.

### 2.3 Service

[`app/Services/ShiftTemplateService.php`](app/Services/ShiftTemplateService.php:9)

- `paginate(array $filters)` — eager-loads relations and applies `when()` filters for `company_id`, `branch_id`, `department_id`, `position_id`, `search` (on name/description), and `status`; orders by `latest()` and keeps query string on pagination.
- `create()` / `update()` — each wrapped in `DB::transaction`.
- `delete()` — transaction + soft delete.

### 2.4 Model

[`app/Models/ShiftTemplate.php`](app/Models/ShiftTemplate.php:11)

- `HasFactory`, `SoftDeletes`.
- `$fillable`: `company_id, branch_id, department_id, position_id, name, description, start_time, end_time, break_minutes, color, is_paid_break, status, created_by`.
- `casts()`: ints for FK ids / `break_minutes` / `created_by`; bool for `is_paid_break`.
- `scopeActive()` — `status = 'active'`.
- Relationships:
  - `company()` `BelongsTo`
  - `branch()` `BelongsTo` (nullable)
  - `department()` `BelongsTo` (nullable)
  - `position()` `BelongsTo` (nullable — the *default role* a produced shift takes)
  - `creator()` `BelongsTo User` via `created_by`
- Inverse relationship on the tenant: [`Company::shiftTemplates()`](app/Models/Company.php:167) — `hasMany`.

### 2.5 Migration

[`database/migrations/2026_07_27_000009_create_shift_templates_table.php`](database/migrations/2026_07_27_000009_create_shift_templates_table.php:12)

- `company_id` — constrained, `cascadeOnDelete` (deleting a company removes its templates).
- `branch_id`, `department_id`, `position_id` — nullable, `nullOnDelete`.
- `name` string; `description` text nullable; `start_time`/`end_time` `time`; `break_minutes` int default `30`; `color` string(7) nullable default `#10B981`; `is_paid_break` bool default `false`; `status` string default `active`.
- `created_by` foreign id nullable `nullOnDelete`.
- `timestamps` + `softDeletes`.

### 2.6 Requests (Validation)

- [`StoreShiftTemplateRequest`](app/Http/Requests/ShiftTemplate/StoreShiftTemplateRequest.php:7) — `name` required max 255; `description` nullable max 1000; `start_time`/`end_time` required `date_format:H:i`; `break_minutes` nullable int 0–1440; `color` nullable hex regex; `is_paid_break` nullable bool; `status` nullable `in:active,inactive`; nullable `exists:` checks on the three relation FKs. `authorize()` returns `true` (policy handles authorisation).
- [`UpdateShiftTemplateRequest`](app/Http/Requests/ShiftTemplate/UpdateShiftTemplateRequest.php:7) — same rules but with `sometimes` on `name`/`start_time`/`end_time` to allow partial updates.

### 2.7 Policy

[`app/Policies/ShiftTemplatePolicy.php`](app/Policies/ShiftTemplatePolicy.php:8)

- `before()` — super_admin short-circuits to `true`.
- `viewAny` — `shift_template.view`.
- `view` / `update` / `delete` — required permission **AND** `belongsToCompany()`.
- `create` — `shift_template.create`.
- `belongsToCompany()` — `(int) $user->company_id === (int) $shiftTemplate->company_id`.

**Permission matrix** (seeded in [`RoleAndPermissionSeeder`](database/seeders/RoleAndPermissionSeeder.php:40)):

| Permission | super_admin | company_admin | scheduler | employee |
|---|---|---|---|---|
| `shift_template.view` | ✅ | ✅ | ✅ | ❌ |
| `shift_template.create` | ✅ | ✅ | ✅ | ❌ |
| `shift_template.edit` | ✅ | ✅ | ✅ | ❌ |
| `shift_template.delete` | ✅ | ✅ | ❌ | ❌ |

Note: shift templates are **not** plan-feature-gated via the `Feature` enum — every plan with an active subscription can use them (unlike e.g. `advanced_reporting` which is feature-gated). Access is a function of subscription validity (`company.access`) + role permission, not plan tier.

### 2.8 Resource

[`app/Http/Resources/ShiftTemplateResource.php`](app/Http/Resources/ShiftTemplateResource.php:8)

Exposes `id, company_id, branch_id, department_id, position_id, name, description, start_time, end_time, break_minutes, color, is_paid_break, status, created_by`, nested `company` / `branch` / `department` / `position` (`whenLoaded`, using `CompanyResource` / `BranchResource` / `DepartmentResource` / `PositionResource`), and ISO-8601 `created_at` / `updated_at`.

### 2.9 Middleware (relevant to the feature, not owned by it)

- `auth:sanctum` — token auth; tokens expire per the Sanctum TTL (1440 min default).
- `account.active` — [`EnsureActiveAccount`](app/Http/Middleware/EnsureActiveAccount.php:19).
- `company.access` — [`CheckCompanyAccess`](app/Http/Middleware/CheckCompanyAccess.php:28) → [`AccessStateService`](app/Services/AccessStateService.php:25) (server-authoritative trial/subscription gate; grace-period aware).

### 2.10 Factory & Tests

- [`database/factories/ShiftTemplateFactory.php`](database/factories/ShiftTemplateFactory.php:15) — full factory wired to `Company`/`Branch`/`Department`/`Position` factories.
- [`tests/Feature/ShiftTemplate/ShiftTemplateManagementTest.php`](tests/Feature/ShiftTemplate/ShiftTemplateManagementTest.php:18) — 15 tests covering: guest 401, super-admin list/create/view/update/delete, search filter, required-field + invalid-status validation, company scoping (only own company listed), server-side company forcing on create, cross-company 403s (view/update/delete), and employee (no-permission) 403.

---

## 3. Frontend Component Inventory

Feature-sliced directory: `resources/js/features/shift-templates/`.

### 3.1 Routing & Navigation

- Route: [`AppRoutes.tsx:426`](resources/js/routes/AppRoutes.tsx:426) — `<Route path="/shift-templates" element={<ShiftTemplatesListPage />} />` nested inside a `RoleRoute` allowing `company_admin` + `scheduler` (both under the authenticated layout, which is itself gated by session validity).
- Nav item: [`nav-items.ts:53`](resources/js/Components/layout/nav-items.ts:53) — `{ label: 'Shift Templates', to: '/shift-templates', icon: CalendarRange, section: 'Scheduling', roles: COMPANY_ROLES }`.

### 3.2 Pages

- [`pages/ShiftTemplatesListPage.tsx`](resources/js/features/shift-templates/pages/ShiftTemplatesListPage.tsx:45)
  - Owns server-side filters (`status`, `branchId`, `departmentId`), pagination (perPage 100), and the three modals' open state (create/duplicate, edit, use-template).
  - Computes KPI stats (Total / Active / Scoped) from the loaded page.
  - Derives `canDelete` from `normalizeWebRole(session.data) === 'company_admin'` (hides delete for schedulers).
  - Delegates delete mutation + toasts.
  - Depends on `useBranchOptions` / `useDepartmentOptions` (branch & department features) for filter dropdowns.

### 3.3 Components

| Component | File | Role |
|---|---|---|
| `ShiftTemplatesTable` | [`components/ShiftTemplatesTable.tsx`](resources/js/features/shift-templates/components/ShiftTemplatesTable.tsx:195) | Presentational `DataTable`; columns = name+avatar, time range (+ overnight chip), duration, break, payable, default role, scope, status, actions. Row actions: use/edit/duplicate/delete (delete hidden when `canDelete=false`); delete behind a Radix AlertDialog confirmation. |
| `ShiftTemplateFormModal` | [`components/ShiftTemplateFormModal.tsx`](resources/js/features/shift-templates/components/ShiftTemplateFormModal.tsx:98) | Slide-over for create/edit/duplicate. RHF + zod. Uses `useCreateShiftTemplate` / `useUpdateShiftTemplate`. Renders `ShiftTemplatePreview` live. Depends on `useBranchOptions` / `useDepartmentOptions` / `usePositionOptions`. |
| `ShiftTemplatePreview` | [`components/ShiftTemplatePreview.tsx`](resources/js/features/shift-templates/components/ShiftTemplatePreview.tsx:64) | Pure presentational summary: 24-hour timeline track (handles overnight double-segment), derived shift length / break / payable hours via `lib/shift-time`. |
| `ShiftTemplateStatusBadge` | [`components/ShiftTemplateStatusBadge.tsx`](resources/js/features/shift-templates/components/ShiftTemplateStatusBadge.tsx:25) | Status pill using the shared `Badge` primitive (active → success, inactive → neutral). |
| `UseTemplateModal` | [`components/UseTemplateModal.tsx`](resources/js/features/shift-templates/components/UseTemplateModal.tsx:53) | **Materialisation surface.** Drawer that turns a template into a real shift: picks roster week + date, lets times/break default from template but stay editable, optional employee assignment, and editable branch/department/role scope. Submits via `useCreateShiftFromTemplate` → `POST /shifts`. |

### 3.4 Hooks / Data Layer

[`hooks/useShiftTemplates.ts`](resources/js/features/shift-templates/hooks/useShiftTemplates.ts:1)

- **Query keys:** `SHIFT_TEMPLATES_KEYS = { all, list(params), detail(id), rosterOptions }`.
- **DTO → domain mapping:** `ShiftTemplateDto`, `RosterOptionDto`, `NamedRelationDto`; `mapShiftTemplate` (camelCase, `id` stringified, `normalizeTime` on times, status normalisation), `mapRosterOption`.
- **Payload builders:** `toTemplatePayload` (snake_case write contract for templates) and `toShiftPayload` (snake_case write contract for `POST /shifts` — includes `roster_id`, `date`, `paid_break`, `employee_id`, `status:'scheduled'`).
- **Transport:** `fetchShiftTemplates` (GET), `fetchShiftTemplate` (GET one), `createShiftTemplate` (POST), `updateShiftTemplate` (PUT), `deleteShiftTemplate` (DELETE), `fetchRosterOptions` (**GET `/rosters`** per_page 50), `createShiftFromTemplate` (**POST `/shifts`**).
- **Hooks:**
  - `useShiftTemplates` (staleTime 15s, `keepPreviousData`)
  - `useShiftTemplate(id)` (enabled when id truthy)
  - `useRosterOptions(enabled)` (staleTime 60s)
  - `useCreateShiftTemplate`, `useUpdateShiftTemplate`, `useDeleteShiftTemplate` (on success: `removeQueries` + invalidate the `list`/`detail` keys)
  - `useCreateShiftFromTemplate` (**on success invalidates `['rosters']` and `['shifts']`** — the coupling into the scheduling cache).

### 3.5 Schemas (Zod)

[`schemas.ts`](resources/js/features/shift-templates/schemas.ts)

- `shiftTemplateFormSchema` — mirrors the backend contract: `name` required max 255; `description` trimmed max 1000; `startTime`/`endTime` `HH:mm` (via `isValidTime`); `breakMinutes` string-coerced int 0–1440; `isPaidBreak` bool; `defaultPositionId`/`branchId`/`departmentId` optional string→number; hex `color`; `status` enum. `.superRefine` rejects zero-length shifts and breaks ≥ span (uses `computeSpanMinutes`; overnight shifts allowed).
- `useTemplateFormSchema` — for the materialisation modal: `rosterId` + `date` required, times/break/paid default editable, optional `employeeId`/scope/notes, same span-vs-break superRefine.

### 3.6 Time Maths Library

[`lib/shift-time.ts`](resources/js/features/shift-templates/lib/shift-time.ts:1)

Pure, framework-agnostic helpers shared by the table, preview, and both schemas: `normalizeTime`, `isValidTime`, `timeToMinutes`, `minutesToTime`, `formatTimeLabel`, `formatTimeRange`, `computeSpanMinutes` (overnight-aware), `isOvernight`, `computePaidMinutes`, `formatDuration`, `formatPaidHours`, `describeBreak`, `buildTimelineSegments`, `TIMELINE_TICKS`.

### 3.7 Domain Types

[`types/shift-template.ts`](resources/js/types/shift-template.ts:1)

- `SHIFT_TEMPLATE_STATUSES` / `SHIFT_TEMPLATE_STATUS_LABELS` / `ShiftTemplateStatus`.
- `SHIFT_TEMPLATE_COLOR_OPTIONS` / `DEFAULT_SHIFT_TEMPLATE_COLOR`.
- `BREAK_MINUTE_PRESETS`.
- `ShiftTemplate` (camelCase, stringified `id`, denormalised `branchName`/`departmentName`/`positionName`).
- `ShiftTemplateListParams` (search/status/branchId/departmentId/positionId/perPage).
- `RosterOption` (roster week metadata + branch used by the materialisation modal).

---

## 4. End-to-End Data Flow

### 4.1 Template Lifecycle (CRUD → rendering)

```
[ShiftTemplatesListPage]
   │  useShiftTemplates({status,branchId,departmentId,perPage:100})
   ▼
[useShiftTemplates.ts]
   ├─ SHIFT_TEMPLATES_KEYS.list(params)          (React Query cache key)
   └─ fetchShiftTemplates()  ──GET──► /api/v1/shift-templates
                                        │ auth:sanctum + account.active + company.access
                                        ▼
                                  ShiftTemplateController@index
                                        │ authorize(viewAny)  → ShiftTemplatePolicy
                                        │ company_id forced to user's company (non-super-admin)
                                        ▼
                                  ShiftTemplateService::paginate(filters)
                                        │ when(company_id|branch_id|department_id|position_id|search|status)
                                        │ latest()->paginate()->withQueryString()
                                        ▼
                                  ShiftTemplateResource::collection  (embeds company/branch/department/position)
                                        │ {success, data: {data:[...], meta}}
                                        ▼
   mapShiftTemplate(dto) → camelCase domain ShiftTemplate[]
        │
        ▼
   ShiftTemplatesTable (DataTable)  ──►  columns (time/break/payable computed via lib/shift-time)
        │
        ├─ ShiftTemplateStatusBadge
        └─ TemplateActionsMenu  ─►  edit / duplicate / use / delete (delete only if company_admin)
```

### 4.2 Create / Edit / Duplicate

```
ShiftTemplateFormModal (RHF + zodResolver(shiftTemplateFormSchema))
   ├─ toDefaults(template, duplicateFrom)   ← edit seeds row; duplicate seeds with "(copy)" name + status 'active'
   ├─ useBranchOptions / useDepartmentOptions / usePositionOptions   (cross-feature option loads)
   ├─ ShiftTemplatePreview (live, via lib/shift-time)
   ▼
   useCreateShiftTemplate / useUpdateShiftTemplate
        └─ toTemplatePayload(values) ──POST/PUT──► /api/v1/shift-templates
                                                    ▼ authorize(create|update) + validation + transaction
                                                    ▼ ShiftTemplateResource
        └─ onSuccess: invalidate SHIFT_TEMPLATES_KEYS.list/detail → table refetches
```

### 4.3 Delete

```
TemplateActionsMenu → AlertDialog confirm → useDeleteShiftTemplate(id)
        └─ DELETE /api/v1/shift-templates/{id}  (authorize(delete); scheduler is 403/UI-hidden)
        └─ soft delete; onSuccess removeQueries + invalidate list
```

### 4.4 Materialisation (Template → Real Shift) — the key coupling

```
UseTemplateModal (opened with a ShiftTemplate)
   ├─ useRosterOptions(open)  ──GET──► /api/v1/rosters?per_page=50   (Roster module)
   ├─ useEmployees            ──GET──► /api/v1/employees            (Employee module)
   ├─ useBranchOptions / useDepartmentOptions / usePositionOptions   (Workspace modules)
   ├─ defaults seeded from template: startTime/endTime/breakMinutes/isPaidBreak/positionId/branchId/departmentId
   ▼
   useCreateShiftFromTemplate
        └─ toShiftPayload(values) ──POST──► /api/v1/shifts   (Shift module — NOT shift-templates)
                                             ├─ authorize(create) on ShiftPolicy
                                             ├─ roster_id + date placement
                                             ├─ start_time/end_time/break_minutes/paid_break/position_id/...
                                             └─ status:'scheduled'
        └─ onSuccess: invalidate ['rosters'] + ['shifts']   → roster grid / shift lists refetch
```

**Key point:** the template itself is *not* written by this flow; only a `Shift` row is created. The template acts purely as a seed for form defaults.

---

## 5. Coupling & Integration Points

| # | Coupled module | Direction | Mechanism | Nature |
|---|---|---|---|---|
| 1 | **Company / tenant** | ShiftTemplates → Company | `shift_templates.company_id` FK (`cascadeOnDelete`); `Company::shiftTemplates()` inverse | Strong (data + isolation) |
| 2 | **Subscription / Entitlements** | ShiftTemplates ← Company access | `company.access` middleware → `AccessStateService` (server clock, grace-period aware) | Strong (gate) — **not** plan-tier gated (no `Feature` enum entry) |
| 3 | **Branches** | ShiftTemplates ↔ Branches | `branch_id` FK (`nullOnDelete`); `BranchResource` embedded; `useBranchOptions` for filters/form | Strong (optional scoping + display) |
| 4 | **Departments** | ShiftTemplates ↔ Departments | `department_id` FK (`nullOnDelete`); `DepartmentResource`; `useDepartmentOptions` | Strong (optional scoping) |
| 5 | **Positions** | ShiftTemplates ↔ Positions | `position_id` FK = *default role*; `PositionResource`; `usePositionOptions` | Strong (defaults) |
| 6 | **Rosters** | ShiftTemplates → Rosters | Materialisation modal fetches roster weeks via `GET /rosters`; on shift creation invalidates `['rosters']` | Strong (read + cache invalidation) |
| 7 | **Shifts** | ShiftTemplates → Shifts | `POST /shifts` (ShiftController) materialises; `toShiftPayload`; invalidates `['shifts']` | Strong (writes into shift store) |
| 8 | **Employees** | ShiftTemplates → Employees | `useEmployees` in materialisation modal for optional assignment | Medium (optional assignee) |
| 9 | **Roster shift clipboard (conceptual)** | Rosters → ShiftTemplate-values | [`rosters/lib/shift-payload.ts`](resources/js/features/rosters/lib/shift-payload.ts:38) defines `ShiftTemplateValues`, `DEFAULT_SHIFT_TEMPLATE`, `toShiftTemplateValues`; used by `useShiftClipboard`, `usePublishedRosterMutations`, `QuickShiftDialog`, `RosterDetailPage` | Weak/architectural — reuses the *pattern* name, **no table coupling** |
| 10 | **Permissions/RBAC** | ShiftTemplates ← Spatie | `shift_template.*` permissions; Policy `belongsToCompany`; scheduler lacks delete | Strong |
| 11 | **Leave / Payroll** | — | **No direct coupling.** Leave Requests are a sibling Scheduling module sharing the same `company.access` group; payable-hours preview in the UI is an *estimation* only — no payroll integration is wired to templates | None today |

### 5.1 Coupling notes worth flagging

- **Server-side company forcing** happens in the controller (`company_id` overridden for non-super-admins), and **cross-company access is blocked twice**: once by the forced scope and once by `ShiftTemplatePolicy::belongsToCompany()`. The cross-company tests assert 403s for view/update/delete.
- **Delete semantics:** `softDeletes` + `nullOnDelete` on relations means deleting a branch/department/position **preserves** templates (FKs become null); deleting a **company** cascades to remove its templates; deleting a **template** does **not** affect shifts already created from it (confirmed in the delete confirmation copy and the test suite).
- **No `duration` column** — span and payable hours are derived on the fly by `lib/shift-time` and are duplicated on neither the table nor the preview. This keeps the schema minimal and the display rules single-sourced on the frontend.
- **Cache invalidation across features** is the concrete integration mechanism: creating a shift from a template invalidates the roster and shift query caches so the calendar updates immediately.

### 5.2 Feature-gating subtlety

`Feature` enum (see [`app/Enums/Feature.php`](app/Enums/Feature.php:16)) has `Roster`, `ShiftSwap`, `PayrollIntegration`, etc., but **no `shift_template` feature**. Shift Templates are available to any company with a valid trial/subscription on any plan tier; they are gated only by role permission (company_admin/scheduler) and by `company.access`. This is a deliberate architectural decision worth documenting: if product decides to gate templates to higher tiers, a `shift_template` feature would need to be added to the enum, seeder, and plans.

---

## 6. Role in the Broader Shift Scheduling System

```
                      ┌──────────────────────────────────────────────┐
                      │           company.access middleware          │  ← server-authoritative
                      │   (AccessStateService · trial/subscription)  │     access gate
                      └──────────────────────────────────────────────┘
                                           │
   ┌───────────────┐   defines   ┌─────────────────────┐   materialises   ┌───────────────┐
   │   Branches    │◄───────────►│                     │                 │   Rosters     │
   │  Departments  │◄───────────►│   SHIFT TEMPLATES   ├────────────────►│                │
   │   Positions   │◄───────────►│   (blueprint CRUD)  │   POST /shifts  │   Shifts      │
   └───────────────┘             └─────────────────────┘                 │  (employees)  │
         │                                                               └───────────────┘
         │  option lists (useBranch/Department/PositionOptions)                │
         └─────────────────────────────────────────────────────────────────────┘
```

- **Upstream:** Shift Templates consume the Workspace reference data (branches/departments/positions) for scoping and defaults, and the Company/Subscription layer for access.
- **Downstream:** Shift Templates feed the Roster/Shift layer — a template is a repeatable input that accelerates building rosters and standardises shift patterns (times, breaks, paid/unpaid, colour-coding on the calendar).
- **Horizontal:** It is a sibling of Leave Types/Leave Requests within Scheduling (same nav section, same access group) but has **no data dependency** on leave or payroll. Payable-hours estimation is cosmetic, not payroll-driven.
- **The clipboard pattern** (in rosters) is a lightweight, stateless echo of the same idea: reusable shift values. It keeps the roster grid usable without forcing every cell to reference the `shift_templates` table — a deliberate decoupling.

---

## 7. Recommendations / Observed Strengths

1. **Clean layering** — Controller → Service (transactional) → Model, with FormRequest validation, Policy authorisation, Resource serialisation, and a pure frontend maths library. Easy to test and extend.
2. **Defence in depth** — `company.access` (subscription) + forced `company_id` (controller) + `belongsToCompany` (policy) + role permissions (RBAC). Excellent tenant isolation.
3. **Correct soft-delete semantics** — templates survive relation deletion, and deleting templates never orphans shifts.
4. **No invented fields** — derived metrics live only in `lib/shift-time`, avoiding schema/display drift.
5. **Feature-gating gap (documented)** — if higher tiers should unlock templates, add a `shift_template` entry to the `Feature` enum + `FeatureSeeder` + `PlanFeatureSeeder` + a `feature:` middleware on the resource route.

---

## 8. File Index (Quick Reference)

**Backend**

| File | Line |
|---|---|
| [`routes/api.php`](routes/api.php:310) | `apiResource('shift-templates')` inside `company.access` group (227) |
| [`ShiftTemplateController`](app/Http/Controllers/Api/ShiftTemplateController.php:15) | CRUD |
| [`ShiftTemplateService`](app/Services/ShiftTemplateService.php:9) | paginate / create / update / delete |
| [`ShiftTemplate`](app/Models/ShiftTemplate.php:11) | model, relationships, `scopeActive` |
| [`ShiftTemplatePolicy`](app/Policies/ShiftTemplatePolicy.php:8) | permission + `belongsToCompany` |
| [`ShiftTemplateResource`](app/Http/Resources/ShiftTemplateResource.php:8) | serialisation |
| [`StoreShiftTemplateRequest`](app/Http/Requests/ShiftTemplate/StoreShiftTemplateRequest.php:7) | create validation |
| [`UpdateShiftTemplateRequest`](app/Http/Requests/ShiftTemplate/UpdateShiftTemplateRequest.php:7) | update validation |
| [`migration`](database/migrations/2026_07_27_000009_create_shift_templates_table.php:12) | table schema |
| [`ShiftTemplateFactory`](database/factories/ShiftTemplateFactory.php:15) | factory |
| [`RoleAndPermissionSeeder`](database/seeders/RoleAndPermissionSeeder.php:40) | `shift_template.*` permissions |
| [`ShiftTemplateManagementTest`](tests/Feature/ShiftTemplate/ShiftTemplateManagementTest.php:18) | 15 tests |

**Frontend**

| File | Line |
|---|---|
| [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:426) | route |
| [`nav-items.ts`](resources/js/Components/layout/nav-items.ts:53) | nav entry |
| [`ShiftTemplatesListPage`](resources/js/features/shift-templates/pages/ShiftTemplatesListPage.tsx:45) | page |
| [`ShiftTemplatesTable`](resources/js/features/shift-templates/components/ShiftTemplatesTable.tsx:195) | table |
| [`ShiftTemplateFormModal`](resources/js/features/shift-templates/components/ShiftTemplateFormModal.tsx:98) | create/edit/duplicate |
| [`ShiftTemplatePreview`](resources/js/features/shift-templates/components/ShiftTemplatePreview.tsx:64) | live preview |
| [`ShiftTemplateStatusBadge`](resources/js/features/shift-templates/components/ShiftTemplateStatusBadge.tsx:25) | badge |
| [`UseTemplateModal`](resources/js/features/shift-templates/components/UseTemplateModal.tsx:53) | materialisation |
| [`useShiftTemplates`](resources/js/features/shift-templates/hooks/useShiftTemplates.ts:1) | data layer |
| [`schemas.ts`](resources/js/features/shift-templates/schemas.ts) | zod schemas |
| [`lib/shift-time.ts`](resources/js/features/shift-templates/lib/shift-time.ts:1) | time maths |
| [`types/shift-template.ts`](resources/js/types/shift-template.ts:1) | domain types |
| [`rosters/lib/shift-payload.ts`](resources/js/features/rosters/lib/shift-payload.ts:38) | conceptual `ShiftTemplateValues` clipboard |
