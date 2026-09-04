# Employees Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Employees (`/employees`): list/directory, create, edit, deactivate/delete, invitation, and the employee profile fields (identifiers, contact information, personal details, employment type, status, photo). **Roster is out of scope.**
> **Method:** Backend/database/API is the **source of truth**. Every field was compared between backend (migrations, models, requests, controller, service, resources, routes, policy) and frontend (types, hooks, schemas, defaults, modals, page, table, status badge). Only the frontend was changed — no backend code, migrations, or business rules were touched.

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `employees` table + `Employee` model

`Employee` model `$fillable` + migration columns:

| Field | Validation (`Store` / `Update` / `Invite`) | Notes |
|---|---|---|
| `company_id` | nullable exists (forced server-side for non-super-admin) | Never sent by the frontend |
| `user_id` | nullable exists | Links to the login account; auto-created on invite |
| `department_id` | nullable exists | Optional — assignable later |
| `position_id` | nullable exists | Optional — assignable later |
| `branch_id` | nullable exists | Assignment consumes branch employee capacity |
| `first_name` | required string max:255 | `sometimes` required on update |
| `last_name` | required string max:255 | `sometimes` required on update |
| `employee_number` | nullable string max:50 | Company-assigned staff identifier |
| `employment_type` | `Store`/`Invite`: `in:full_time,part_time,casual,contractor`; `Update`: also `contract` | Backend default `full_time` |
| `dob` | nullable date `before:today` | |
| `gender` | nullable `in:male,female,other,prefer_not_to_say` | |
| `address` | nullable string max:1000 | |
| `emergency_contact` | nullable string max:255 | |
| `emergency_phone` | nullable string max:50 | |
| `hire_date` | nullable date | |
| `termination_date` | nullable date `after_or_equal:hire_date` | |
| `hourly_rate` | nullable numeric 0..99999999.99 | |
| `photo` | `Store`: nullable image jpg,jpeg,png,webp max:2048 | Set via dedicated photo upload route |
| `status` | `Store`: `in:active,inactive,terminated`; `Update`: `in:active,pending,inactive,terminated` | Backend default `active` |

### 1.2 Linked `users` table fields relevant to employees

- `phone` — nullable string max:50. **Settable only via `InviteEmployeeRequest`** (there is **no** `phone` rule in `UpdateEmployeeRequest`), or when re-sending an invitation. Exposed in the API through `UserResource` (`'phone' => $this->phone`).
- `name` — auto-derived from `first_name + ' ' + last_name` on invite.
- `email` — login identity; required & unique on invite.
- `role` + Spatie role — `in:company_admin,scheduler,employee` on invite.
- `status` — `active/inactive/suspended/invited` (a new invite creates `status = 'invited'`).

### 1.3 `EmployeeResource` (what the API actually returns)

`id`, `company_id`, `user_id`, `department_id`, `position_id`, `branch_id`, `first_name`, `last_name`, `full_name`, `employee_number`, `employment_type`, `dob` (toDateString), `gender`, `address`, `emergency_contact`, `emergency_phone`, `hire_date`, `termination_date`, `hourly_rate`, `photo`, `photo_url`, `status`, plus nested `company`, `user`, `department`, `position`, `branch`, `invitation` (each `whenLoaded`), and `created_at` / `updated_at`.

### 1.4 `EmployeeInvitationResource` (nested under `invitation`)

`id`, `employee_id`, `company_id`, `email`, `role`, `channel`, `status` (`pending/expired/accepted`), `last_sent_at`, `expires_at`, `created_at`.

### 1.5 Relationships

- `Employee` `belongsTo` `Company`, `User`, `Department`, `Position`, `Branch`; `hasOne` `Invitation`; `hasMany` `Availability`, `Shift`, `LeaveRequest`.
- `User` `hasOne` `Employee`; `belongsTo` `Company`, `Branch`.
- The `invitation` relation drives the row menu's **Send invite / Resend invite** state.

### 1.6 Permissions (Spatie roles + `EmployeePolicy`)

- `super_admin` — `before()` grants **all** employee abilities.
- `company_admin` — viewAny/view/create/update/delete scoped to their own company via `belongsToCompany`.
- `scheduler` — **view-only** (viewAny/view), no create/update/delete/transfer.
- `employee` — none of these permissions.
- `EmployeeController::index` forces `company_id = $request->user()->company_id` for non-super-admins → **company isolation is server-side**; the frontend never sends `company_id`.

### 1.7 API surface

- `GET /employees` → paginated `EmployeeResource` (`search`, `branch_id`, `department_id`, `status`, `per_page`; scoped to own company)
- `POST /employees` → `StoreEmployeeRequest` (create + linked user + invitation email via `EmployeeService::create`)
- `GET /employees/{employee}` → `EmployeeResource`
- `PUT /employees/{employee}` → `UpdateEmployeeRequest`
- `DELETE /employees/{employee}` → delete (soft delete)
- `POST /employees/{employee}/invite` → `SendInvitationRequest` (send/re-send onboarding invitation)
- `DELETE /employees/{employee}/invitation` → `EmployeeInvitationController::destroy`
- `POST /employees/{employee}/role` → `AssignRoleRequest`
- `POST /employees/{employee}/department` → `AssignAttributeRequest`
- `POST /employees/{employee}/position` → `AssignAttributeRequest`
- `POST /employees/{employee}/photo` → `UploadPhotoRequest` (image jpg,jpeg,png,webp max:2048) → `EmployeeService::uploadPhoto` (deletes old photo, stores to `employees/photos` on the public disk)
- `POST /employees/{employee}/transfer` → `TransferEmployeeRequest`

Routes live in the `company.access` middleware group (`Route::apiResource('employees')` + the dedicated endpoints above).

---

## 2. Frontend Before → After

### 2.1 [`resources/js/types/employee.ts`](resources/js/types/employee.ts)

- **`EmployeeStatus`** union extended from `'active' | 'pending' | 'inactive'` to include **`'terminated'`** (the backend accepts `terminated` on store and `active,pending,inactive,terminated` on update). `EMPLOYEE_STATUSES` + `EMPLOYEE_STATUS_LABELS` now include `terminated`.
- **`EmploymentType`** union extended from `'full_time' | 'part_time' | 'casual' | 'contract'` to include **`'contractor'`** (the backend accepts `contractor` on store/invite/update). `EMPLOYMENT_TYPES` + `EMPLOYMENT_TYPE_LABELS` now include `contractor`.
- **`Employee`** interface gained **9 previously-missing required profile fields**, all `string | null`: `employeeNumber`, `phone`, `dob`, `gender`, `address`, `emergencyContact`, `emergencyPhone`, `hireDate`, `terminationDate` — mirroring `EmployeeResource` 1:1.
- **`CreateEmployeeInput`** gained `phone: string`, `employmentType: EmploymentType`, `hourlyRate: string`.
- **`UpdateEmployeeInput`** gained the 9 profile fields (`employeeNumber`, `dob`, `gender`, `address`, `emergencyContact`, `emergencyPhone`, `hireDate`, `terminationDate`) and `employmentType` widened to include `contractor`. **`phone` was deliberately NOT added** to the update payload — it lives on the linked `users` record and `UpdateEmployeeRequest` has no rule for it, so it is only settable when (re)sending an invitation.

### 2.2 [`resources/js/features/employees/hooks/useEmployees.ts`](resources/js/features/employees/hooks/useEmployees.ts)

- **`EmployeeUserDto`** gained `phone?: string | null` so `mapEmployee` can read `dto.user?.phone` (exposed by `UserResource`).
- **`normalizeStatus`** added `case 'terminated': return 'terminated';`.
- **`normalizeEmploymentType`** added `case 'contractor': return 'contractor';`.
- **`mapEmployee`** now maps all 9 profile fields from the resource (`employee_number`, `user.phone`, `dob`, `gender`, `address`, `emergency_contact`, `emergency_phone`, `hire_date`, `termination_date`).
- **`createEmployee`** payload no longer hardcodes `employment_type: 'full_time'` — it sends the selected `employment_type`, plus `hourly_rate` (numeric, or `null` when blank) and `phone` (trimmed, or `null` when blank), matching `InviteEmployeeRequest`.
- **`updateEmployee`** payload now sends `employee_number`, `dob`, `gender`, `address`, `emergency_contact`, `emergency_phone`, `hire_date`, `termination_date` (each `null` when blank) — matching `UpdateEmployeeRequest`. `phone` is intentionally omitted.
- **Added** `uploadEmployeePhoto(employeeId, file)` transport (FormData multipart → `POST /employees/{id}/photo`) and a `useUploadEmployeePhoto` hook that invalidates `EMPLOYEES_KEYS.all` and writes the returned employee into the detail cache.

### 2.3 [`resources/js/features/shifts/hooks/useShifts.ts`](resources/js/features/shifts/hooks/useShifts.ts)

The scheduling slice constructs its own `Employee` objects, so it must satisfy the widened `Employee` interface:

- `normalizeEmployeeStatus` handles `'terminated'` (returns `'terminated'`).
- `normalizeEmploymentType` handles `'contractor'` (returns `'contractor'`).
- `mapEmployee` now fills the 9 profile fields as `null` (shift roster payloads do not carry them).

### 2.4 [`resources/js/Components/common/StatusBadge.tsx`](resources/js/Components/common/StatusBadge.tsx)

- `STATUS_MAP` gained `terminated: { label: 'Terminated', tone: 'danger', dot: 'bg-danger' }` so a terminated employee renders a red status badge instead of falling back to an unknown-tone.

### 2.5 [`resources/js/features/employees/components/AddEmployeeModal.tsx`](resources/js/features/employees/components/AddEmployeeModal.tsx)

- **Schema** — `departmentId` / `positionId` / `branchId` are now `z.string()` (optional, matching backend nullable `*_id`); added `phone: z.string()`, `employmentType: z.enum(['full_time','part_time','casual','contractor'])`, `hourlyRate: z.string()`.
- Added `const CREATE_EMPLOYMENT_TYPES = EMPLOYMENT_TYPES.filter((type) => type !== 'contract');` — the invite/store endpoint accepts `full_time,part_time,casual,contractor` but **not** `contract`, so the create form must not offer `contract`.
- **Defaults** added `phone: ''`, `employmentType: 'full_time'`, `hourlyRate: ''`.
- **Form fields added:** Phone (tel), Employment type (select fed by `CREATE_EMPLOYMENT_TYPES`), Hourly rate (number, `min=0 step=0.01`).
- Added helper text under Position: "Department and position are optional — you can assign them later."

### 2.6 [`resources/js/features/employees/components/EditEmployeeModal.tsx`](resources/js/features/employees/components/EditEmployeeModal.tsx)

- **Schema** — `employmentType` enum gained `'contractor'`; `status` enum gained `'terminated'`; added `employeeNumber`, `dob`, `gender`, `address`, `emergencyContact`, `emergencyPhone`, `hireDate`, `terminationDate` (all `z.string()`).
- Added `GENDERS` constant (`''` Not specified, `male`, `female`, `other`, `prefer_not_to_say`) matching the backend `in:male,female,other,prefer_not_to_say`.
- **Defaults + reset hydration** now include all 9 profile fields (`''` when unset).
- **Phone is read-only** in edit (displayed as a static block) — the backend update endpoint has no `phone` rule, so editing phone is only possible by re-sending an invitation.
- **Added Staff number** input (`employee_number`) before Department.
- **Added a Personal details section** before Employment type: Date of birth (date input `max=today`), Gender (select), Address (textarea), Emergency contact, Emergency phone, Hire date, Termination date.
- **Added photo upload:** avatar preview (`Avatar` + `AvatarImage` from `avatarUrl` / `AvatarFallback` initials via `getInitials`), a "Change photo" button triggering a hidden file input (`accept="image/jpeg,image/png,image/webp"`), and `handlePhotoChange` that calls `useUploadEmployeePhoto` and surfaces the 2 MB / format error message.

### 2.7 No-change confirmations (verified aligned)

- [`resources/js/features/employees/pages/EmployeeListPage.tsx`](resources/js/features/employees/pages/EmployeeListPage.tsx) — directory list, server-side branch/department/status filters (`branch_id`, `department_id`, `status`, `per_page:100`), KPI cards, `DataTable`, `EditEmployeeModal` + `SendInviteModal` wiring.
- [`resources/js/features/employees/components/EmployeeRowActions.tsx`](resources/js/features/employees/components/EmployeeRowActions.tsx) — Edit / Send (or Resend) invite / actions.
- [`resources/js/features/employees/components/SendInviteModal.tsx`](resources/js/features/employees/components/SendInviteModal.tsx) — role select fed by `EMPLOYEE_ROLES` (`in:company_admin,scheduler,employee`), email editable to correct typos; channel preview (web vs mobile) derived from the chosen role — matches the backend's `channelForRole`.
- [`resources/js/types/employee.ts`](resources/js/types/employee.ts) `SendInvitationInput` / `SendInvitationResult` — match `SendInvitationRequest` / invitation response.
- [`resources/js/features/invitations/hooks/useInvitation.ts`](resources/js/features/invitations/hooks/useInvitation.ts) — public accept-invitation flow (out of the admin surface; verified the shapes line up with `EmployeeInvitationResource`).

---

## 3. Field-by-field comparison

### 3.1 Create employee (AddEmployeeModal → `POST /employees`)

| Backend field | Was in frontend? | Action |
|---|---|---|
| `first_name` / `last_name` | Yes (via `name`) | OK |
| `email` | Yes | OK |
| `role` | Yes | OK |
| `department_id` | Yes | **Fixed** — now optional (`z.string()`), helper text added |
| `position_id` | Yes | **Fixed** — now optional (`z.string()`), helper text added |
| `branch_id` | Yes | OK (still optional; capacity checks server-side) |
| `phone` | **Missing** | **Added** — tel input; `null` when blank |
| `employment_type` | **Hardcoded `'full_time'`** | **Fixed** — select using `CREATE_EMPLOYMENT_TYPES` (excludes `contract`); sent from payload |
| `hourly_rate` | **Missing** | **Added** — number input; numeric or `null` |
| `status` | n/a (default `active`) | OK |

### 3.2 Edit employee (EditEmployeeModal → `PUT /employees/{id}`)

| Backend field | Was in frontend? | Action |
|---|---|---|
| `first_name` / `last_name` | Yes | OK |
| `department_id` / `position_id` / `branch_id` | Yes | OK (optional; numeric ids) |
| `employee_number` | **Missing** | **Added** — Staff number input |
| `employment_type` | `contract` only | **Fixed** — union + schema now include `contractor` |
| `dob` | **Missing** | **Added** — date input (`max=today`, matches `before:today`) |
| `gender` | **Missing** | **Added** — select over the 4 backend values |
| `address` | **Missing** | **Added** — textarea |
| `emergency_contact` | **Missing** | **Added** |
| `emergency_phone` | **Missing** | **Added** |
| `hire_date` | **Missing** | **Added** |
| `termination_date` | **Missing** | **Added** (server validates `after_or_equal:hire_date`) |
| `hourly_rate` | Yes | OK |
| `status` | `active/pending/inactive` | **Fixed** — now includes `terminated` |
| `photo` | **Missing** | **Added** — avatar preview + "Change photo" (multipart `POST .../photo`) |
| `phone` | n/a | **Read-only** by design — `UpdateEmployeeRequest` has no `phone` rule (see §5) |

### 3.3 Read / list / details

| Backend field | Was in frontend? | Action |
|---|---|---|
| `full_name` / `first_name` / `last_name` | Yes (`name`) | OK |
| `user.email` | Yes (`email`) | OK |
| `user.phone` | **Missing** | **Added** — `phone` mapped from `dto.user?.phone` |
| `position` / `department` / `branch` | Yes | OK |
| `employment_type` | Yes | OK (`contractor` now maps) |
| `hourly_rate` | Yes | OK |
| `status` | `active/pending/inactive` | **Fixed** — `terminated` now normalized + badged |
| `invitation` | Yes | OK — drives Send/Resend invite |
| `employee_number` + personal details | **Missing** | **Added** — available on the domain type for future/details surfaces |
| `photo_url` | Yes (`avatarUrl`) | OK |

### 3.4 Removed / corrected obsolete frontend behaviour

| Item | Why |
|---|---|
| Hardcoded `employment_type: 'full_time'` in `createEmployee` | Invented the value; now the user's selection is sent (matching the backend default only when left untouched) |
| Edit form omitting `terminated` / `contractor` | The backend accepts them; the UI must too |
| Edit form having no way to set identifiers / personal details / photo | Backend fields existed but were unreachable in the UI |
| A `phone` field on the update path | Not a backend field on update — removed from the payload to avoid sending an invalid request |

---

## 4. Workflow verification

### 4.1 Create (UI → API → Laravel → DB → response → UI)

1. **UI:** `AddEmployeeModal` validates (name, email, role, optional department/position/branch, phone, employment type, hourly rate) and calls `useCreateEmployee`.
2. **API:** `createEmployee` → `POST /api/v1/employees` with snake_case payload (`first_name`, `last_name`, `email`, `role`, `department_id`/`position_id`/`branch_id` as numbers or `null`, `phone` (or `null`), `employment_type`, `hourly_rate` (or `null`)).
3. **Laravel:** `StoreEmployeeRequest` validates (employment_type `in:full_time,part_time,casual,contractor`; department/position/branch nullable exists; phone max:50; hourly_rate numeric 0..99999999.99) → `EmployeeService::create` creates the linked `User` (status `invited`, role assigned), the `Employee` (status `active`, employment_type default `full_time` when omitted), sends the invitation email, and loads company/user/department/position/branch.
4. **Response:** `ApiResponse::successResponse` → `EmployeeResource` (all fields incl. `user.phone`).
5. **UI refresh:** `useEmployees` invalidates `EMPLOYEES_KEYS.all` on success → directory refetches → new row appears with badge/type/role as submitted.

### 4.2 Edit (UI → API → Laravel → DB → response → UI)

1. **UI:** `EditEmployeeModal` hydrates from the selected employee (`reset`), including the 9 profile fields; phone shown read-only.
2. **API:** `updateEmployee` → `PUT /api/v1/employees/{id}` with `first_name`, `last_name`, `department_id`/`position_id`/`branch_id`, `employment_type` (incl. `contractor`), `hourly_rate`, `status` (incl. `terminated`), `employee_number`, `dob`, `gender`, `address`, `emergency_contact`, `emergency_phone`, `hire_date`, `termination_date` — each optional field `null` when blank.
3. **Laravel:** `UpdateEmployeeRequest` validates (`contract`+`contractor` employment types, `active/pending/inactive/terminated` status, `dob before:today`, `gender in:...`, `termination_date after_or_equal:hire_date`; no `phone` rule) → `EmployeeService::update` persists.
4. **Response:** updated `EmployeeResource`.
5. **UI refresh:** `useUpdateEmployee` invalidates the list and writes the returned employee into the detail cache → row/avatar/profile refresh.

### 4.3 Invitation

- **Send / Resend:** `SendInviteModal` → `sendInvitation` → `POST /employees/{id}/invite` (`role`, optional corrected `email`) → `SendInvitationRequest` → invitation emailed; list invalidated → row menu flips to "Resend invite".
- **Photo:** `EditEmployeeModal` "Change photo" → `uploadEmployeePhoto` → multipart `POST /employees/{id}/photo` (`photo` file) → `UploadPhotoRequest` (jpg/jpeg/png/webp, max 2 MB) → `EmployeeService::uploadPhoto` replaces the stored file → `photo_url` updates the avatar.

---

## 5. Design decisions & noted discrepancies

### 5.1 `phone` is read-only on edit (intentional)

`UpdateEmployeeRequest` has **no** `phone` rule — the phone number lives on the linked `users` record and is only accepted by `InviteEmployeeRequest` (i.e. when adding an employee or re-sending an invitation). The edit modal therefore displays phone as a static read-only value, and `UpdateEmployeeInput` does not include `phone`. This is a deliberate reflection of the backend contract, not an omission.

### 5.2 `contract` employment type is create-only-inconsistent but kept per backend

The invite/store endpoints accept `full_time,part_time,casual,contractor` (**no `contract`**), while the update endpoint accepts `full_time,part_time,casual,contract,contractor` (**with `contract`**). The frontend mirrors this exactly: the create form filters out `contract` (`CREATE_EMPLOYMENT_TYPES`), while the edit form offers the full union. This asymmetry is a backend quirk, faithfully reproduced rather than "fixed".

### 5.3 Invitation `status` mapping

`EmployeeInvitationResource.status` is `pending/expired/accepted`. The UI's `InvitationStatus` `'none'` is a client-side sentinel for "never invited", keeping the Send vs Resend decision a simple null check. No change required.

### 5.4 Scheduling slice

[`resources/js/features/shifts/hooks/useShifts.ts`](resources/js/features/shifts/hooks/useShifts.ts) builds its own `Employee` objects; it now fills the 9 profile fields as `null` purely to satisfy the widened `Employee` interface. Roster payloads do not carry those fields, and Roster is out of scope.

---

## 6. Verification

### 6.1 TypeScript / build

- `npx tsc --noEmit` — clean (exit 0).
- `npx vite build` — succeeds (3854 modules transformed, exit 0).

### 6.2 Backend tests (API contract the frontend targets)

`EmployeeManagementTest` + `EmployeeInvitationTest` + `EmployeeDeactivationTest` + `EmployeeAvailabilityTest` — **OK (55 tests, 180 assertions)**: employee list/create/update/delete, invitation send/expiry, deactivation (status changes), availability, validation and permission/company-isolation behaviour. Run via:

```
C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe vendor\bin\phpunit --filter "EmployeeManagementTest|EmployeeInvitationTest|EmployeeDeactivationTest|EmployeeAvailabilityTest"
```

### 6.3 Flow coverage

- **Create:** optional department/position/branch (real record ids), phone, employment type (no `contract`), hourly rate; capacity checks happen server-side via `assertCapacityForAssignment`.
- **Edit:** identifiers, personal details (dob/gender/address/emergency), hire/termination dates, contractor + terminated, photo upload; phone read-only.
- **Invitation:** send/resend via row menu; role select `in:company_admin,scheduler,employee`; web vs mobile channel derived server-side.
- **IDs / value mapping:** snake_case DTOs mirror resources; `mapEmployee` covers all resource fields incl. `user.phone`; `*_id` sent as numeric ids (or `null`); empty strings serialized to `null` before payloads.
- **Company relationship & isolation:** forced server-side (`company_id` pinned by controller); the frontend never sends `company_id`.
- **Remove obsolete fields:** hardcoded `employment_type` removed from create; a `phone` update field is not sent (not accepted by the backend).

---

## 7. Files changed

| File | Change |
|---|---|
| [`resources/js/types/employee.ts`](resources/js/types/employee.ts) | `EmployeeStatus` + `terminated`; `EmploymentType` + `contractor`; 9 new required profile fields on `Employee`; `CreateEmployeeInput` + phone/employmentType/hourlyRate; `UpdateEmployeeInput` + 9 profile fields (no phone) |
| [`resources/js/features/employees/hooks/useEmployees.ts`](resources/js/features/employees/hooks/useEmployees.ts) | `EmployeeUserDto.phone`; normalizeStatus/normalizeEmploymentType cases; `mapEmployee` 9 fields; `createEmployee` sends real employment_type/hourly_rate/phone; `updateEmployee` sends profile fields (not phone); added `uploadEmployeePhoto` + `useUploadEmployeePhoto` |
| [`resources/js/features/shifts/hooks/useShifts.ts`](resources/js/features/shifts/hooks/useShifts.ts) | terminated + contractor cases; `mapEmployee` fills 9 fields as `null` |
| [`resources/js/Components/common/StatusBadge.tsx`](resources/js/Components/common/StatusBadge.tsx) | `STATUS_MAP` + `terminated` (danger) |
| [`resources/js/features/employees/components/AddEmployeeModal.tsx`](resources/js/features/employees/components/AddEmployeeModal.tsx) | Optional dept/position/branch; phone/employment type/hourly rate fields; `CREATE_EMPLOYMENT_TYPES` (excludes `contract`); helper text |
| [`resources/js/features/employees/components/EditEmployeeModal.tsx`](resources/js/features/employees/components/EditEmployeeModal.tsx) | contractor/terminated in schema; Staff number; Personal details section (dob/gender/address/emergency/hire/termination dates); read-only phone; photo upload (avatar preview + change) |

No backend files, migrations, or business rules were modified.
