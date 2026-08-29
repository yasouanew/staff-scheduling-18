import { z } from 'zod';

/**
 * Validation contract for the in-grid quick shift editor.
 *
 * Mirrors `StoreShiftRequest` / `UpdateShiftRequest`: `start_time` and `end_time`
 * are required `H:i` strings, `break_minutes` is a non-negative integer and
 * `required_staff` is 1–99. Times are kept as strings (that is what an
 * `<input type="time">` yields) and only coerced to numbers on transform.
 *
 * An end time *earlier* than the start time is intentionally allowed: it means
 * the shift runs past midnight, which the roster's hour calculations already
 * treat as an overnight span. Equal times are rejected because a zero-length
 * shift is never intended.
 */

/** Matches a 24-hour `HH:mm` wall-clock time. */
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reusable required time field with a friendly message. */
const timeField = (label: string) =>
    z
        .string()
        .trim()
        .min(1, `${label} is required`)
        .regex(timePattern, `${label} must be a valid time`);

export const quickShiftSchema = z
    .object({
        /** Local start time, `HH:mm`. */
        startTime: timeField('Start time'),
        /** Local end time, `HH:mm`; may be before the start for overnight shifts. */
        endTime: timeField('End time'),
        /** Unpaid/paid break length in minutes, held as a string by the input. */
        breakMinutes: z
            .string()
            .trim()
            .refine(
                (value) => value === '' || /^\d+$/.test(value),
                'Break must be a whole number of minutes',
            )
            .refine(
                (value) => value === '' || Number(value) <= 24 * 60,
                'Break cannot exceed 24 hours',
            )
            .transform((value) => (value === '' ? 0 : Number(value))),
        /** When true the break is paid and is not deducted from payable hours. */
        isPaidBreak: z.boolean(),
        /** Optional position/role assignment. */
        positionId: z
            .string()
            .trim()
            .transform((value) => (value === '' ? null : value)),
        /** Headcount required for this shift. */
        requiredStaff: z
            .string()
            .trim()
            .refine((value) => /^\d+$/.test(value), 'Required staff must be a whole number')
            .transform((value) => Number(value))
            .refine((value) => value >= 1 && value <= 99, 'Required staff must be between 1 and 99'),
        /** Free-text handover notes. */
        notes: z
            .string()
            .trim()
            .max(1000, 'Notes must be 1000 characters or fewer')
            .transform((value) => (value === '' ? null : value)),
    })
    .refine((values) => values.startTime !== values.endTime, {
        path: ['endTime'],
        message: 'End time must differ from the start time',
    });

/** Raw (pre-validation) values bound to the quick editor's inputs. */
export type QuickShiftInput = z.input<typeof quickShiftSchema>;

/** Parsed values handed to the shift mutations. */
export type QuickShiftValues = z.output<typeof quickShiftSchema>;
