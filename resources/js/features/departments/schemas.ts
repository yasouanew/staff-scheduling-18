import { z } from 'zod';

import { DEPARTMENT_STATUSES } from '@/types/department';

/**
 * Zod validation schemas for the Departments feature.
 *
 * This schema is the single source of truth for department form validation. It
 * is shared by React Hook Form (`zodResolver`) and, via the inferred types, by
 * the data-mutation hooks — so the form and the network payload can never drift
 * from the backend contract (name required; code/description/color optional;
 * color a 6-digit hex; status in active/inactive).
 */

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Trimmed optional string that normalises "" to `undefined`. */
const optionalTrimmed = (max: number) =>
    z
        .string()
        .trim()
        .max(max, `Must be ${max} characters or fewer.`)
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined));

/** Tuple helper so a readonly option list can seed a Zod enum. */
function toEnumValues<T extends readonly [string, ...string[]]>(values: T): T {
    return values;
}

/* -------------------------------------------------------------------------- */
/* Department schema (DepartmentForm)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Validation for creating / editing a department.
 *
 * `name` is required. `code` and `description` are optional free text capped at
 * the backend's column limits. `color` must be a 6-digit hex value (matching
 * the backend regex) when present. `status` defaults to `active`.
 */
export const departmentFormSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Department name is required.')
        .max(255, 'Department name must be 255 characters or fewer.'),
    code: optionalTrimmed(50),
    description: optionalTrimmed(1000),
    color: z
        .string()
        .trim()
        .regex(/^#([A-Fa-f0-9]{6})$/, 'Enter a valid 6-digit hex colour, e.g. #2563EB.')
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    status: z.enum(toEnumValues(DEPARTMENT_STATUSES as unknown as [string, ...string[]])),
});

/** Values produced by {@link departmentFormSchema} after transformation. */
export type DepartmentFormValues = z.infer<typeof departmentFormSchema>;

/** Raw form input type (pre-transform) used by React Hook Form. */
export type DepartmentFormInput = z.input<typeof departmentFormSchema>;
