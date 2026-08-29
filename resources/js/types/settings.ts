/**
 * Type definitions for the Company & Branch Settings Management module.
 *
 * These interfaces model the organisation-wide configuration surface: the
 * company profile, per-branch regional configuration (tuned for the Australian
 * market), department parameters, and global operational policies.
 */

/** Australian states and territories used across branch configuration. */
export const AUSTRALIAN_STATES = [
    'NSW',
    'VIC',
    'QLD',
    'WA',
    'SA',
    'TAS',
    'NT',
    'ACT',
] as const;

/** A single Australian state/territory code. */
export type AustralianState = (typeof AUSTRALIAN_STATES)[number];

/** Human-readable labels for each state/territory. */
export const AUSTRALIAN_STATE_LABELS: Record<AustralianState, string> = {
    NSW: 'New South Wales',
    VIC: 'Victoria',
    QLD: 'Queensland',
    WA: 'Western Australia',
    SA: 'South Australia',
    TAS: 'Tasmania',
    NT: 'Northern Territory',
    ACT: 'Australian Capital Territory',
};

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

/**
 * Per-branch base labour rate multipliers applied on top of the base hourly
 * rate to calculate penalty rates for different shift conditions.
 */
export interface LaborRateMultipliers {
    /** Standard weekday multiplier (typically 1.0). */
    weekday: number;
    /** Saturday penalty multiplier. */
    saturday: number;
    /** Sunday penalty multiplier. */
    sunday: number;
    /** Public holiday penalty multiplier. */
    publicHoliday: number;
}

/** Full branch configuration record. */
export interface BranchConfiguration {
    /** Unique branch identifier. */
    id: string;
    /** Display name of the branch. */
    name: string;
    /** State/territory the branch operates in. */
    state: AustralianState;
    /** Timezone used for the branch's shift calculations. */
    timezone: AustralianTimezone;
    /** Base hourly labour rate in AUD. */
    baseHourlyRate: number;
    /** Penalty-rate multipliers keyed by shift condition. */
    rateMultipliers: LaborRateMultipliers;
    /** ISO 8601 timestamp of the last update. */
    updatedAt: string;
}

/** Values submitted by the {@link BranchForm}. */
export interface BranchFormValues {
    name: string;
    state: AustralianState;
    timezone: AustralianTimezone;
    baseHourlyRate: number;
    weekdayMultiplier: number;
    saturdayMultiplier: number;
    sundayMultiplier: number;
    publicHolidayMultiplier: number;
}

/** Department-level scheduling parameters shown on the Departments tab. */
export interface DepartmentParameters {
    /** Unique department identifier. */
    id: string;
    /** Department display name. */
    name: string;
    /** Branch this department belongs to. */
    branchId: string;
    /** Minimum staff required on any given shift. */
    minimumStaffPerShift: number;
    /** Colour token used to theme the department in the roster calendar. */
    colorToken: string;
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
