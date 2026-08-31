You are working on an existing Staff Scheduling SaaS application.

Your job is to ALIGN and SAFELY REFACTOR the existing frontend with the ACTUAL backend implementation.

IMPORTANT:

The backend/database/API currently implemented in the project is the SOURCE OF TRUTH.

Do NOT assume that an old UI design, previous specification, old documentation, or previous strategy is correct.

For every feature, inspect the actual:

1. PostgreSQL database/migrations
2. Laravel models
3. Model relationships
4. Form Requests / validation
5. Controllers
6. Services
7. Policies / permissions
8. API routes
9. API Resources
10. Existing React API services/hooks
11. Existing React pages/components

Then make the EXISTING frontend accurately represent what the backend currently supports.

==================================================
CRITICAL SCOPE RULE
==================================================

ROSTER IS COMPLETELY OUT OF SCOPE.

DO NOT:

- modify roster pages
- modify roster components
- modify roster APIs
- modify roster controllers
- modify roster services
- modify roster models
- modify roster migrations
- modify roster database tables
- modify roster frontend hooks
- modify roster functionality

If a non-roster feature has a relationship/reference to roster, leave that part untouched unless it is necessary to understand the non-roster feature.

==================================================
DO NOT REBUILD
==================================================

The application is already significantly developed.

Do NOT:

- rebuild pages from scratch
- delete working pages
- replace the existing architecture
- change backend architecture
- change database schema
- create unnecessary new APIs
- change API contracts
- introduce mock data
- invent fields
- invent business rules
- remove functionality that is actually supported by the backend

Preserve existing working functionality.

==================================================
SOURCE OF TRUTH
==================================================

For each feature:

DATABASE
↓
LARAVEL MODEL
↓
RELATIONSHIPS
↓
VALIDATION
↓
CONTROLLER
↓
SERVICE
↓
API ROUTE
↓
API RESOURCE/RESPONSE
↓
REACT API SERVICE
↓
REACT HOOK
↓
COMPONENT
↓
PAGE

The frontend must match this chain.

==================================================
FIELD ALIGNMENT
==================================================

For every existing frontend form:

- Find the actual backend create/update fields.
- Compare them with frontend fields.
- Remove obsolete frontend fields.
- Add missing backend-supported fields.
- Rename incorrectly named frontend fields.
- Correct incorrect data types.
- Correct select options.
- Correct required/optional state.
- Correct validation messages.
- Correct default values.
- Correct relationships.
- Correct API payload.
- Correct response mapping.

Do not preserve old fields merely because they already exist in the UI.

==================================================
IMPORTANT
==================================================

If the backend does NOT support a field:

DO NOT invent backend support.

Remove the field from the frontend if it is obsolete.

If the backend supports a field but the frontend does not:

Add it to the appropriate frontend UI.

If the backend behavior is unclear:

DO NOT guess.

Report the issue and inspect related code before making a decision.

==================================================
UI LIBRARY
==================================================

Use the existing frontend design system.

Where UI components need improvement, use:

- shadcn/ui
- Tailwind CSS
- Radix UI
- Lucide React

Do not redesign the entire application.

The primary goal is FUNCTIONAL ALIGNMENT.

Visual improvements should remain consistent with the existing design system.

==================================================
TESTING
==================================================

After modifying a feature, verify:

- TypeScript
- API payload
- API response
- validation
- loading state
- error state
- success state
- permissions
- table/list refresh
- create
- read
- update
- delete where supported

Do not declare a feature complete merely because the page renders.

==================================================
DOCUMENTATION
==================================================

For every task create/update:

docs/frontend-alignment/

Document:

- What was inspected
- What was wrong
- What was changed
- Backend source of truth
- Frontend changes
- API changes: NONE unless explicitly approved
- Remaining issues
- Tests performed

Work carefully and incrementally.