import { z } from 'zod';

import { POSITION_STATUSES } from '@/types/position';

/**
 * Zod validation schemas for the Positions feature.
 *
 * This schema is the single source of truth for position form validation. It is
 * shared by React Hook Form (`zodResolver`) and, via the inferred types, by the
 * data-mutation hooks — so the form and the network payload can never drift from
 * the backend contract (name/title required; code/description optional; pay
 * scale a non-negative number; color a 6-digit hex; status in active/inactive).
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
/* Position schema (PositionForm)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Validation for creating / editing a position.
 *
 * `name` (the job title) is required. `code` and `description` are optional free
 * text capped at the backend's column limits. `payScale` (default hourly rate)
 * is an optional non-negative number kept as a string in the form input and
 * coerced on transform, so an empty field maps to `undefined`. `color` must be a
 * 6-digit hex value (matching the backend regex) when present. `status` defaults
 * to `active`.
 */
export const positionFormSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Position title is required.')
        .max(255, 'Position title must be 255 characters or fewer.'),
    /**
     * Owning department. Optional, because a position can be company-wide, but
     * when chosen it carries the real department id so the backend link
     * (`positions.department_id`) actually persists.
     */
    departmentId: z
        .string()
        .trim()
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),

    code: optionalTrimmed(50),
    description: optionalTrimmed(1000),
    payScale: z
        .string()
        .trim()
        .optional()
        .or(z.literal(''))
        .refine(
            (value) => !value || (!Number.isNaN(Number(value)) && Number(value) >= 0),
            'Enter a valid pay rate of 0 or more.',
        )
        .refine(
            (value) => !value || Number(value) <= 99_999_999.99,
            'Pay rate is too large.',
        )
        .transform((value) => (value ? Number(value) : undefined)),
    color: z
        .string()
        .trim()
        .regex(/^#([A-Fa-f0-9]{6})$/, 'Enter a valid 6-digit hex colour, e.g. #2563EB.')
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    status: z.enum(toEnumValues(POSITION_STATUSES as unknown as [string, ...string[]])),
});

/** Values produced by {@link positionFormSchema} after transformation. */
export type PositionFormValues = z.infer<typeof positionFormSchema>;

/** Raw form input type (pre-transform) used by React Hook Form. */
export type PositionFormInput = z.input<typeof positionFormSchema>;
