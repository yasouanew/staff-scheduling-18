# Shift Templates Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Shift templates: `shift_templates`, branches, departments, positions, companies. Trace: Shift Templates UI → React state/form → API → Laravel → database → response → UI. Audit: List, Create, Edit, Delete, Details. Verify: name, description, time fields, branch, department, position, status, break, colour, permission gating, CRUD, loading/error/success, refresh.
> **Method:** Backend/database/API is the **source of truth**. Every field was compared between backend (migration, model, validation, service, controller, resource, routes, policy, tests) and frontend (types, hooks, schemas, time lib, components, page). Only the frontend was changed — no backend code, migrations, business rules, or API payloads were touched. **Roster is out of scope.**
> **Reference docs:** `.roo/ui-ux.md` (architectural reference — not the ultimate source of truth), `docs/frontend-alignment/system-map.md` (M-03), `docs/task-11-12-availability-shift-templates-audit.md`.

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `shift_templates` table + `ShiftTemplate` model

| Column | Type / Validation | Notes |
|---|---|---|
| `id` | bigIncrements | |
| `company_id` | foreignId → `companies`, **`cascadeOnDelete`** | Required ownership. Set server-side on create. |
| `branch_id` | foreignId → `branches`, nullable `nullOnDelete` | Optional scope |
| `department_id` | foreignId → `departments`, nullable `nullOnDelete` | Optional scope |
| `position_id` | foreignId → `positions`, nullable `nullOnDelete` | Default position |
| `name` | string, required | max 255 |
| `description` | text, nullable | max 1000 |
| `start_time` | `time`, required | `H:i` (24-hour) |
| `end_time` | `time`, required | `H:i` (24-hour) |
| `break_minutes` | unsignedInteger, default `30` | 0–1440 |
| `color` | string(7), nullable, default `#10B981` | regex `^#([A-Fa-f0-9]{6})$` |
| `is_paid_break` | boolean, default `false` | |
| `status` | string, default `'active'` | `in:active,inactive` |
| `created_by` | foreignId → `users`, nullable `nullOnDelete` | Set server-side on create |
| `created_at` / `updated_at` | timestamps | |
| `deleted_at` | softDeletes | |

**There is NO `duration` column** — duration is derived client-side from `start_time`/`end_time` via the shared time helpers.

Model `$fillable`: `company_id, branch_id, department_id, position_id, name, description, start_time, end_time, break_minutes, color, is_paid_break, status, created_by`. Relations: `company()`, `branch()`, `department()`, `position()`, `creator()`. `scopeActive()` filters `status = 'active'`.

### 1.2 API surface (all nested under authenticated `api/v1`)

`Route::apiResource('shift-templates', ShiftTemplateController::class)` ([`routes/api.php`](routes/api.php:306)):

- `GET /shift-templates` → index, paginated
- `POST /shift-templates` → store, 201
- `GET /shift-templates/{shiftTemplate}` → show
- `PUT /shift-templates/{shiftTemplate}` → update
- `DELETE /shift-templates/{shiftTemplate}` → destroy

Index supports server-side filters: `search`, `status`, `company_id`, `branch_id`, `department_id`, `position_id`, `per_page` (default 15 in the service). Non-super-admin users are forcibly scoped to their own `company_id`. All list/show responses load `['company','branch','department','position']`.

> ⚠️ **System-map discrepancy (documented, trust the implementation):** [`system-map.md`](docs/frontend-alignment/system-map.md:216) lists `POST /shift-templates/{shiftTemplate}/apply` and `GET /roster-options` as API routes. **These routes do not exist.** The actual implementation reuses `POST /shifts` (shift creation) for "apply a template" and `GET /rosters` (per_page 50) for roster options — see §3.2. Per task rules, the actual codebase/API is the source of truth.

### 1.3 Validation

**Store** ([`StoreShiftTemplateRequest.php`](app/Http/Requests/ShiftTemplate/StoreShiftTemplateRequest.php:24)):
- `company_id` — nullable, exists:companies (server enforces ownership)
- `name` — required, string, max:255
- `description` — nullable, string, max:1000
- `start_time` / `end_time` — required, `date_format:H:i`
- `break_minutes` — nullable, integer, min:0, max:1440
- `color` — nullable, string, regex `^#([A-Fa-f0-9]{6})$`
- `is_paid_break` — nullable, boolean
- `status` — nullable, `in:active,inactive`

**Update** ([`UpdateShiftTemplateRequest.php`](app/Http/Requests/ShiftTemplate/UpdateShiftTemplateRequest.php:24)): same rules with `name`/`start_time`/`end_time` marked `sometimes`; **no** `company_id`.

### 1.4 `ShiftTemplateResource` (response shape)

`id`, `company_id`, `branch_id`, `department_id`, `position_id`, `name`, `description`, `start_time`, `end_time`, `break_minutes`, `color`, `is_paid_break`, `status`, `created_by`, relations `company`/`branch`/`department`/`position` (whenLoaded), `created_at`, `updated_at`.

### 1.5 Permissions

[`ShiftTemplatePolicy.php`](app/Policies/ShiftTemplatePolicy.php:8): `before()` grants super_admin all abilities; `viewAny`/`create` = permission; `view`/`update`/`delete` = permission **+ `belongsToCompany`** (403 cross-company).

[`RoleAndPermissionSeeder.php`](database/seeders/RoleAndPermissionSeeder.php:88) grants:
- `company_admin` — all `shift_template.*` (view/create/edit/delete)
- `scheduler` — `shift_template.view/create/edit` (**NO `shift_template.delete`** → backend would 403)
- `employee` — none
- `super_admin` — all via policy `before()`

**Frontend rule:** the delete action must be hidden for schedulers (see §4.2).

---

## 2. Frontend State After Alignment

The Shift Templates frontend data layer (`types`, `hooks`, `schemas`, `lib/shift-time`) was **already fully backend-aligned** before this task — no obsolete fields, no missing backend fields, no field renames, no data-type or option-list corrections were needed. The single misalignment was **M-03 — backend with no UI** (no page, route, or nav). This task built that missing UI.

### 2.1 Data layer (pre-existing, verified aligned)

- [`types/shift-template.ts`](resources/js/types/shift-template.ts) — `ShiftTemplate` (id string, companyId, branchId, departmentId, positionId, name, description, startTime, endTime, breakMinutes, isPaidBreak, color, status, branchName/departmentName/positionName, createdAt, updatedAt), `SHIFT_TEMPLATE_STATUSES=['active','inactive']`, `SHIFT_TEMPLATE_COLOR_OPTIONS` (9 hex), `DEFAULT_SHIFT_TEMPLATE_COLOR`, `BREAK_MINUTE_PRESETS`, `RosterOption`.
- [`hooks/useShiftTemplates.ts`](resources/js/features/shift-templates/hooks/useShiftTemplates.ts) — `useShiftTemplates` (server-side status/branch/department/position filters), `useShiftTemplate`, `useRosterOptions`, `useCreateShiftTemplate`, `useUpdateShiftTemplate`, `useDeleteShiftTemplate`, `useCreateShiftFromTemplate`. `toTemplatePayload` maps camelCase → `name, description??null, start_time, end_time, break_minutes, is_paid_break, position_id??null, branch_id??null, department_id??null, color??null, status`. `toShiftPayload` maps to the shift-creation contract (`roster_id, date, start_time, end_time, break_minutes, paid_break, employee_id??null, position_id??null, department_id??null, branch_id??null, notes??null, status:'scheduled'`).
- [`schemas.ts`](resources/js/features/shift-templates/schemas.ts) — `shiftTemplateFormSchema` + `useTemplateFormSchema`, both with `superRefine` rejecting zero-length shifts and breaks ≥ shift span; `isPaidBreak` is `z.boolean()`.
- [`lib/shift-time.ts`](resources/js/features/shift-templates/lib/shift-time.ts) — pure time helpers (normalize, to/from minutes, span, overnight, paid minutes, duration, break description, timeline segments). **Duration is derived here, never sent to the backend.**

### 2.2 Components (pre-existing)

- [`ShiftTemplatesTable.tsx`](resources/js/features/shift-templates/components/ShiftTemplatesTable.tsx) — reusable `DataTable` with search/sort/pagination/column visibility + row actions menu (Use / Edit / Duplicate / Delete).
- [`ShiftTemplatePreview.tsx`](resources/js/features/shift-templates/components/ShiftTemplatePreview.tsx) — live timeline preview of start/end/break/colour.
- [`ShiftTemplateStatusBadge.tsx`](resources/js/features/shift-templates/components/ShiftTemplateStatusBadge.tsx).

---

## 3. Built This Task (M-03 fix)

### 3.1 New files

- [`ShiftTemplateFormModal.tsx`](resources/js/features/shift-templates/components/ShiftTemplateFormModal.tsx) — create / edit / duplicate drawer (Radix Dialog right slide-over, `max-w-xl`). Uses `shiftTemplateFormSchema`, `useBranchOptions` / `useDepartmentOptions` / `usePositionOptions` for real option lists, `useCreateShiftTemplate` / `useUpdateShiftTemplate`, live `ShiftTemplatePreview`, colour swatches, break presets (`setValue('breakMinutes', String(preset))`), and a `Controller` boolean toggle for `isPaidBreak`. Duplicate appends `" (copy)"` to the name and forces `status:'active'`. Empty defaults: `name:''`, `startTime:'09:00'`, `endTime:'17:00'`, `breakMinutes:'30'`, `isPaidBreak:false`, `color:DEFAULT_SHIFT_TEMPLATE_COLOR`, `status:'active'`.
- [`UseTemplateModal.tsx`](resources/js/features/shift-templates/components/UseTemplateModal.tsx) — create-shift-from-template drawer. Uses `useTemplateFormSchema`, `useRosterOptions(open)` (`GET /rosters` per_page 50), `useEmployees({status:'active',perPage:100})`, `useBranchOptions` / `useDepartmentOptions` / `usePositionOptions`, and `useCreateShiftFromTemplate` (`POST /shifts`, invalidates `['rosters']` + `['shifts']`). Seeds times/break/paid/scope from the template on open; date defaults to today; roster/employee/notes start empty. `isPaidBreak` is a `Controller` boolean toggle (fixed this task, see §4.3).
- [`ShiftTemplatesListPage.tsx`](resources/js/features/shift-templates/pages/ShiftTemplatesListPage.tsx) — the `/shift-templates` page: 3 `StatCard`s (Total / Active / Scoped), branch + department + status filter toolbar (server-driven via `useShiftTemplates({status, branchId, departmentId, perPage:100})`), error state with refetch, `ShiftTemplatesTable` wired to edit / duplicate / use / delete, and the three modals. Delete gated by role (see §4.2).

### 3.2 Route + nav wiring

- [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:424) — added `import ShiftTemplatesListPage from '@/features/shift-templates/pages/ShiftTemplatesListPage';` and `<Route path="/shift-templates" element={<ShiftTemplatesListPage />} />` inside the `RoleRoute roles={['company_admin', 'scheduler']}` block.
- [`nav-items.ts`](resources/js/Components/layout/nav-items.ts:52) — added `{ label: 'Shift Templates', to: '/shift-templates', icon: CalendarRange, section: 'Scheduling', roles: COMPANY_ROLES }`.

**Route discrepancy (documented, trust implementation):** the "apply a template" flow does **not** call a dedicated apply endpoint; it calls `POST /shifts` with the roster/date/times/break/scope/notes and `status:'scheduled'`, and roster options come from `GET /rosters` (per_page 50). [`system-map.md`](docs/frontend-alignment/system-map.md:216) is stale on this point.

---

## 4. Field-by-field alignment (backend → frontend)

| Backend | Frontend | State |
|---|---|---|
| `name` (required, max 255) | `name` in `shiftTemplateFormSchema` (required, max 255) | ✅ Aligned |
| `description` (nullable, max 1000) | `description` (optional, max 1000) | ✅ Aligned |
| `start_time` (`H:i` required) | `startTime` (`type="time"`, required, `isValidTime`) | ✅ Aligned |
| `end_time` (`H:i` required) | `endTime` (`type="time"`, required, `isValidTime`) | ✅ Aligned |
| `break_minutes` (int 0–1440) | `breakMinutes` string→number, refine 0–1440 + `< span` | ✅ Aligned |
| `is_paid_break` (bool) | `isPaidBreak` `z.boolean()` via `Controller` toggle | ✅ Aligned (bug fixed, §4.3) |
| `color` (hex 7, nullable) | `color` regex `^#([A-Fa-f0-9]{6})$`, swatch picker | ✅ Aligned |
| `status` (`active`/`inactive`) | `status` enum `SHIFT_TEMPLATE_STATUSES` | ✅ Aligned |
| `branch_id` (nullable FK) | `branchId` via `useBranchOptions()` | ✅ Aligned |
| `department_id` (nullable FK) | `departmentId` via `useDepartmentOptions()` | ✅ Aligned |
| `position_id` (nullable FK) | `defaultPositionId` via `usePositionOptions()` | ✅ Aligned |
| `company_id` (required FK) | server-side only; non-super-admin scoped by backend | ✅ Aligned (not editable) |
| `created_by` (nullable FK) | server-side only | ✅ Aligned (not editable) |
| *(no `duration` column)* | derived client-side in `lib/shift-time.ts` | ✅ Aligned (never sent) |

No obsolete fields were removed and no backend-supported fields were missing from the forms.

### 4.1 Fields verified as correct
- **Time fields:** `H:i` 24-hour input with `type="time"`; overnight shifts allowed (end before start → derived overnight), zero-length rejected.
- **Relationship fields:** branch / department / position use the real option hooks (`useBranchOptions` / `useDepartmentOptions` / `usePositionOptions`) — no hardcoded option lists.
- **Duration:** not a field — derived client-side only.

### 4.2 Permission gating (delete hidden for scheduler)
`ShiftTemplatesListPage` derives `canDelete = normalizeWebRole(session.data) === 'company_admin'` and passes it to the table; `ShiftTemplatesTable` renders the delete item only when `canDelete` (default true). Schedulers see Use / Edit / Duplicate but **no Delete**, matching the backend permission set (scheduler lacks `shift_template.delete` → 403 otherwise).

### 4.3 Bug fixed during verification
`UseTemplateModal` originally bound `isPaidBreak` to a `<select>` whose `<option>` values are strings (`"true"` / `"false"`) via `register()`, but the schema declares `isPaidBreak: z.boolean()`, which does not coerce strings — the form would fail validation on submit. Replaced with a `Controller`-driven Paid / Unpaid toggle button set (matching `ShiftTemplateFormModal`) that writes real booleans.

---

## 5. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Exit 0 |
| `npx vite build` | ✅ Exit 0 (3859 modules, built in ~34s) |
| `php.exe vendor/bin/phpunit --filter "ShiftTemplate" --colors=never` | ✅ 15 tests, 34 assertions, OK |

---

## 6. References

- `.roo/ui-ux.md` — architectural reference (not ultimate source of truth)
- `docs/frontend-alignment/system-map.md` — M-03 (line 453) + stale route list (line 216) + P1 action (line 514)
- `docs/task-11-12-availability-shift-templates-audit.md` — feature audit
- Backend: [`2026_07_27_000009_create_shift_templates_table.php`](database/migrations/2026_07_27_000009_create_shift_templates_table.php), [`ShiftTemplate.php`](app/Models/ShiftTemplate.php), [`ShiftTemplateController.php`](app/Http/Controllers/Api/ShiftTemplateController.php), [`ShiftTemplateService.php`](app/Services/ShiftTemplateService.php), [`StoreShiftTemplateRequest.php`](app/Http/Requests/ShiftTemplate/StoreShiftTemplateRequest.php), [`UpdateShiftTemplateRequest.php`](app/Http/Requests/ShiftTemplate/UpdateShiftTemplateRequest.php), [`ShiftTemplateResource.php`](app/Http/Resources/ShiftTemplateResource.php), [`ShiftTemplatePolicy.php`](app/Policies/ShiftTemplatePolicy.php), [`routes/api.php`](routes/api.php:306), [`RoleAndPermissionSeeder.php`](database/seeders/RoleAndPermissionSeeder.php:88)
- Frontend: [`useShiftTemplates.ts`](resources/js/features/shift-templates/hooks/useShiftTemplates.ts), [`schemas.ts`](resources/js/features/shift-templates/schemas.ts), [`shift-template.ts`](resources/js/types/shift-template.ts), [`shift-time.ts`](resources/js/features/shift-templates/lib/shift-time.ts), [`ShiftTemplatesTable.tsx`](resources/js/features/shift-templates/components/ShiftTemplatesTable.tsx), [`ShiftTemplatePreview.tsx`](resources/js/features/shift-templates/components/ShiftTemplatePreview.tsx), [`ShiftTemplateFormModal.tsx`](resources/js/features/shift-templates/components/ShiftTemplateFormModal.tsx), [`UseTemplateModal.tsx`](resources/js/features/shift-templates/components/UseTemplateModal.tsx), [`ShiftTemplatesListPage.tsx`](resources/js/features/shift-templates/pages/ShiftTemplatesListPage.tsx), [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:424), [`nav-items.ts`](resources/js/Components/layout/nav-items.ts:52)
