# Frontend UI Audit

**Project:** Rosterly staff-scheduling SaaS  
**Scope:** Existing frontend only; no application source code was changed during this audit.  
**Audit date:** 17 August 2026

## Executive assessment

The frontend has a **sound modern SPA core**: React 18, React Router, TanStack Query, Axios, Tailwind CSS v4, Radix primitives, React Hook Form, Zod, and a feature-oriented directory structure. The active workspace uses semantic tokens and contains several genuinely reusable foundations, notably `DashboardLayout`, `Header`, `Sidebar`, `DataTable`, `StatusBadge`, typed API hooks, and the shared Axios transport.

The main constraint is **coexistence of two UI generations**. The active React Router SaaS sits beside a legacy Inertia starter-kit surface: old `Pages/`, `Layouts/`, Headless UI components, raw palette utilities, and duplicated button/modal/input abstractions. This overlap makes the source tree harder to navigate, prevents a single design-system contract from emerging, and creates an avoidable dependency and maintenance burden.

| Assessment area | Current state | Priority |
| --- | --- | --- |
| Active SPA architecture | Strong feature segmentation with typed query hooks and a central API client | Preserve |
| UI foundation | Partially consolidated; Radix, Headless UI, and hand-built primitives coexist | High |
| Design system | Semantic tokens exist, but no active shadcn/ui layer or component variants | High |
| Responsive implementation | Dashboard shell is responsive; several feature tables are not consistently protected | High |
| Accessibility | Good focus-ring adoption, but legacy dropdown and several form/button edge cases remain | High |
| Route and bundle organisation | Centralised but monolithic route module and eager page imports | Medium |
| Dependency hygiene | Several legacy or unused packages remain | Medium |

> **Visual-validation limitation:** The frontend preview server was available, but the Laravel application server and Composer `vendor` directory were unavailable in the audit workspace. Directly opening the Vite port therefore displayed Laravel’s Vite helper screen rather than the application. The responsive and accessibility conclusions below are based on source inspection and static evidence, not a logged-in browser walkthrough.

## 1. Current architecture

The active application is a **React SPA** mounted from `resources/js/app.tsx`. It configures a global `QueryClient`, browser routing, Sonner toasts, and Laravel Echo before rendering `AppRoutes`. The shared `apiClient` centralises the `/api/v1` base URL, bearer-token attachment, timeout policy, response-envelope types, global 401 handling, and shared error-message extraction. Feature hooks generally isolate DTO mapping and TanStack Query concerns from page components; `features/companies/hooks/useCompanies.ts` is a clear representative example.

| Layer | Current implementation | Assessment |
| --- | --- | --- |
| Entry point | `resources/js/app.tsx` | Good provider composition; all pages are currently eagerly imported through the route module. |
| Routing and authorization | `resources/js/routes/AppRoutes.tsx`, `ProtectedRoute.tsx` | Clear role-gated route groups, but `AppRoutes.tsx` is large and combines route configuration with several authentication controller components. |
| Layout | `Components/layout/DashboardLayout.tsx`, `Header.tsx`, `Sidebar.tsx` | Active shell supports mobile drawer, tablet rail, and desktop sidebar. It is the correct foundation to retain. |
| Server state | TanStack Query feature hooks | Consistent in mature features, with strongly typed query key registries and DTO/domain mapping. |
| Forms | React Hook Form, Zod, and feature schemas | Strong adoption across operational forms; billing plan form is a notable exception. |
| Styling | Tailwind v4 semantic variables in `resources/css/app.css` | A viable token layer exists, but it does not yet control all frontend UI. |
| Legacy surface | `Pages/`, `Layouts/`, classic `Components/` | Inertia starter-kit files remain alongside the SPA and retain a separate visual language and interaction model. |

The `resources/js` source tree contains **131 feature files**, **25 shared component files**, **2 legacy layout files**, and **12 legacy page files**. The directory structure is mostly feature-oriented, with many features containing `components`, `hooks`, `pages`, and, where relevant, `lib` or schemas. That direction is appropriate for a SaaS codebase.

## 2. UI inconsistencies

The product currently shows inconsistent UI generations rather than a single product language. The active SaaS area mostly uses tokens such as `bg-card`, `text-foreground`, `border-border`, and `focus-visible:ring-ring`. The retained Inertia-era surface instead uses direct Tailwind palette classes such as `bg-gray-*`, `text-gray-*`, `dark:bg-gray-*`, `focus:ring-indigo-*`, and ad hoc SVG icons. This is visible in `Layouts/AuthenticatedLayout.tsx`, `Components/PrimaryButton.tsx`, `Components/Modal.tsx`, and the Inertia pages.

| Inconsistency | Evidence | Impact | Recommendation |
| --- | --- | --- | --- |
| Two layout systems | `DashboardLayout` is the active React Router shell; `Layouts/AuthenticatedLayout.tsx` remains a separate Inertia shell | Navigation, header, dark-mode, and mobile behaviour may diverge if legacy pages remain reachable | Select the SPA shell as the single shell and retire or explicitly isolate the legacy layout. |
| Two dialog systems | 20 active files import Radix Dialog; legacy `Components/Modal.tsx` uses Headless UI | Different focus, overlay, sizing, and transition conventions | Standardise all new and migrated dialogs on one Radix/shadcn-style dialog contract. |
| Two button languages | Token-based inline buttons coexist with `PrimaryButton`, `SecondaryButton`, and `DangerButton` using direct gray/indigo styles | CTA hierarchy, disabled states, and focus behaviour vary | Replace button variants with a single semantic variant system. |
| Branding drift | Active shell and legacy fallback strings include both **ShiftFlow** and **Rosterly** terminology | Weakens product coherence | Consolidate visible product copy, defaults, page titles, and fallback user data. |
| Empty/error/loading variation | `DataTable`, `EmptyState`, feature-inline alert cards, and raw skeleton `div`s all implement similar states | Users receive uneven feedback patterns | Define standard page-state components and apply them feature by feature. |

## 3. Duplicate components

The largest duplication category is **UI scaffolding**, not domain logic. A capable shared `DataTable` already provides search, sorting, pagination, column visibility, loading, and empty states. Most operational tables consume it, but `PaymentsTable` and `PlansTable` are standalone renderers. Feature-specific forms and modals also repeat substantial Radix portal, overlay, content, action-row, input, and error presentation markup.

| Duplicate or overlapping surface | Evidence | Recommended destination |
| --- | --- | --- |
| Modal/dialog shells | `Modal.tsx` plus Radix dialog markup across billing, availability, branches, companies, departments, employees, leave, rosters, shifts, and onboarding | `components/ui/dialog`, `components/ui/alert-dialog`, and an application modal convention |
| Button variants | `PrimaryButton`, `SecondaryButton`, `DangerButton` plus repeated inline button class strings | `components/ui/button` using CVA variants |
| Form controls | `TextInput`, `InputLabel`, `InputError`, native inputs inside feature forms, and Radix controls | `components/ui/input`, `label`, `textarea`, `select`, `checkbox`, `switch`, and a form-field wrapper |
| Tables and toolbars | `DataTable` plus standalone plan/payment tables and repeated feature table patterns | Extend `DataTable` or create a documented small-table variant rather than parallel foundations |
| Feedback states | Shared `EmptyState`, `ErrorAlert`, `LoadingSkeleton`, `LoadingSpinner`, plus inline feature equivalents | A documented `PageState` composition built from shared primitives |
| Confirmation patterns | Radix alert dialogs in some features and native `window.confirm` in `PlansPage.tsx` | Shared `AlertDialog` confirmation helper with consistent destructive copy and loading behaviour |

Several files are also unusually dense for their responsibilities: `EmployeeAvailabilityPage.tsx` is approximately 32 KB, `Welcome.tsx` approximately 31 KB, and multiple forms range from roughly 18–25 KB. The audit does not recommend splitting code merely by file size; however, these files should be refactored around presentational sections, field groups, and feature hooks when their UI changes next.

## 4. Components that should use shadcn/ui

There is **no `components.json` configuration file** and no active `components/ui/` directory. The package includes the Radix primitives and `class-variance-authority`, but CVA has no source imports. Therefore, the project has the ingredients commonly used by shadcn/ui without the local component layer that makes those ingredients coherent.

| Priority primitive | Existing situation | Recommended use |
| --- | --- | --- |
| `Button` | Multiple legacy buttons and repeated inline class strings | Create semantic variants: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`, with loading state. |
| `Dialog` and `AlertDialog` | Repeated Radix portal/overlay/content/action markup; legacy Headless modal | Provide standard width, title, description, footer, and close-action defaults. |
| `Input`, `Textarea`, `Label`, `Select` | Repeated native controls and local class constants | Standardise border, text, focus, disabled, error, and help-text states. |
| `Form` / field wrappers | Most forms already use React Hook Form + Zod | Use a shared field API for labels, descriptions, ARIA links, validation messages, and control slots. |
| `Table` | Strong `DataTable` exists, but some tables bypass it | Use shadcn-style semantic table elements underneath `DataTable`; keep TanStack behaviour in the wrapper. |
| `DropdownMenu`, `Popover`, `Tooltip` | Radix use is widespread but styling repeats | Centralise styling and interaction defaults. |
| `Badge` and `StatusBadge` | Shared status component exists, but inline status pills also appear | Consolidate semantic status, plan, and notification badge variants. |
| `Skeleton`, `EmptyState`, `Alert` | Multiple inline shapes and messages | Create coherent loading, empty, error, and permission-state compositions. |
| `Sheet` | Mobile navigation uses a Dialog pattern | Use a side-sheet wrapper for navigation and right-side utility panels. |

The recommendation is **not** to install a runtime shadcn package. Instead, initialise a local shadcn-compatible component directory and progressively migrate existing Radix-based usage into local, typed, token-driven components.

## 5. Responsive problems

The dashboard shell has a good breakpoint model: drawer navigation below `md`, collapsed rail from `md` to `lg`, and full sidebar at `lg`. The `DataTable` wrapper supplies horizontal overflow. In contrast, responsive table treatment is inconsistent in feature components.

| Finding | Evidence | Risk | Priority response |
| --- | --- | --- | --- |
| Feature table overflow is inconsistent | Eight feature table files do not contain `overflow-x-auto`, including branches, companies, departments, leave types, positions, rosters, shift templates, and shifts | Wide administrative tables can overflow or compress unreadably on mobile | Make each table use the shared `DataTable` overflow container or explicitly wrap it. |
| Column adaptation is uneven | Operational tables have responsive hidden-column utilities; `PaymentsTable` and `PlansTable` show no responsive column-hiding pattern | Billing tables are particularly likely to be cramped on narrow screens | Add an intentional mobile table strategy: priority columns, hidden secondary columns, or card rendering. |
| Dialog sizing is repeated and inconsistent | Many dialogs inline `w-[calc(100%-2rem)]`, `max-w-*`, and overlay classes | Small variation can produce different mobile spacing and visual weight | Standardise through a dialog primitive with documented sizes. |
| No visual route regression suite | Preview could not render the application during this audit; no visual testing configuration was found | Responsive breakpoints can regress without detection | Add Playwright/Cypress smoke coverage for public, dashboard, form, table, and dialog viewports. |
| Dense routes are eagerly loaded | `AppRoutes.tsx` imports all page modules synchronously | Initial JS remains large; prior production builds emit a chunk-size warning | Lazily load route-level pages and keep the shell/navigation eagerly loaded. |

## 6. Accessibility problems

The active SPA shows positive discipline: the static scan found **982 `focus-visible:` utility occurrences**, **94 files with ARIA usage**, no detected active image elements lacking an `alt` attribute, and frequent semantic token use. The remaining issues are concentrated in legacy code and a small set of exceptions.

| Finding | Evidence | Recommended remediation |
| --- | --- | --- |
| Legacy dropdown is not keyboard-equivalent | `Components/Dropdown.tsx` uses clickable `div` elements for trigger, overlay, and content dismissal | Retire it in favour of Radix `DropdownMenu`; if retained temporarily, use a native button and provide keyboard, focus, `aria-expanded`, and menu semantics. Menu buttons are expected to expose a button interaction model.[1] |
| Native confirmation interrupt | `PlansPage.tsx` calls `window.confirm` for deletion | Replace with the existing Radix alert-dialog pattern to provide consistent focus management, copy, destructive emphasis, and cancellability. |
| Buttons without explicit `type` | Billing modal, refund button, subscriptions, and payments pages contain examples | Set `type="button"` for non-submit controls and reserve submit buttons for forms. This prevents unintended parent-form submission. |
| Missing dialog description in one active dialog | `PlansPage.tsx` has Radix `Dialog.Content` without `Dialog.Description` | Add a visible or screen-reader-only description. Modal dialogs need a clear accessible name and controlled focus behaviour.[2] |
| Dark tokens are not user-addressable | Tokens define `.dark`, but active SPA files contain no `dark:` utilities and no theme toggle or `.dark` activation logic | Implement a persisted theme preference and test token contrast in both modes, or remove the unsupported claim until it is functional. |
| Source-only accessibility validation | No evidence of automated axe, keyboard E2E, or screen-reader test coverage | Add automated `jest-axe` or Playwright axe checks for dialogs, menus, data tables, forms, and navigation. |

## 7. Design-system problems

`resources/css/app.css` provides an encouraging semantic token set for background, card, foreground, border, input, primary, muted, accent, success, warning, danger, info, radius, and shadow. This should become the source of truth. The problem is governance: tokens coexist with raw legacy classes, inline component strings, a Tailwind v3-style configuration, and a Tailwind v4 CSS theme.

| Design-system concern | Consequence | Recommendation |
| --- | --- | --- |
| Tailwind v4 and legacy configuration coexist | `app.css` uses v4 `@theme`, but `tailwind.config.js` retains legacy content/plugin configuration | Consolidate configuration around the chosen Tailwind v4 approach; document why each remaining config file exists. |
| Direct colour usage remains in legacy surface | Gray/indigo palette classes and hard-coded colour styles bypass semantic tokens | Migrate active code to semantic tokens, then remove legacy components and palette leakage. |
| No typography scale or component spec | Tokens declare the font family but do not define documented heading/body/label/button scales | Publish a compact type scale and apply it through shared primitives. |
| Inconsistent radii and shadows | Tokens exist, while source uses many literal arbitrary radius/shadow utilities | Define approved component-radius and elevation levels; migrate opportunistically. |
| No design-system component ownership | Shared components, feature components, and legacy starter components overlap | Establish `components/ui`, `components/common`, and feature-local boundaries with an ownership rule. |
| No functional dark-mode contract | Token overrides exist but are not activated by the SPA | Add theme provider, preference persistence, and dark-mode acceptance criteria before treating it as supported. |

## 8. Unnecessary or questionable dependencies

This assessment classifies packages as **remove after verification**, not immediately remove. A dependency should only be removed after confirming it is not needed by build tooling, backend integration, or an external deployment script.

| Package or group | Evidence | Recommendation |
| --- | --- | --- |
| `@inertiajs/react` | 17 source files still import it, all inside the legacy starter-kit surface | Remove only after deleting or migrating legacy `Pages/`, `Layouts/`, and classic `Components/`. |
| `@headlessui/react` | Four source files use it, primarily the legacy modal/transition surface | Remove after replacing the legacy `Modal` and any remaining transition use with local Radix/shadcn-style primitives. |
| `class-variance-authority` | Declared dependency; zero source imports | Either adopt it as the variant engine for local UI primitives or remove it. |
| `concurrently` | Declared dependency; no package script references it | Remove unless a team-level command not represented in `package.json` requires it. |
| `autoprefixer` | Declared dependency; `postcss.config.js` exports an empty plugin object and Vite Tailwind is active | Verify deployment pipeline, then likely remove along with the unused PostCSS configuration. |
| `laravel-echo` and `pusher-js` | No direct source imports, while `@laravel/echo-react` is used | Treat as transitive/runtime integration dependencies first; inspect package resolution and Echo setup before removal. |
| Tailwind forms plugin duplication | `@tailwindcss/forms` is declared in both config and CSS plugin form | Keep one documented integration path compatible with the selected Tailwind v4 toolchain. |

Core packages should remain: React, React Router, TanStack Query/Table, Axios, React Hook Form, Zod, Radix, FullCalendar, date-fns, Lucide, Sonner, and Recharts. These are active and aligned with the product’s needs.

## 9. Recommended refactoring order

The safest approach is progressive consolidation rather than a visual rewrite. Each stage should preserve existing page behaviour and validate at desktop, tablet, and mobile widths before moving to the next stage.

| Phase | Scope | Outcome and exit criteria |
| --- | --- | --- |
| **1. Establish UI ownership** | Document the React Router SPA as the active frontend. Inventory and isolate Inertia starter-kit pages/layouts from active routes. | No active SPA route imports legacy Inertia UI; a deletion/migration list is approved. |
| **2. Build the local UI layer** | Add local button, input, textarea, select, form-field, dialog, alert-dialog, dropdown, badge, table, skeleton, and empty-state primitives. Use CVA for variants. | New feature work no longer writes duplicated base control classes. |
| **3. Standardise navigation and page states** | Consolidate `DashboardLayout`, mobile sheet, header, breadcrumbs, page headers, loading/error/empty/permission states. | Every page has one consistent page-state pattern and responsive shell behaviour. |
| **4. Migrate high-traffic operational surfaces** | Convert employee, roster, shift, leave, company, and billing forms/tables to the local primitives. Start with forms/tables already most used. | Consistent validation, dialog, table, and destructive-confirmation behaviour. |
| **5. Repair responsive debt** | Make all feature tables use a documented mobile strategy; normalise dialogs and long-form layouts. Add viewport regression tests. | No horizontal clipping at 320–375 px; critical actions remain reachable and legible. |
| **6. Close accessibility gaps** | Replace legacy dropdown, remove native confirmations, add dialog descriptions, button types, keyboard tests, and automated axe checks. | Dialog/menu/form/navigation checks pass in automated and manual keyboard reviews. |
| **7. Complete theme and token governance** | Implement or formally defer dark mode; replace legacy palette utilities and arbitrary visual values with approved tokens. | Light and dark modes are either both tested or dark mode is intentionally removed from scope. |
| **8. Remove dead dependencies and legacy code** | Remove unused configuration/packages only after migration and build verification. Add route-level lazy loading. | Smaller dependency surface, clean build, and lower initial bundle cost. |

## Audit evidence

| Evidence source | Key observation |
| --- | --- |
| `package.json` | Modern React SPA stack plus retained Inertia/Headless/legacy tooling. |
| `resources/js/app.tsx` | Central SPA bootstrap, QueryClient, BrowserRouter, Sonner, and Echo. |
| `resources/js/routes/AppRoutes.tsx` | Role-gated SPA routes and eager imports; auth route controller components co-located with route tree. |
| `resources/js/lib/api-client.ts` | Central API transport and strong shared error/token handling. |
| `resources/css/app.css` | Semantic tokens and dark overrides exist. |
| `tailwind.config.js` and `postcss.config.js` | Legacy configuration remains alongside Tailwind v4 CSS theme; PostCSS plugins are empty. |
| `Components/tables/DataTable.tsx` | Capable shared table foundation with overflow, state handling, search, sorting, pagination, and visibility. |
| `Layouts/AuthenticatedLayout.tsx`, `Components/Modal.tsx`, `Components/Dropdown.tsx` | Legacy Inertia/Headless UI surface with separate visual and accessibility model. |
| Static source scan | Strong focus and ARIA adoption; inconsistent table overflow; no active theme activation; no `components/ui` or `components.json`. |

## References

[1]: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/ "W3C WAI-ARIA Authoring Practices — Menu Button Pattern"  
[2]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ "W3C WAI-ARIA Authoring Practices — Modal Dialog Pattern"
