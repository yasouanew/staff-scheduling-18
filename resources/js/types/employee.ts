/**
 * Domain types for the Company Admin Employee Directory.
 *
 * These are the canonical shapes consumed by the employees feature. They are
 * intentionally decoupled from any transport/DTO layer so UI components depend
 * only on stable, well-named fields.
 */

/** Employment lifecycle state used to drive status badges. */
export type EmployeeStatus = 'active' | 'pending' | 'inactive';

/**
 * Operational department an employee belongs to.
 *
 * Departments are records each company creates for itself, so this is an open
 * string resolved from the API — never a fixed union. A hardcoded union would
 * silently coerce any real department the company created into one of a few
 * built-in names.
 */
export type DepartmentName = string;


/**
 * Onboarding state of a team member's invitation, as reported by the API.
 *
 * `none` is a client-side sentinel for "never invited", which lets the row menu
 * label its action "Send invite" vs "Resend invite" without extra requests.
 */
export type InvitationStatus = 'none' | 'pending' | 'expired' | 'accepted';

/**
 * How an invited person finishes onboarding.
 *
 * Company admins and schedulers set a password in this web app (`web`);
 * employees are guided to install the mobile app and verify by emailed code
 * (`mobile`). The backend derives this from the invited role.
 */
export type InvitationChannel = 'web' | 'mobile';

/** Invitation metadata attached to a directory row. */
export interface EmployeeInvitation {
    /** Current onboarding state. */
    status: Exclude<InvitationStatus, 'none'>;
    /** Which onboarding journey the invitee was sent down. */
    channel: InvitationChannel;
    /** Role the invitation grants once accepted. */
    role: EmployeeRole;
    /** Address the invitation was emailed to. */
    email: string;
    /** ISO-8601 timestamp of the most recent send, when known. */
    lastSentAt: string | null;
    /** ISO-8601 expiry of the emailed link (web channel only). */
    expiresAt: string | null;
}

/** A single team member row in the directory. */
export interface Employee {

    /** Stable unique identifier. */
    id: string;
    /** Full display name. */
    name: string;
    /** Contact email, also used as the login identity. */
    email: string;
    /**
     * Optional avatar image URL. When absent, the UI falls back to rendering
     * initials derived from {@link Employee.name}.
     */
    avatarUrl?: string;
    /** Job title / role label. */
    position: string;
    /** Assigned department name, resolved from the departments relation. */
    department: DepartmentName;
    /** Identifier of the assigned department, or `null` when unassigned. */
    departmentId: string | null;

    /**
     * Identifier of the branch this employee is rostered at, or `null` when
     * unassigned. Referenced by the branches feature (`/branches/:id`).
     */
    branchId: string | null;
    /** Human-readable branch name resolved from the branches relation. */
    branchName: string | null;
    /** Current employment status. */
    status: EmployeeStatus;
    /** ISO-8601 date (yyyy-MM-dd) the employee joined. */
    joinedDate: string;
    /** Identifier of the assigned position, or `null` when unassigned. */
    positionId: string | null;
    /** Employment basis (`full_time`, `part_time`, `casual`, ...). */
    employmentType: EmploymentType;
    /** Payroll rate per hour, or `null` when not recorded. */
    hourlyRate: string | null;
    /** Access level of the linked login account, when one exists. */
    role: EmployeeRole | null;
    /** Onboarding invitation state, or `null` when never invited. */
    invitation: EmployeeInvitation | null;
}

/**
 * Employment basis recorded against an employee.
 *
 * Mirrors the backend's `employment_type` enum so the edit form can never submit
 * a value the API would reject.
 */
export type EmploymentType = 'full_time' | 'part_time' | 'casual' | 'contract';

/** Selectable employment types, ordered most → least common. */
export const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
    'full_time',
    'part_time',
    'casual',
    'contract',
] as const;

/** Human-readable labels for {@link EmploymentType}. */
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
    full_time: 'Full time',
    part_time: 'Part time',
    casual: 'Casual',
    contract: 'Contract',
};

/** Selectable employment statuses for the edit form. */
export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = [
    'active',
    'pending',
    'inactive',
] as const;

/** Human-readable labels for {@link EmployeeStatus}. */
export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
    active: 'Active',
    pending: 'Pending',
    inactive: 'Inactive',
};


/**
 * Access level granted to a new team member's login account.
 *
 * Mirrors the backend's `in:company_admin,scheduler,employee` rule exactly, so
 * the select can never offer a value the API would reject. Determines what the
 * person sees after signing in: company admins get the full admin dashboard,
 * schedulers get the scheduling workspace, and `employee` has no browser access
 * at all (the web app bounces them back to the login screen).
 */
export type EmployeeRole = 'company_admin' | 'scheduler' | 'employee';

/** Selectable roles, ordered least → most privileged for the form. */
export const EMPLOYEE_ROLES: readonly EmployeeRole[] = [
    'employee',
    'scheduler',
    'company_admin',
] as const;

/** Human-readable labels for {@link EmployeeRole}. */
export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
    employee: 'Employee',
    scheduler: 'Scheduler',
    company_admin: 'Company Admin',
};

/**
 * Plain-language explanation of what each role can reach, shown as helper text
 * so an admin understands the consequence before granting access.
 */
export const EMPLOYEE_ROLE_DESCRIPTIONS: Record<EmployeeRole, string> = {
    employee: 'Mobile app only — cannot sign in to this web dashboard.',
    scheduler: 'Signs in to the scheduling workspace: rosters, shifts and leave.',
    company_admin: 'Full access to this dashboard, including team and settings.',
};

/** The default role for a new starter — the least privileged option. */
export const DEFAULT_EMPLOYEE_ROLE: EmployeeRole = 'employee';

/**
 * Payload accepted when inviting/adding a new employee.
 *
 * Department, position and branch all reference real records by id so the
 * assignment actually persists; the backend expects `*_id` foreign keys, not
 * free-text names.
 */
export interface CreateEmployeeInput {
    name: string;
    email: string;
    /** Access level for the linked login account. */
    role: EmployeeRole;

    /** Position (job title) record id, or empty string when not assigned. */
    positionId: string;
    /** Department record id, or empty string when not assigned. */
    departmentId: string;
    /** Branch the new employee is assigned to (empty string = unassigned). */
    branchId: string;
}


/**
 * Payload accepted when editing an existing employee from the row menu.
 *
 * Only profile fields live here — the login role is changed through the invite
 * dialog (and the dedicated role endpoint) because it also decides which
 * onboarding email a person receives.
 */
export interface UpdateEmployeeInput {
    /** Given name. */
    firstName: string;
    /** Family name. */
    lastName: string;
    /** Position (job title) record id, or empty string when not assigned. */
    positionId: string;
    /** Department record id, or empty string when not assigned. */
    departmentId: string;
    /** Branch record id, or empty string when unassigned. */
    branchId: string;
    /** Employment basis. */
    employmentType: EmploymentType;
    /** Payroll rate per hour as typed, or empty string when not recorded. */
    hourlyRate: string;
    /** Employment lifecycle state. */
    status: EmployeeStatus;
}

/**
 * Payload for sending (or re-sending) an onboarding invitation.
 *
 * `email` may be omitted for someone who already has a linked account; supply
 * it to invite an employee who was added without a login, or to correct a typo
 * before re-sending.
 */
export interface SendInvitationInput {
    /** Role the invitation grants — also decides web vs mobile onboarding. */
    role: EmployeeRole;
    /** Address to invite, or empty string to keep the existing one. */
    email: string;
}

/** Result of a successful invitation send, used to tailor the success toast. */
export interface SendInvitationResult {
    channel: InvitationChannel;
    email: string;
}

/** Server-side filters accepted by the employees list endpoint. */

export interface EmployeeListParams {
    /** Restricts results to a single branch (see the branches feature). */
    branchId?: string;
    /** Restricts results to a single department (see the departments feature). */
    departmentId?: string;

    /** Restricts results to a single employment status. */
    status?: EmployeeStatus;
    /** Page size requested from the API. */
    perPage?: number;
}

/** Aggregate counters surfaced in the directory's KPI summary row. */
export interface EmployeeStats {
    total: number;
    active: number;
    pending: number;
}

/** Placeholder shown wherever an employee has no department assigned. */
export const NO_DEPARTMENT_LABEL = '—';

