import { z } from 'zod';

import { LEAVE_TYPE_STATUSES } from '@/types/leave-type';

/** Form validation for leave types offered in employee leave requests. */
export const leaveTypeFormSchema = z
    .object({
        name: z.string().trim().min(1, 'Leave type name is required.').max(255),
        code: z.string().trim().max(50, 'Code cannot exceed 50 characters.').nullable(),
        description: z.string().trim().max(1000, 'Description cannot exceed 1,000 characters.').nullable(),
        allowanceDays: z
            .number({ error: 'Enter an annual allowance in days.' })
            .min(0, 'Allowance cannot be negative.')
            .max(365, 'Allowance cannot exceed 365 days.')
            .nullable(),
        isPaid: z.boolean(),
        allowsRollover: z.boolean(),
        maxRolloverDays: z
            .number({ error: 'Enter the maximum days that may roll over.' })
            .min(0, 'Rollover cannot be negative.')
            .max(365, 'Rollover cannot exceed 365 days.')
            .nullable(),
        requiresApproval: z.boolean(),
        allowsHalfDay: z.boolean(),
        maxDaysPerRequest: z
            .number({ error: 'Enter the maximum days per request.' })
            .int('Maximum days per request must be a whole number.')
            .min(1, 'Maximum days per request must be at least one day.')
            .max(365, 'Maximum days per request cannot exceed 365 days.')
            .nullable(),
        status: z.enum(LEAVE_TYPE_STATUSES),
    })
    .superRefine((values, context) => {
        if (values.allowsRollover && values.maxRolloverDays === null) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxRolloverDays'],
                message: 'Set the maximum days employees may carry into the next leave year.',
            });
        }

        if (!values.allowsRollover && values.maxRolloverDays !== null) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxRolloverDays'],
                message: 'Enable rollover before setting a rollover limit.',
            });
        }

        if (
            values.allowanceDays !== null &&
            values.maxRolloverDays !== null &&
            values.maxRolloverDays > values.allowanceDays
        ) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxRolloverDays'],
                message: 'Rollover cannot exceed the annual allowance.',
            });
        }
    });

/** Values handled by React Hook Form in the leave type editor. */
export type LeaveTypeFormValues = z.infer<typeof leaveTypeFormSchema>;
