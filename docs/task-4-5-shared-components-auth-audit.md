# Task 4 and Task 5 Audit: Shared Components and Authentication

**Project:** Rosterly staff-scheduling SaaS  
**Scope:** Existing shared-component and authentication frontend implementation only. No application code was modified for this audit.  
**Audit date:** 17 August 2026

## Executive assessment

The project now has a promising local shadcn-style UI foundation, but the **authentication experience has not yet adopted it**. The shared-component inventory contains 25 local UI primitives, 8 common helpers, and 12 legacy starter-kit controls. Authentication has good structure—presentational pages, React Hook Form, Zod schemas, typed callbacks, and central token handling—but all six active auth pages still use manually styled native controls and legacy loading/error components.

The highest-value next change is a contained **auth-surface migration**: move the auth layout and six pages to the local button, input, checkbox, field, card, feedback, and theme primitives. This would remove repeated input/button styling and make the most visible public workflow consistent with the newly approved design system without changing API or security behavior.

| Task | Current maturity | Primary finding | Recommended priority |
| --- | --- | --- | --- |
| **Task 4 — Shared Components** | Foundation is implemented, but the project is in a transition state | New UI primitives, common helpers, and legacy starter components overlap | **High** |
| **Task 5 — Authentication** | Functionally well structured, visually inconsistent with the foundation | Six pages duplicate native control styling and bypass the local UI library | **High** |

## Task 4 — Shared Components

### Current architecture

The component layer is divided into three parallel generations. `Components/ui` is the new local shadcn-compatible layer, `Components/common` provides established app-level feedback and dashboard helpers, and the top-level `Components/` directory contains retained Inertia starter-kit controls. The active shell already uses parts of the new layer; authentication does not.

| Component group | Count | Examples | Assessment |
| --- | ---:| --- | --- |
| Local UI primitives | 25 | `Button`, `Input`, `Dialog`, `DropdownMenu`, `Table`, `Calendar`, `DatePicker`, `ThemeToggle` | The correct long-term base. Typed, semantic, and Radix-backed where appropriate. |
| Common shared helpers | 8 | `ErrorAlert`, `EmptyState`, `LoadingSkeleton`, `LoadingSpinner`, `StatCard`, `StatusBadge` | Useful app-level compositions, but some now overlap with the local UI feedback layer. |
| Legacy starter controls | 12 | `PrimaryButton`, `TextInput`, `Modal`, `Dropdown`, `Checkbox`, `InputLabel` | Separate visual language and legacy Inertia/Headless UI dependency. Should be retired only after migration. |

### Strengths

The shared foundation has several strong qualities. Semantic tokens are available for surfaces, text, borders, action colours, feedback, radius, and elevation. The local UI components use strict TypeScript, Tailwind semantic utilities, Radix primitives, Lucide icons, and clear focus states. The component index allows a single import convention: `@/Components/ui`.

The newer `Button`, dialog, alert dialog, popover, dropdown, feedback, table, date, and theme primitives address the issues raised in the prior frontend audit. The application shell already demonstrates these primitives in a live integration, including the theme control, profile menu, notification menu, breadcrumbs, sidebar tooltips, and mobile navigation drawer.

### Duplication and consistency issues

The component inventory shows direct overlap: four button-related files, five input-related files, two checkbox files, two dropdown files, two loading files, three error files, and separate modal implementations. The presence of overlapping concepts is expected during migration, but it must be time-limited; otherwise, teams will continue choosing different base components.

| Duplicate surface | Existing implementations | Risk | Recommended end state |
| --- | --- | --- | --- |
| Buttons | Local `ui/button`, legacy `PrimaryButton`, `SecondaryButton`, `DangerButton`, repeated page buttons | Divergent size, disabled, focus, and destructive-action behaviour | Keep local `Button` variants; migrate consumers; remove legacy buttons. |
| Inputs and labels | Local `Input` and field primitives, legacy `TextInput`, `InputLabel`, `InputError`, page-local input class constants | Validation and accessible descriptions vary by page | Keep local `Input`, `Field`, `Label`, `FieldDescription`, and `FieldError`. |
| Overlays and menus | Local Radix dialog/dropdown/popover, legacy Headless modal/dropdown | Keyboard, layering, animation, and focus behaviour can diverge | Keep local Radix-backed primitives; retire legacy overlay components after their consumers move. |
| Feedback | Local `ErrorState`, `EmptyState`, `LoadingSpinner`, `LoadingSkeleton`; common `ErrorAlert`, `EmptyState`, `LoadingSpinner` | Similar names and responsibilities can create ambiguous imports | Retain `ErrorAlert` as an inline alert composition, then consolidate names and ownership under a documented feedback family. |
| Tables | Local semantic `Table*` primitives, shared TanStack `DataTable`, feature-specific tables | Two valid abstraction levels lack a documented relationship | Use `DataTable` for interactive data grids and `Table*` for simple semantic tables. |

### Accessibility and responsiveness

The current local primitive layer is significantly stronger than the legacy starter-kit surface. Its controls consistently provide keyboard focus rings, disabled styles, semantic backgrounds, and accessible Radix interactions. The shared navigation work confirms that the system works across mobile drawer, tablet icon rail, and desktop sidebar patterns.

The remaining risk is adoption. Existing components such as the legacy dropdown rely on non-semantic clickable `div` elements and do not provide the same keyboard contract. Future work should avoid adding new consumers of `Components/Dropdown.tsx`, `Components/Modal.tsx`, or the legacy button/input set. Menus and dialogs should follow established accessible interaction patterns.[1] [2]

### Task 4 recommendation order

| Step | Scope | Outcome |
| --- | --- | --- |
| **4.1** | Freeze legacy component adoption | No new imports from the Inertia/Headless starter-kit component files. |
| **4.2** | Clarify local component ownership | Document `ui` as primitives, `common` as app compositions, and feature folders as domain-specific components. |
| **4.3** | Migrate authentication first | Replace its manual controls and legacy feedback imports with the new system. |
| **4.4** | Migrate high-frequency overlays and forms | Prioritise company, shift, roster, leave, and billing workflows. |
| **4.5** | Retire legacy starter surface | Remove old components and their unused Inertia/Headless dependencies only after all imports are migrated. |

## Task 5 — Authentication

### Current architecture

Authentication has a sensible separation of presentation and transport. `features/auth/pages` contains six presentational pages: login, register, forgot password, reset password, email verification, and confirm password. `AuthLayout` provides the visual shell. `useAuth` owns bearer-token persistence, login, register, logout, refresh, resend-verification, and password-confirmation calls. `useWebSession` provides a typed TanStack Query view of `GET /auth/me` for role and route gating.

| Layer | Current implementation | Assessment |
| --- | --- | --- |
| Pages | `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `VerifyEmailPage`, `ConfirmPasswordPage` | Presentational APIs are clear and testable. |
| Validation | React Hook Form + Zod schemas | Strong: explicit errors, robust password policy, confirmation matching, optional phone, terms acknowledgement. |
| Transport | `useAuth` plus direct calls in `AppRoutes` | Mostly centralised, but recovery endpoints remain embedded in route containers. |
| Session state | External token store plus `useWebSession` Query cache | Works, but creates two distinct session representations and repeated `/auth/me` ownership. |
| Browser protection | `ProtectedRoute` role/session/lock handling | Strong routing policy: unauthenticated, employee-only, failed-session, and locked-company cases are explicitly handled. |

### Strengths

The authentication experience already gets several important details right. All 14 detected native input elements use labels or associated descriptions; no auth image was found without an `alt` attribute; no auth button was found without an explicit `type`; five auth pages use `aria-invalid`; and all six pages include visible-focus treatment. Password fields have proper autocomplete values, show/hide controls, and client-side error states. The verification screen provides clear valid, already-verified, expired, and pending outcomes.

The form schemas are appropriately typed. Registration requires only the essential company-admin inputs plus optional phone, which aligns with the simplified onboarding goal. The forgotten-password route intentionally suppresses account-existence details, which is a sound privacy-preserving UX decision. Logout clears the local session even if the server request fails, preventing a stale local authenticated state.

### Design-system and UX gaps

Despite strong functional structure, authentication is the clearest active example of design-system non-adoption. No auth page imports the new local UI primitives. The six pages contain 14 raw `<input>` controls and 13 raw `<button>` controls, while five pages each redeclare `inputClasses`. They instead import legacy `LoadingSpinner` and, where necessary, `ErrorAlert` from `Components/common`.

| Finding | Evidence | Impact | Recommendation |
| --- | --- | --- | --- |
| No local UI primitive adoption | Zero auth page imports from `@/Components/ui` | Login and registration do not benefit from the new field, button, checkbox, feedback, or theme conventions | Migrate the auth surface as the first complete design-system consumer. |
| Repeated input styling | Five pages declare `const inputClasses` | Error/focus/disabled behavior can drift across forms | Build a small `AuthField` composition using `Field`, `Label`, `Input`, `FieldError`, and optional input adornments. |
| Legacy feedback imports | All six pages import common loading spinner; login/register import common error alert | Two feedback systems persist | Keep a dedicated inline alert composition if needed, but style it through local primitives and standardise the import contract. |
| Branding mismatch | `AuthLayout` still displays **ShiftFlow** while the shell now displays **Rosterly** | Public identity differs from authenticated identity | Update the auth shell as part of the visual migration. |
| Desktop-only brand panel | `AuthLayout` hides its product-value panel below `lg` | Mobile is clean but loses the explanation of value and trial context | Preserve a concise mobile value statement or trial reassurance in the form panel. |
| Password requirements are reactive only | Strong policy exists in Zod but users only receive rule-specific feedback after validation | Registration/reset may feel trial-and-error | Display compact password requirements before submission and update them as criteria are met. |
| No explicit public loading route state | Route containers own request promises but pages only show submit loading | Navigation from a signed verification link or initial protected session has limited branded loading feedback | Add reusable auth loading and status compositions during the migration. |

### Session and flow observations

`useAuth` documents `remember` as defaulting to `true`, while `LoginPage` defaults its checkbox to `false` and `LoginRoute` explicitly passes `values.rememberMe ?? false`. The visible behaviour is therefore session-only unless the user selects “Keep me signed in”, but the hook documentation and fallback do not reflect that route-level decision. The audit recommends one explicit policy and matching documentation.

Password recovery and reset requests are performed directly inside `AppRoutes`, whereas login, registration, logout, resend verification, and password confirmation sit in `useAuth`. This is not a functional error, but it splits auth request ownership. Moving recovery/reset actions into a typed auth service or hook would reduce route-module responsibilities and make the whole flow easier to test.

The application maintains both the token external store (`useAuth`) and the authenticated-user query (`useWebSession`). That split is defensible—tokens and user profiles have different lifecycles—but the responsibilities should be explicit: token changes should invalidate or refresh the user query, and checkout/session reactivation should have one standard refresh path. Avoid merging role authorization into the client token store; the current server-backed `GET /auth/me` role check is the correct security boundary.

For unauthenticated users with expired or invalid email-verification links, the verification page does not receive a resend callback because the route only enables it when a token is present. This may be intentional for security, but the user journey needs a clear alternative such as “Sign in to resend” or a privacy-preserving resend form. The current “Return to sign in” link is a partial fallback.

Bearer tokens can be stored in `localStorage` when the user elects to remain signed in. This is an established trade-off, not a frontend visual defect. Before changing it, validate the broader web threat model, Content Security Policy, XSS controls, token expiry/revocation policy, and backend session strategy with the security owner. The audit does not recommend a unilateral frontend storage change.

### Task 5 recommendation order

| Step | Scope | Outcome |
| --- | --- | --- |
| **5.1** | Create `AuthField`, `PasswordField`, and auth action compositions from local primitives | Remove repeated native-control and class-string patterns without changing form/API contracts. |
| **5.2** | Migrate login and registration | Make the highest-traffic public flows match the new card, field, button, error, and theme system. |
| **5.3** | Migrate reset, forgot, verification, and confirmation screens | Complete the visual/auth feedback system consistently. |
| **5.4** | Consolidate recovery/reset API ownership | Move direct route-container API calls into a typed auth service/hook. |
| **5.5** | Define token/session query invalidation rules | Keep server-authoritative role gating while avoiding stale session-profile views. |
| **5.6** | Align branding and public mobile copy | Replace remaining ShiftFlow identity and preserve concise product/trial context below `lg`. |
| **5.7** | Add scenario tests | Cover invalid credentials, rate limits, session-only vs remembered sessions, password recovery, expired verification, employee browser denial, and locked-company redirects. |

## Audit evidence

| Source | Key observation |
| --- | --- |
| `resources/js/Components/ui/` | 25 local shadcn-compatible primitives now exist. |
| `resources/js/Components/common/` | Eight shared helpers remain, including feedback and dashboard compositions. |
| `resources/js/Components/` and `resources/js/Layouts/` | Twelve legacy starter-kit controls/layouts remain, with Inertia/Headless and direct palette usage. |
| `features/auth/components/AuthLayout.tsx` | Shared two-column responsive auth shell; retained ShiftFlow branding. |
| `features/auth/pages/*.tsx` | Six presentational pages, 14 raw input controls, 13 raw buttons, zero local-UI imports. |
| `features/auth/hooks/useAuth.ts` | Typed token lifecycle, cross-tab updates, login/register/logout/refresh/resend/confirm operations. |
| `features/auth/hooks/useWebSession.ts` and `routes/ProtectedRoute.tsx` | Server-backed role/session route gating and company-lock handling. |
| `routes/AppRoutes.tsx` | Auth page containers; direct forgot/reset requests remain in routing code. |
| `features/auth/schemas.ts` | Strong password policy, confirmation checks, streamlined registration validation. |

## References

[1]: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/ "W3C WAI-ARIA Authoring Practices — Menu Button Pattern"  
[2]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ "W3C WAI-ARIA Authoring Practices — Modal Dialog Pattern"
