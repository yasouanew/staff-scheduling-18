/**
 * Employee Availability & Leave Request types for the Staff Scheduling SaaS.
 *
 * Covers recurring weekly availability blocks, custom date overrides, and
 * leave request workflows (Pending → Approved / Rejected).
 */

/** Days of the week for recurring availability grids. */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Leave request types common in Australian workplaces. */
export const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Personal Leave', 'Unpaid Leave'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

/** Leave request approval workflow states. */
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

/**
 * A single time block within a day representing employee availability.
 * Times are stored in 24-hour 'HH:mm' format (e.g. '09:00', '17:30').
 */
export interface AvailabilityBlock {
    /** Start time in 'HH:mm' format. */
    startTime: string;
    /** End time in 'HH:mm' format. */
    endTime: string;
    /** Whether the employee is available or explicitly unavailable during this block. */
    available: boolean;
}

/**
 * Recurring weekly availability pattern. Maps each weekday to an array of
 * availability blocks, allowing multiple shifts per day (e.g. split shifts).
 */
export type WeeklyAvailability = {
    [K in Weekday]: AvailabilityBlock[];
};

/**
 * A single leave request record from an employee, tracked through approval workflow.
 */
export interface LeaveRequest {
    /** Unique identifier. */
    id: string;
    /** Employee ID who submitted the request. */
    employeeId: string;
    /** Employee's full name (denormalized for display). */
    employeeName: string;
    /** Type of leave being requested. */
    leaveType: LeaveType;
    /** Start date in ISO 8601 format (YYYY-MM-DD). */
    startDate: string;
    /** End date in ISO 8601 format (YYYY-MM-DD). */
    endDate: string;
    /** Optional reason or notes provided by the employee. */
    reason?: string;
    /** Current approval status. */
    status: LeaveStatus;
    /** Date the request was created, ISO 8601 format. */
    createdAt: string;
    /** Admin ID who approved/rejected (null if still pending). */
    reviewedBy?: string;
    /** Date of approval/rejection (null if still pending). */
    reviewedAt?: string;
}

/**
 * Input shape for creating a new leave request (admin or employee initiated).
 */
export interface CreateLeaveRequestInput {
    employeeId: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    reason?: string;
}

/**
 * Input shape for approving a pending leave request.
 */
export interface ApproveLeaveRequestInput {
    requestId: string;
}

/**
 * Input shape for rejecting a pending leave request.
 */
export interface RejectLeaveRequestInput {
    requestId: string;
    reason?: string;
}
