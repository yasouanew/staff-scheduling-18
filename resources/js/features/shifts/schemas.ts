import { z } from 'zod';

import { SHIFT_STATUSES } from '@/types/shift';

/**
 * Shift form rules. Times are stored as a local date plus `HH:mm` time in the
 * selected roster branch's timezone, so both values are validated independently
 * before their duration is compared.
 */
export const shiftFormSchema = z
    .object({
        rosterId: z.string().min(1, 'Select the roster this shift belongs to.'),
        date: z.string().min(1, 'Shift date is required.'),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid start time.'),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid end time.'),
        positionId: z.string().nullable(),
        employeeId: z.string().nullable(),
        requiredStaff: z
            .number({ error: 'Enter the number of staff required.' })
            .int('Staff required must be a whole number.')
            .min(1, 'At least one staff member is required.')
            .max(99, 'Staff required cannot exceed 99.'),
        notes: z.string().max(1000, 'Notes cannot exceed 1,000 characters.').nullable(),
        status: z.enum(SHIFT_STATUSES),
    })
    .superRefine((values, context) => {
        const [startHours, startMinutes] = values.startTime.split(':').map(Number);
        const [endHours, endMinutes] = values.endTime.split(':').map(Number);
        const startTotal = startHours * 60 + startMinutes;
        const endTotal = endHours * 60 + endMinutes;

        if (endTotal <= startTotal) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['endTime'],
                message: 'End time must be after the start time. Overnight shifts are not supported.',
            });
            return;
        }

        if (endTotal - startTotal > 16 * 60) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['endTime'],
                message: 'A shift cannot be longer than 16 hours.',
            });
        }
    });

/** Inferred values used by the React Hook Form shift editor. */
export type ShiftFormValues = z.infer<typeof shiftFormSchema>;
