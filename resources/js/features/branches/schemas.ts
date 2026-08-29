import { z } from 'zod';

import { BRANCH_STATUSES, TIMEZONE_OPTIONS, WEEKDAYS, type Weekday } from '@/types/branch';


/**
 * Zod validation schemas for the Branches feature.
 *
 * This schema is the single source of truth for branch form validation. It is
 * shared by React Hook Form (`zodResolver`) and, via the inferred types, by the
 * data-mutation hooks — so the form and the network payload can never drift.
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
/* Operating hours & breaks                                                   */
/* -------------------------------------------------------------------------- */

/** `HH:MM`, the only format `<input type="time">` produces. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * An optional `HH:MM` time.
 *
 * Empty is a legitimate answer ("we haven't decided our hours yet"), so "" is
 * normalised to `undefined` rather than being reported as an error.
 */
const optionalTime = z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || TIME_PATTERN.test(value), {
        message: 'Enter a valid time (HH:MM).',
    });

/**
 * An optional break length in minutes.
 *
 * Accepts a string because number inputs yield strings, and an empty field must
 * stay distinguishable from a deliberate `0` ("no break"). Capped at 8 hours to
 * match the backend: longer than that is a split shift, not a break.
 */
const optionalBreakMinutes = z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
        if (value === undefined || value === '') return undefined;
        const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? undefined : parsed;
    })
    .refine((value) => value === undefined || (value >= 0 && value <= 480), {
        message: 'Break must be between 0 and 480 minutes.',
    });

/** How a break is treated for pay. Mirrors the radio group's two options. */
export const BREAK_PAY_TYPES = ['unpaid', 'paid'] as const;

/** Whether a break counts as paid time. */
export type BreakPayType = (typeof BREAK_PAY_TYPES)[number];

/**
 * One weekday's override.
 *
 * `useDefault` is the important field: while it is true the day simply follows
 * the branch's standard hours, and the row's own values are ignored on submit.
 * This lets a manager fill in Saturday, untick it, and still have their figures
 * waiting if they tick it again — a plain "clear the fields" model would throw
 * that work away.
 *
 * A closed day is also modelled here rather than as empty times, because
 * "closed" and "not yet configured" must not collapse into the same state.
 */
const dayScheduleSchema = z.object({
    useDefault: z.boolean(),
    isOpen: z.boolean(),
    opensAt: optionalTime,
    closesAt: optionalTime,
    breakMinutes: optionalBreakMinutes,
    breakPayType: z.enum(toEnumValues(BREAK_PAY_TYPES as unknown as [string, ...string[]])),
});

/** Every weekday, so React Hook Form can register a stable field per row. */
const weekScheduleSchema = z.object(
    WEEKDAYS.reduce(
        (shape, weekday) => ({ ...shape, [weekday]: dayScheduleSchema }),
        {} as Record<Weekday, typeof dayScheduleSchema>,
    ),
);


/* -------------------------------------------------------------------------- */
/* Branch schema (BranchForm)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validation for creating / editing a branch.
 *
 * `name` and `timezone` are required (per spec + backend contract). `phone` is
 * validated for a lenient international format when present; `address` is a
 * free-text field capped at the backend's column limit.
 */
export const branchFormSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Branch name is required.')
        .max(255, 'Branch name must be 255 characters or fewer.'),
    managerId: z
        .string()
        .trim()
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    phone: z
        .string()
        .trim()
        .max(50, 'Phone must be 50 characters or fewer.')
        .regex(
            /^[+()\-\s0-9]{6,}$/,
            'Enter a valid phone number (digits, spaces, +, - and () only).',
        )
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    address: optionalTrimmed(1000),
    timezone: z
        .enum(toEnumValues(TIMEZONE_OPTIONS as unknown as [string, ...string[]]))
        .refine((value) => Boolean(value), { message: 'Timezone is required.' }),
    status: z.enum(toEnumValues(BRANCH_STATUSES as unknown as [string, ...string[]])),

    /* Standard working day, applied to any weekday without an override. */
    defaultOpensAt: optionalTime,
    defaultClosesAt: optionalTime,
    defaultBreakMinutes: optionalBreakMinutes,
    defaultBreakPayType: z.enum(
        toEnumValues(BREAK_PAY_TYPES as unknown as [string, ...string[]]),
    ),

    /** Per-weekday overrides, revealed under "Advanced options". */
    daySchedules: weekScheduleSchema,
})
    /*
     * Opening and closing must differ. Deliberately *not* "close after open":
     * a venue trading 18:00–02:00 crosses midnight, which is normal in
     * hospitality — but a zero-length day is always a mistake.
     */
    .refine(
        (values) =>
            !values.defaultOpensAt ||
            !values.defaultClosesAt ||
            values.defaultOpensAt !== values.defaultClosesAt,
        {
            message: 'Closing time must differ from opening time.',
            path: ['defaultClosesAt'],
        },
    )
    .superRefine((values, ctx) => {
        for (const weekday of WEEKDAYS) {
            const day = values.daySchedules[weekday];

            // A day that follows the default, or is closed, has no times of its
            // own to contradict.
            if (day.useDefault || !day.isOpen) continue;

            if (day.opensAt && day.closesAt && day.opensAt === day.closesAt) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Closing time must differ from opening time.',
                    path: ['daySchedules', weekday, 'closesAt'],
                });
            }
        }
    });


/** Values produced by {@link branchFormSchema} after transformation. */
export type BranchFormValues = z.infer<typeof branchFormSchema>;

/** Raw form input type (pre-transform) used by React Hook Form. */
export type BranchFormInput = z.input<typeof branchFormSchema>;
