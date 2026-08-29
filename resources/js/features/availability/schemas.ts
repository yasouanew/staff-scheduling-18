import { z } from 'zod';

import { DAY_LABELS, type DayOfWeek } from '@/types/employee-availability';

import { isValidTime, timeToMinutes } from './lib/availability-grid';

/**
 * Zod validation for the weekly-availability editor.
 *
 * Single source of truth shared by React Hook Form (`zodResolver`) and the
 * mutation payloads, so the inline field errors the user sees always match what
 * the backend would accept (`date_format:H:i`, `end_time` after `start_time`).
 */

/** Day indexes accepted by the backend (`between:0,6`). */
const dayOfWeekSchema = z
    .number()
    .int('Pick a day of the week.')
    .min(0, 'Pick a day of the week.')
    .max(6, 'Pick a day of the week.');

/** A strict 24-hour `HH:mm` field. */
const timeSchema = z
    .string()
    .trim()
    .min(1, 'Required.')
    .refine((value) => isValidTime(value) || value === '24:00', {
        message: 'Use a 24-hour time such as 09:00.',
    });

/**
 * A single availability range.
 *
 * The cross-field rule enforces a positive duration; overlap detection needs
 * the whole day's ranges and is therefore applied by the form container via
 * `findOverlap` rather than inside the schema.
 */
export const availabilityRangeSchema = z
    .object({
        dayOfWeek: dayOfWeekSchema,
        startTime: timeSchema,
        endTime: timeSchema,
        isAvailable: z.boolean(),
        /** Days the range should additionally be copied to. */
        copyToDays: z.array(dayOfWeekSchema),
    })
    .refine((values) => timeToMinutes(values.endTime) > timeToMinutes(values.startTime), {
        message: 'End time must be after the start time.',
        path: ['endTime'],
    })
    .refine((values) => !values.copyToDays.includes(values.dayOfWeek), {
        message: 'This day is already the primary day.',
        path: ['copyToDays'],
    });

/** Values produced by {@link availabilityRangeSchema}. */
export type AvailabilityRangeFormValues = z.infer<typeof availabilityRangeSchema>;

/** Raw form input type (pre-parse) used by React Hook Form. */
export type AvailabilityRangeFormInput = z.input<typeof availabilityRangeSchema>;

/** Human label for a day index, used in toasts and confirmation copy. */
export function dayLabel(day: DayOfWeek): string {
    return DAY_LABELS[day];
}
