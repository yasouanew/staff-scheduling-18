import { z } from 'zod';

import { weekEndFor } from './lib/roster-week';

/**
 * Validation contracts for the roster management forms.
 *
 * Mirrors `StoreRosterRequest` / `UpdateRosterRequest` / `CopyPreviousWeekRequest`
 * so the client rejects invalid input before it reaches the API: `week_start` is
 * required, `week_end` must not precede it, and the status must be one of the
 * backend's allowed values.
 */

/** Matches a `yyyy-MM-dd` calendar date. */
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Reusable required ISO date field with a friendly message. */
const isoDate = (label: string) =>
    z
        .string()
        .trim()
        .min(1, `${label} is required`)
        .regex(isoDatePattern, `${label} must be a valid date`);

/** Normalises optional select values (`''` → `undefined`). */
const optionalId = z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional();

/** Create/edit roster form contract. */
export const rosterFormSchema = z
    .object({
        /** Monday (or first day) of the roster week. */
        weekStart: isoDate('Week start'),
        /** Last day of the roster week; auto-derived but user editable. */
        weekEnd: isoDate('Week end'),
        /** Optional branch scope. */
        branchId: optionalId,
        /** Lifecycle state. */
        status: z.enum(['draft', 'published', 'archived']),
    })
    .refine((values) => values.weekEnd >= values.weekStart, {
        path: ['weekEnd'],
        message: 'Week end must be on or after the week start',
    });

/** Raw (pre-validation) roster form values bound to the inputs. */
export type RosterFormInput = z.input<typeof rosterFormSchema>;

/** Parsed roster form values handed to the mutations. */
export type RosterFormValues = z.output<typeof rosterFormSchema>;

/** Copy-previous-week form contract. */
export const copyWeekSchema = z.object({
    /** First day of the NEW week being created. */
    weekStart: isoDate('Week start'),
    /** Optional branch scope for the new roster. */
    branchId: optionalId,
    /** Optional explicit source roster; otherwise the API picks the latest. */
    sourceRosterId: optionalId,
});

/** Raw copy-week values bound to the inputs. */
export type CopyWeekInput = z.input<typeof copyWeekSchema>;

/** Parsed copy-week values handed to the mutation. */
export type CopyWeekValues = z.output<typeof copyWeekSchema>;

/**
 * Builds default form values for a brand-new roster starting on `weekStart`,
 * deriving the inclusive Sunday end date.
 */
export function rosterDefaults(weekStart: string): RosterFormInput {
    return {
        weekStart,
        weekEnd: weekEndFor(weekStart),
        branchId: '',
        status: 'draft',
    };
}
