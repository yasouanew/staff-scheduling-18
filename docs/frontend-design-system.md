# Frontend Design System

The application now provides a local, shadcn-compatible UI foundation under `resources/js/Components/ui`. It is intentionally additive: **no feature pages were migrated in this change**. Existing screens remain stable while future work can adopt a single, typed visual system.

## Foundations

| Foundation | Location | Usage contract |
| --- | --- | --- |
| Semantic colours, radius, shadow, and typography | `resources/css/app.css` | Use semantic Tailwind utilities such as `bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, and `text-destructive`. Do not introduce direct palette or hexadecimal colours in component code. |
| Theme activation | `Components/ui/theme-provider.tsx` | The provider is mounted in `app.tsx`. It persists `light`, `dark`, or `system` preference to local storage and applies the matching class to `<html>`. |
| Theme control | `Components/ui/theme-toggle.tsx` | Import and mount `ThemeToggle` in an appropriate header or settings UI when a product decision is made to expose the preference. |
| shadcn configuration | `components.json` | Defines the local UI directory, Tailwind stylesheet, aliases, and Lucide icon library for future component generation. |

## Import convention

Prefer the single local export surface:

```tsx
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    DatePicker,
    EmptyState,
    Field,
    FieldError,
    Input,
    Label,
} from '@/Components/ui';
```

## Available primitives

| Category | Primitives |
| --- | --- |
| Actions | `Button`, `buttonVariants`, `Pagination`, `SearchInput` |
| Forms | `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Field`, `Label`, `FieldDescription`, `FieldError` |
| Surfaces | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Badge`, `Avatar` |
| Overlays | `Dialog`, `DialogContent`, `AlertDialog`, `Popover`, `DropdownMenu`, `Tooltip` |
| Navigation and data | `Tabs`, `TableContainer`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` |
| Calendar and dates | `Calendar`, `DatePicker` |
| Feedback | `LoadingSpinner`, `LoadingSkeleton`, `EmptyState`, `ErrorState` |
| Theme | `ThemeProvider`, `useTheme`, `ThemeToggle` |

## Adoption rules

Future page refactors should migrate a complete interaction surface at a time. For example, when updating a shift form, replace its button, field, modal, error, loading, and confirmation patterns together rather than mixing old and new controls within the same workflow.

Every form should use a `Field` structure with a linked `Label`, descriptive help where needed, and `FieldError` for validation feedback. Every destructive action should use `AlertDialog`; native browser confirmations should not be added. Every table should be rendered inside `TableContainer` or the existing shared `DataTable` wrapper so horizontal overflow is intentional on mobile.

> The system is light/dark ready at the application root. Until feature pages are migrated, legacy direct palette utilities may not fully respond to the selected theme. New UI must use semantic tokens from the beginning.

## Deliberately deferred work

This foundation does not change feature-page markup, route structure, navigation, API hooks, business logic, or existing form submissions. The next approved stage can migrate pages in priority order, beginning with shared legacy buttons/modals and the highest-traffic scheduling workflows.
