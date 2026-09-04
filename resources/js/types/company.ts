/**
 * Domain types for the Companies (tenant organisation) feature.
 *
 * These are the canonical shapes consumed by the companies feature. They are
 * intentionally decoupled from the transport/DTO layer (see `useCompanies`)
 * so UI components depend only on stable, well-named fields.
 */

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/** Lifecycle state of a company account. */
export const COMPANY_STATUSES = ['active', 'inactive', 'suspended'] as const;

/** Company lifecycle state used to drive status badges and toggles. */
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

/** Human-readable labels for each company status. */
export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
    suspended: 'Suspended',
};

/* -------------------------------------------------------------------------- */
/* Core domain models                                                         */
/* -------------------------------------------------------------------------- */

/** A single tenant company/organisation record. */
export interface Company {
    /** Stable unique identifier (stringified for routing convenience). */
    id: string;
    /** Registered trading/legal name. */
    name: string;
    /** Australian Business Number, when supplied. */
    abn: string | null;
    /** Primary contact email. */
    email: string | null;
    /** Primary contact phone. */
    phone: string | null;
    /** Logo reference (hosted URL or data URL). */
    logo: string | null;
    /** IANA timezone identifier, e.g. `Australia/Sydney`. */
    timezone: string | null;
    /** Country of operation. */
    country: string | null;
    /** State / territory of operation. */
    state: string | null;
    /** Industry / business type classification. */
    businessType: string | null;
    /** Current account status. */
    status: CompanyStatus;
    /** Linked subscription id, when a plan is active. */
    subscriptionId: number | null;
    /** ISO-8601 timestamp of when the trial period ends. */
    trialEndsAt: string | null;
    /** ISO-8601 timestamp of when access was locked (billing), if locked. */
    lockedAt: string | null;
    /** Number of branches (present when counted by the API). */
    branchesCount: number | null;
    /** Number of employees (present when counted by the API). */
    employeesCount: number | null;
    /** Number of linked user accounts (present when counted by the API). */
    usersCount: number | null;
    /** Operational + localisation settings, when loaded by the API. */
    settings: CompanySettings | null;
    /** ISO-8601 creation timestamp. */
    createdAt: string | null;
    /** ISO-8601 last-updated timestamp. */
    updatedAt: string | null;
}

/** Operational + localisation settings owned by a company. */
export interface CompanySettings {
    id: number;
    companyId: number;
    /** IANA timezone identifier. */
    timezone: string;
    /** PHP-style date format token, e.g. `Y-m-d`. */
    dateFormat: string;
    /** Clock format. */
    timeFormat: '12h' | '24h';
    /** First day of the working week. */
    weekStartDay: string;
    /** Default shift duration, in minutes. */
    defaultShiftDuration: number;
    /** Default unpaid break, in minutes. */
    defaultBreakMinutes: number;
    /** ISO 4217 currency code, e.g. `AUD`. */
    currency: string;
    /** Locale/language code, e.g. `en`. */
    language: string;
    /** Allow employees to swap shifts. */
    allowShiftSwap: boolean;
    /** Allow employees to submit availability. */
    allowEmployeeAvailability: boolean;
    /** Allow employees to raise leave requests. */
    allowLeaveRequests: boolean;
    /** Send push notifications for scheduling events. */
    allowPushNotifications: boolean;
    /** Branding logo reference. */
    logo: string | null;
    /** Brand primary colour (hex). */
    primaryColor: string | null;
    /** Brand secondary colour (hex). */
    secondaryColor: string | null;
}

/** A condensed view of a company's subscription, for the detail page. */
export interface CompanySubscription {
    id: number;
    /** Internal lifecycle status. */
    status: string;
    /** Stripe subscription status, when synced. */
    stripeStatus: string | null;
    /** Billing cadence, e.g. `monthly` / `yearly`. */
    billingCycle: string | null;
    /** Resolved plan name, when the plan relation is loaded. */
    planName: string | null;
    /** Whether the subscription is currently on trial. */
    onTrial: boolean;
    /** Whether the subscription is currently active. */
    isActive: boolean;
    /** Whether the subscription has been cancelled. */
    isCancelled: boolean;
    startsAt: string | null;
    endsAt: string | null;
    trialEndsAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Query params                                                               */
/* -------------------------------------------------------------------------- */

/** Filters accepted by the companies list endpoint. */
export interface CompanyListParams {
    search?: string;
    status?: CompanyStatus;
    businessType?: string;
    perPage?: number;
}

/* -------------------------------------------------------------------------- */
/* Select option catalogues                                                   */
/* -------------------------------------------------------------------------- */

/** Supported IANA timezones for the Australian market (plus UTC). */
export const TIMEZONE_OPTIONS = [
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'Australia/Perth',
    'Australia/Hobart',
    'Australia/Darwin',
    'Australia/Canberra',
    'Pacific/Auckland',
    'UTC',
] as const;

/** Friendly labels for the supported timezones. */
export const TIMEZONE_LABELS: Record<string, string> = {
    'Australia/Sydney': 'Sydney (AEST/AEDT)',
    'Australia/Melbourne': 'Melbourne (AEST/AEDT)',
    'Australia/Brisbane': 'Brisbane (AEST)',
    'Australia/Adelaide': 'Adelaide (ACST/ACDT)',
    'Australia/Perth': 'Perth (AWST)',
    'Australia/Hobart': 'Hobart (AEST/AEDT)',
    'Australia/Darwin': 'Darwin (ACST)',
    'Australia/Canberra': 'Canberra (AEST/AEDT)',
    'Pacific/Auckland': 'Auckland (NZST/NZDT)',
    UTC: 'UTC',
};

/** Industry classifications offered when creating/editing a company. */
export const BUSINESS_TYPE_OPTIONS = [
    'Hospitality',
    'Retail',
    'Healthcare',
    'Aged Care',
    'Logistics',
    'Security',
    'Construction',
    'Education',
    'Events',
    'Professional Services',
    'Other',
] as const;

/** Countries offered in the company form. */
export const COUNTRY_OPTIONS = ['Australia', 'New Zealand'] as const;

/** Australian states / territories. */
export const AUSTRALIAN_STATES = [
    'NSW',
    'VIC',
    'QLD',
    'WA',
    'SA',
    'TAS',
    'ACT',
    'NT',
] as const;

/** Supported ISO 4217 currency codes. */
export const CURRENCY_OPTIONS = ['AUD', 'NZD', 'USD'] as const;

/** Supported locale/language codes with labels. */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'en', label: 'English' },
    { value: 'en-AU', label: 'English (Australia)' },
    { value: 'en-NZ', label: 'English (New Zealand)' },
];

/** Days of the week for the "week starts on" setting. */
export const WEEK_START_DAYS = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
] as const;

/** Date-format tokens offered in settings, with an example rendering. */
export const DATE_FORMAT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'Y-m-d', label: '2026-08-13 (ISO)' },
    { value: 'd/m/Y', label: '13/08/2026 (AU)' },
    { value: 'd-m-Y', label: '13-08-2026' },
    { value: 'd M Y', label: '13 Aug 2026' },
    { value: 'm/d/Y', label: '08/13/2026 (US)' },
];
