# Company Management Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Company Admin (`/companies`) and Super Admin (`/super-admin/companies`) company management: list, detail, create, edit, and company settings.
> **Method:** Backend/database/API is the **source of truth**. Every Company / CompanySetting field was compared between backend (migrations, models, requests, controller, service, resources, routes, policy) and frontend (types, hooks, schemas, forms, pages, routes). Only the frontend was changed — no backend code, migrations, or business rules were touched. **Roster is out of scope.**

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `companies` table + `Company` model fillable fields

| Field | Validation (`Store`/`Update`) | Notes |
|---|---|---|
| `name` | required, string, max:255 | |
| `abn` | nullable, string | |
| `email` | nullable, email | |
| `phone` | nullable, string | |
| `logo` | nullable, string | |
| `timezone` | nullable, string | |
| `country` | nullable, string | |
| `state` | nullable, string | |
| `business_type` | nullable, string | |
| `status` | required, in:active,inactive,suspended | |
| `subscription_id` | nullable, exists:subscriptions,id | **was missing from the frontend create/edit payload** |
| `trial_ends_at` | — (server-managed) | returned by `CompanyResource` as ISO-8601 |
| `locked_at` | — (server-managed) | returned by `CompanyResource` as ISO-8601 |

### 1.2 `CompanyResource` (what the API actually returns)

`id`, `name`, `abn`, `email`, `phone`, `logo`, `timezone`, `country`, `state`, `business_type`, `status`, `trial_ends_at`, `locked_at`, `subscription_id`, `branches_count`, `employees_count`, `users_count`, `settings` (nested `CompanySettingResource` when loaded), `created_at`, `updated_at`.

### 1.3 `company_settings` table + `CompanySettingResource`

`CompanySettingResource` returns `id`, `company_id` and **all attributes** except `id`/`company_id`/`created_at`/`updated_at` — i.e. `timezone`, `date_format`, `time_format`, `week_start_day`, `default_shift_duration`, `default_break_minutes`, `currency`, `language`, `allow_shift_swap`, `allow_employee_availability`, `allow_leave_requests`, `allow_push_notifications`, `logo`, `primary_color`, `secondary_color`.

`UpdateCompanySettingRequest` rules: `logo` => `sometimes, nullable, string, max:2048`; `primary_color`/`secondary_color` hex regex.

### 1.4 Permissions (Spatie roles + `CompanyPolicy`)

- `super_admin` — `before()` grants **all** company abilities (viewAny, view, create, update, delete).
- `company_admin` — `company.view` + `company.update` only — **no** `company.create` / `company.delete` (only Super Admin creates/deletes).
- `CompanyController::index` scopes to `$request->user()->company_id` for non-super-admin → **Company Admin can only see/manage their own company**.

### 1.5 API surface

- `GET /companies` → paginated `CompanyResource` (scoped to own company for non-super-admin)
- `POST /companies` → `StoreCompanyRequest` (super_admin only)
- `GET /companies/{company}` → `CompanyResource`
- `PUT /companies/{company}` → `UpdateCompanyRequest`
- `DELETE /companies/{company}` → super_admin only
- `GET /companies/{company}/settings` → `CompanySettingResource`
- `PUT /companies/{company}/settings` → `UpdateCompanySettingRequest`

---

## 2. Frontend Before → After

### 2.1 [`resources/js/types/company.ts`](resources/js/types/company.ts)

**Added** to the `Company` interface (after `subscriptionId`):

- `trialEndsAt: string | null` — maps `trial_ends_at` (ISO-8601).
- `lockedAt: string | null` — maps `locked_at` (ISO-8601).
- `settings: CompanySettings | null` — nested settings returned by `CompanyResource` when loaded.

`CompanySettings` already contained `logo` — no type change needed there.

### 2.2 [`resources/js/features/companies/hooks/useCompanies.ts`](resources/js/features/companies/hooks/useCompanies.ts)

- **Added** `trial_ends_at: string | null` and `locked_at: string | null` to `CompanyDto` (mirrors `CompanyResource`).
- **Added** `settings?: CompanySettingsDto | null` to `CompanyDto`.
- **`mapCompany`** now maps `trialEndsAt: dto.trial_ends_at`, `lockedAt: dto.locked_at`, `settings: dto.settings ? mapSettings(dto.settings) : null`.
- **`toCompanyPayload`** now sends `subscription_id: values.subscriptionId ?? null` — previously the create/edit payload never sent `subscription_id`, so the backend always stored `null`.
- **`toSettingsPayload`** now sends `logo: values.logo ?? null` — previously the settings payload never sent `logo`, so the branding logo could not be saved.

### 2.3 [`resources/js/features/companies/schemas.ts`](resources/js/features/companies/schemas.ts)

- **`companyFormSchema`** added `subscriptionId`: `z.coerce.number().int().positive().optional().nullable()` → `undefined` when blank.
- **`companySettingsSchema`** added `logo`: trimmed, `max:2048` (matches backend `max:2048`), optional/`''` → `undefined`.

### 2.4 [`resources/js/features/companies/components/CompanyFormModal.tsx`](resources/js/features/companies/components/CompanyFormModal.tsx)

- `EMPTY_DEFAULTS` and `toDefaults` now include `subscriptionId: undefined` / `subscriptionId: company.subscriptionId ?? undefined`.
- **Added** a "Subscription id" number input (`min={1}`) between the Country/State grid and the Status field — closes the create/edit gap so Super Admin can link a subscription.

### 2.5 [`resources/js/features/companies/components/CompanySettingsForm.tsx`](resources/js/features/companies/components/CompanySettingsForm.tsx)

- `toDefaults` now includes `logo: settings.logo ?? ''`.
- **Added** `import { LogoUpload } from './LogoUpload';`.
- **Added** a logo field (`Controller name="logo"` rendering `LogoUpload`) at the top of the Branding section; Branding description updated to "Optional logo and brand colours used across employee-facing views."

### 2.6 [`resources/js/features/super-admin/hooks/useSuperAdmin.ts`](resources/js/features/super-admin/hooks/useSuperAdmin.ts)

- Duplicate `CompanyDto` (used by the super-admin tenant companies list) **added** `trial_ends_at`, `locked_at`.
- Duplicate `mapCompany` **added** `trialEndsAt: dto.trial_ends_at`, `lockedAt: dto.locked_at`, `settings: null`.

### 2.7 [`resources/js/features/companies/pages/CompanySettingsPage.tsx`](resources/js/features/companies/pages/CompanySettingsPage.tsx)

- Made the page **reusable** via a `basePath` prop (default `'/companies'`), threaded through `Breadcrumb`, `SettingsContent`, the exported `CompanySettingsPage`, and the error-state back `Link`. This lets the same settings page serve both the Company Admin (`/companies/:id/settings`) and Super Admin (`/super-admin/companies/:id/settings`) paths.

### 2.8 [`resources/js/routes/AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx)

- **Added** under the super_admin `RoleRoute` block:
  ```tsx
  <Route
      path="/super-admin/companies/:id/settings"
      element={<CompanySettingsPage basePath="/super-admin/companies" />}
  />
  ```
  Previously Super Admin had no settings route at all.

### 2.9 [`resources/js/features/super-admin/pages/SuperAdminCompanyDetailPage.tsx`](resources/js/features/super-admin/pages/SuperAdminCompanyDetailPage.tsx)

- **Added** `import { useState } from 'react';`, `Pencil` + `Settings` lucide icons, and `import { CompanyFormModal } from '@/features/companies/components/CompanyFormModal';`.
- **Added** `const [isEditOpen, setIsEditOpen] = useState(false);` in `CompanyDetail`.
- Wrapped the suspend/reactivate button in a flex container with a new **Edit** button (opens `CompanyFormModal`) and a **Settings** `Link` to `/super-admin/companies/${id}/settings`.
- Rendered `<CompanyFormModal open={isEditOpen} onOpenChange={setIsEditOpen} company={company} />`.

This closes the Super Admin gap: previously the super-admin detail page had **neither** an Edit button nor a Settings link, even though `CompanyPolicy::before()` grants super_admin `company.view`/`company.update` and the backend exposes both endpoints.

### 2.10 No-change confirmations

- [`resources/js/features/companies/pages/CompanyDetailPage.tsx`](resources/js/features/companies/pages/CompanyDetailPage.tsx) — Company Admin detail already has Edit (`CompanyFormModal`) + Settings link; no changes required.
- [`resources/js/features/companies/components/CompaniesTable.tsx`](resources/js/features/companies/components/CompaniesTable.tsx) / [`resources/js/features/companies/pages/CompaniesListPage.tsx`](resources/js/features/companies/pages/CompaniesListPage.tsx) / [`resources/js/features/super-admin/pages/CompanyManagementPage.tsx`](resources/js/features/super-admin/pages/CompanyManagementPage.tsx) — list columns already cover the backend fields; no changes required.

---

## 3. Field-by-field comparison

### 3.1 Company create / edit

| Backend field | Was in frontend? | Action |
|---|---|---|
| `name` | Yes | OK |
| `abn` | Yes | OK |
| `email` | Yes | OK |
| `phone` | Yes | OK |
| `logo` | Yes | OK |
| `timezone` | Yes | OK |
| `country` | Yes | OK |
| `state` | Yes | OK |
| `business_type` | Yes | OK |
| `status` | Yes | OK |
| `subscription_id` | **Payload only (not type/form)** | **Fixed** — added to schema, form input, and `toCompanyPayload` |
| `trial_ends_at` | No (read-only) | **Fixed** — added to `Company`/`CompanyDto`/`mapCompany` |
| `locked_at` | No (read-only) | **Fixed** — added to `Company`/`CompanyDto`/`mapCompany` |

**No obsolete frontend-only fields were found.**

### 3.2 Company settings

| Backend field | Was in frontend? | Action |
|---|---|---|
| `timezone` | Yes | OK |
| `date_format` | Yes | OK |
| `time_format` | Yes | OK |
| `week_start_day` | Yes | OK |
| `default_shift_duration` | Yes | OK |
| `default_break_minutes` | Yes | OK |
| `currency` | Yes | OK |
| `language` | Yes | OK |
| `allow_shift_swap` | Yes | OK |
| `allow_employee_availability` | Yes | OK |
| `allow_leave_requests` | Yes | OK |
| `allow_push_notifications` | Yes | OK |
| `logo` | **Type only (not form/payload)** | **Fixed** — added to schema, `LogoUpload` field, and `toSettingsPayload` |
| `primary_color` | Yes | OK |
| `secondary_color` | Yes | OK |

---

## 4. Verification

### 4.1 TypeScript / build

- `npx tsc --noEmit` — clean.
- `npm run build` (tsc + vite) — succeeds.

### 4.2 Backend tests (API contract the frontend targets)

- `CompanyManagementTest` — **14 passed (28 assertions)**: super_admin list/create/update/delete, company_admin own-company-only list/detail/update, company_admin blocked from create/delete, settings show/update, validation rules.

### 4.3 Routes

- `php artisan route:list --path=companies` (Laragon PHP 8.3.16) — confirms `GET/POST/PUT/DELETE /companies`, `GET/PUT /companies/{company}/settings` are registered behind `auth:sanctum` + `verified` + role/permission middleware.

### 4.4 Flow coverage

- **List (Super Admin):** `GET /companies` → all companies; scoped to own company for Company Admin via `CompanyController::index`.
- **Create / Edit (Super Admin):** `CompanyFormModal` POSTs/PUTs `toCompanyPayload` incl. `subscription_id`; list/detail invalidated on success.
- **Detail (both):** `useCompany` maps `trial_ends_at`/`locked_at`/`settings`; Company Admin has Edit + Settings; Super Admin now has Edit + Settings too.
- **Settings update (both):** `CompanySettingsForm` PUTs `toSettingsPayload` incl. `logo`; `useUpdateCompanySettings` invalidates settings + company queries on success.
- **Permissions:** UI affordances match `CompanyPolicy` — create/delete only surfaced for Super Admin; Company Admin sees only their own company and cannot create/delete.

---

## 5. Files changed

| File | Change |
|---|---|
| `resources/js/types/company.ts` | Added `trialEndsAt`, `lockedAt`, `settings` to `Company` |
| `resources/js/features/companies/hooks/useCompanies.ts` | Added `trial_ends_at`/`locked_at`/`settings` to `CompanyDto` + `mapCompany`; `subscription_id` in `toCompanyPayload`; `logo` in `toSettingsPayload` |
| `resources/js/features/companies/schemas.ts` | Added `subscriptionId` (company form) and `logo` (settings schema) |
| `resources/js/features/companies/components/CompanyFormModal.tsx` | Added "Subscription id" input + defaults |
| `resources/js/features/companies/components/CompanySettingsForm.tsx` | Added `LogoUpload` logo field + defaults |
| `resources/js/features/super-admin/hooks/useSuperAdmin.ts` | Added `trial_ends_at`/`locked_at` to duplicate `CompanyDto` + `mapCompany` |
| `resources/js/features/companies/pages/CompanySettingsPage.tsx` | Made reusable via `basePath` prop |
| `resources/js/routes/AppRoutes.tsx` | Added `/super-admin/companies/:id/settings` route |
| `resources/js/features/super-admin/pages/SuperAdminCompanyDetailPage.tsx` | Added Edit button + Settings link + `CompanyFormModal` |

No backend files, migrations, or business rules were modified.
