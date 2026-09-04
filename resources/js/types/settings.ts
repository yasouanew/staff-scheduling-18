/**
 * Type definitions for the Company & Branch Settings Management module.
 *
 * These interfaces model the organisation-wide configuration surface: the
 * company profile, per-branch regional configuration (tuned for the Australian
 * market), and global operational policies.
 */

/** Standard Australian regional timezones relevant to shift calculations. */
export const AUSTRALIAN_TIMEZONES = [
    'AEST',
    'AEDT',
    'ACST',
    'ACDT',
    'AWST',
] as const;

/** A single Australian timezone abbreviation. */
export type AustralianTimezone = (typeof AUSTRALIAN_TIMEZONES)[number];

/** Descriptive labels for each supported timezone. */
export const AUSTRALIAN_TIMEZONE_LABELS: Record<AustralianTimezone, string> = {
    AEST: 'Australian Eastern Standard Time (UTC+10)',
    AEDT: 'Australian Eastern Daylight Time (UTC+11)',
    ACST: 'Australian Central Standard Time (UTC+9:30)',
    ACDT: 'Australian Central Daylight Time (UTC+10:30)',
    AWST: 'Australian Western Standard Time (UTC+8)',
};

/** Company-wide profile metadata shown on the Company Profile tab. */
export interface OrganizationProfile {
    /** Unique organisation identifier. */
    id: string;
    /** Legal/trading name of the organisation. */
    legalName: string;
    /** Australian Business Number (11 digits). */
    abn: string;
    /** Primary contact email for the organisation. */
    contactEmail: string;
    /** Primary contact phone number. */
    contactPhone: string;
    /** Default timezone applied to new branches. */
    defaultTimezone: AustralianTimezone;
    /** ISO 8601 timestamp of the last profile update. */
    updatedAt: string;
}

/** Identifier keys for each toggleable operational policy. */
export type OperationalPolicyKey =
    | 'preventSchedulingDuringLeave'
    | 'enforceMandatoryBreaks'
    | 'autoPublishRosters'
    | 'notifyOnShiftSwap'
    | 'restrictOvertimeWithoutApproval';

/** The complete set of global operational policy switches. */
export type OperationalPolicies = Record<OperationalPolicyKey, boolean>;

/** Descriptive metadata used to render each policy row. */
export interface PolicyDescriptor {
    /** Policy identifier key. */
    key: OperationalPolicyKey;
    /** Short human-readable title. */
    title: string;
    /** Longer explanation of what enabling the policy does. */
    description: string;
}
