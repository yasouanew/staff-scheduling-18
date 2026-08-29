import { z } from 'zod';

import { LEAVE_SESSIONS } from '@/types/leave-request';

/** File constraints mirrored by the multipart request validation. */
export const LEAVE_ATTACHMENT_ACCEPTED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const LEAVE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const LEAVE_ATTACHMENT_MAX_COUNT = 5;

/** Validation rules for a leave request submitted by an employee or manager. */
export const leaveRequestFormSchema = z
    .object({
        employeeId: z.string().min(1, 'Select the employee requesting leave.'),
        leaveTypeId: z.string().min(1, 'Select a leave type.'),
        startDate: z.string().min(1, 'Start date is required.'),
        endDate: z.string().min(1, 'End date is required.'),
        startSession: z.enum(LEAVE_SESSIONS),
        endSession: z.enum(LEAVE_SESSIONS),
        reason: z.string().trim().max(1000, 'Reason cannot exceed 1,000 characters.').nullable(),
        attachments: z
            .array(z.instanceof(File))
            .max(LEAVE_ATTACHMENT_MAX_COUNT, `Attach up to ${LEAVE_ATTACHMENT_MAX_COUNT} files.`),
    })
    .superRefine((values, context) => {
        const start = new Date(`${values.startDate}T00:00:00`);
        const end = new Date(`${values.endDate}T00:00:00`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return;
        }

        if (end < start) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['endDate'],
                message: 'End date must be on or after the start date.',
            });
        }

        if (values.startDate === values.endDate && values.startSession !== 'full_day') {
            if (values.endSession !== 'full_day' && values.startSession === values.endSession) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['endSession'],
                    message: 'Choose a full day or complementary half-day session for a one-day request.',
                });
            }
        }

        values.attachments.forEach((attachment, index) => {
            if (!LEAVE_ATTACHMENT_ACCEPTED_TYPES.includes(attachment.type as never)) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['attachments', index],
                    message: 'Attachments must be PDF, JPG, PNG, DOC, or DOCX files.',
                });
            }

            if (attachment.size > LEAVE_ATTACHMENT_MAX_BYTES) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['attachments', index],
                    message: 'Each attachment must be 5 MB or smaller.',
                });
            }
        });
    });

/** React Hook Form state for the leave request submission screen. */
export type LeaveRequestFormValues = z.infer<typeof leaveRequestFormSchema>;
