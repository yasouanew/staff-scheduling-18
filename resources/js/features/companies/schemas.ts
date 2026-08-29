import { z } from 'zod';

import {
    AUSTRALIAN_STATES,
    BUSINESS_TYPE_OPTIONS,
    COMPANY_STATUSES,
    COUNTRY_OPTIONS,
    CURRENCY_OPTIONS,
    DATE_FORMAT_OPTIONS,
    LANGUAGE_OPTIONS,
    TIMEZONE_OPTIONS,
    WEEK_START_DAYS,
} from '@/types/company';

/**
 * Zod validation schemas for the Companies feature.
 *
 * These schemas are the single source of truth for form validation. They are
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
/* Company profile schema (CompanyForm)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Validation for creating / editing a company.
 *
 * `name` and `timezone` are required (per spec); `email` must be a valid email
 * when present; `logo` is a reference string (hosted URL or data URL) capped at
 * the backend's 2048-character column limit.
 */
export const companyFormSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Company name is required.')
        .max(255, 'Company name must be 255 characters or fewer.'),
    abn: optionalTrimmed(50),
    email: z
        .string()
        .trim()
        .email('Enter a valid email address.')
        .max(255, 'Email must be 255 characters or fewer.')
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    phone: optionalTrimmed(50),
    logo: z
        .string()
        .trim()
        .max(2048, 'The logo reference is too large. Please use a smaller image or a URL.')
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    timezone: z
        .enum(toEnumValues(TIMEZONE_OPTIONS as unknown as [string, ...string[]]))
        .refine((value) => Boolean(value), { message: 'Timezone is required.' }),
    country: z
        .enum(toEnumValues(COUNTRY_OPTIONS as unknown as [string, ...string[]]))
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    state: z
        .enum(toEnumValues(AUSTRALIAN_STATES as unknown as [string, ...string[]]))
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    businessType: z
        .enum(toEnumValues(BUSINESS_TYPE_OPTIONS as unknown as [string, ...string[]]))
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    status: z.enum(toEnumValues(COMPANY_STATUSES as unknown as [string, ...string[]])),
});

/** Values produced by {@link companyFormSchema} after transformation. */
export type CompanyFormValues = z.infer<typeof companyFormSchema>;

/** Raw form input type (pre-transform) used by React Hook Form. */
export type CompanyFormInput = z.input<typeof companyFormSchema>;

/* -------------------------------------------------------------------------- */
/* Company settings schema (CompanySettingsForm)                              */
/* -------------------------------------------------------------------------- */

/** Validation for the operational + localisation settings form. */
export const companySettingsSchema = z.object({
    timezone: z.enum(toEnumValues(TIMEZONE_OPTIONS as unknown as [string, ...string[]])),
    dateFormat: z.enum(
        toEnumValues(
            DATE_FORMAT_OPTIONS.map((option) => option.value) as unknown as [string, ...string[]],
        ),
    ),
    timeFormat: z.enum(['12h', '24h']),
    weekStartDay: z.enum(toEnumValues(WEEK_START_DAYS as unknown as [string, ...string[]])),
    defaultShiftDuration: z.coerce
        .number()
        .int('Enter a whole number of minutes.')
        .min(0, 'Cannot be negative.')
        .max(1440, 'Cannot exceed 24 hours (1440 minutes).'),
    defaultBreakMinutes: z.coerce
        .number()
        .int('Enter a whole number of minutes.')
        .min(0, 'Cannot be negative.')
        .max(480, 'Cannot exceed 8 hours (480 minutes).'),
    currency: z.enum(toEnumValues(CURRENCY_OPTIONS as unknown as [string, ...string[]])),
    language: z.enum(
        toEnumValues(
            LANGUAGE_OPTIONS.map((option) => option.value) as unknown as [string, ...string[]],
        ),
    ),
    allowShiftSwap: z.boolean(),
    allowEmployeeAvailability: z.boolean(),
    allowLeaveRequests: z.boolean(),
    allowPushNotifications: z.boolean(),
    primaryColor: z
        .string()
        .trim()
        .regex(/^#([A-Fa-f0-9]{6})$/, 'Enter a valid 6-digit hex colour, e.g. #2563EB.')
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
    secondaryColor: z
        .string()
        .trim()
        .regex(/^#([A-Fa-f0-9]{6})$/, 'Enter a valid 6-digit hex colour, e.g. #64748B.')
        .optional()
        .or(z.literal(''))
        .transform((value) => (value ? value : undefined)),
});

/** Values produced by {@link companySettingsSchema} after transformation. */
export type CompanySettingsFormValues = z.infer<typeof companySettingsSchema>;

/** Raw settings form input type (pre-transform) used by React Hook Form. */
export type CompanySettingsFormInput = z.input<typeof companySettingsSchema>;
