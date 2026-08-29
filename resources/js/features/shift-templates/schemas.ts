import { z } from 'zod';

import { SHIFT_TEMPLATE_STATUSES } from '@/types/shift-template';

import { computeSpanMinutes, isValidTime } from './lib/shift-time';

/**
 * Zod validation schemas for the Shift Templates feature.
 *
 * These schemas are the single source of truth for form validation. They are
 * shared by React Hook Form (`zodResolver`) and, via the inferred types, by the
 * data-mutation hooks — so the forms and the network payloads can never drift
 * from the backend contract (name required; start/end times in `H:i`; break
 * minutes 0–1440; colour a 6-digit hex; status in active/inactive).
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

/** Required 24-hour `HH:mm` time field. */
const requiredTime = (label: string) =>
    z
        .string()
        .trim()
        .min(1, `${label} is required.`)
        .refine((value) => isValidTime(value), `Enter ${label.toLowerCase()} as a 24-hour time.`);

/** Optional numeric id kept as a string in the select control. */
const optionalId = z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? Number(value) : undefined))
    .refine(
        (value) => value === undefined || (Number.isInteger(value) && value > 0),
        'Select a valid option.',
    );

/** Tuple helper so a readonly option list can seed a Zod enum. */
function toEnumValues<T extends readonly [string, ...string[]]>(values: T): T {
    return values;
}

/* -------------------------------------------------------------------------- */
/* Shift template schema (ShiftTemplateForm)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Validation for creating / editing a shift template.
 *
 * `name`, `startTime` and `endTime` are required. `breakMinutes` (the break
 * duration) is an optional 0–1440 integer kept as a string in the number input
 * and coerced on transform. `defaultPositionId`, `branchId` and `departmentId`
 * are optional foreign keys. Zero-length shifts are rejected; shifts that end
 * before they start are accepted and treated as overnight.
 */
export const shiftTemplateFormSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, 'Template name is required.')
            .max(255, 'Template name must be 255 characters or fewer.'),
        description: optionalTrimmed(1000),
        startTime: requiredTime('Start time'),
        endTime: requiredTime('End time'),
        breakMinutes: z
            .string()
            .trim()
            .optional()
            .or(z.literal(''))
            .refine(
                (value) =>
                    !value ||
                    (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 1440),
                'Enter a break between 0 and 1440 minutes.',
            )
            .transform((value) => (value ? Number(value) : 0)),
        isPaidBreak: z.boolean(),
        defaultPositionId: optionalId,
        branchId: optionalId,
        departmentId: optionalId,
        color: z
            .string()
            .trim()
            .regex(/^#([A-Fa-f0-9]{6})$/, 'Enter a valid 6-digit hex colour, e.g. #2563EB.')
            .optional()
            .or(z.literal(''))
            .transform((value) => (value ? value : undefined)),
        status: z.enum(toEnumValues(SHIFT_TEMPLATE_STATUSES as unknown as [string, ...string[]])),
    })
    .superRefine((values, ctx) => {
        const span = computeSpanMinutes(values.startTime, values.endTime);

        if (span === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['endTime'],
                message: 'End time must be different from the start time.',
            });
            return;
        }

        if (!Number.isNaN(span) && values.breakMinutes >= span) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['breakMinutes'],
                message: 'Break must be shorter than the shift length.',
            });
        }
    });

/** Values produced by {@link shiftTemplateFormSchema} after transformation. */
export type ShiftTemplateFormValues = z.infer<typeof shiftTemplateFormSchema>;

/** Raw form input type (pre-transform) used by React Hook Form. */
export type ShiftTemplateFormInput = z.input<typeof shiftTemplateFormSchema>;

/* -------------------------------------------------------------------------- */
/* Use-template schema (UseTemplateModal)                                     */
/* -------------------------------------------------------------------------- */

/** Matches a `YYYY-MM-DD` calendar date as produced by `<input type="date">`. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validation for creating a real shift from a template.
 *
 * The roster and date identify where the shift lands; the times/break default
 * to the template's values but stay editable so a one-off adjustment does not
 * require editing the template itself. Assigning an employee is optional — an
 * unassigned shift is a valid open slot.
 */
export const useTemplateFormSchema = z
    .object({
        rosterId: z
            .string()
            .trim()
            .min(1, 'Select a roster week.')
            .transform((value) => Number(value))
            .refine((value) => Number.isInteger(value) && value > 0, 'Select a roster week.'),
        date: z
            .string()
            .trim()
            .min(1, 'Shift date is required.')
            .regex(DATE_PATTERN, 'Enter a valid date.'),
        startTime: requiredTime('Start time'),
        endTime: requiredTime('End time'),
        breakMinutes: z
            .string()
            .trim()
            .optional()
            .or(z.literal(''))
            .refine(
                (value) =>
                    !value ||
                    (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 1440),
                'Enter a break between 0 and 1440 minutes.',
            )
            .transform((value) => (value ? Number(value) : 0)),
        isPaidBreak: z.boolean(),
        employeeId: optionalId,
        positionId: optionalId,
        departmentId: optionalId,
        branchId: optionalId,
        notes: optionalTrimmed(1000),
    })
    .superRefine((values, ctx) => {
        const span = computeSpanMinutes(values.startTime, values.endTime);

        if (span === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['endTime'],
                message: 'End time must be different from the start time.',
            });
            return;
        }

        if (!Number.isNaN(span) && values.breakMinutes >= span) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['breakMinutes'],
                message: 'Break must be shorter than the shift length.',
            });
        }
    });

/** Values produced by {@link useTemplateFormSchema} after transformation. */
export type UseTemplateFormValues = z.infer<typeof useTemplateFormSchema>;

/** Raw form input type (pre-transform) used by React Hook Form. */
export type UseTemplateFormInput = z.input<typeof useTemplateFormSchema>;
