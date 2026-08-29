/** Lifecycle states used by the leave request review workflow. */
export const LEAVE_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

/** A request state shown to employees and managers. */
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

/** Session boundaries supported for full-day and half-day requests. */
export const LEAVE_SESSIONS = ['full_day', 'first_half', 'second_half'] as const;

/** A day-session value saved with a leave request. */
export type LeaveSession = (typeof LEAVE_SESSIONS)[number];

/** User-facing labels for status chips and filter controls. */
export const LEAVE_REQUEST_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
    pending: 'Pending review',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
};

/** User-facing labels for the requested day boundary. */
export const LEAVE_SESSION_LABELS: Record<LeaveSession, string> = {
    full_day: 'Full day',
    first_half: 'First half',
    second_half: 'Second half',
};

/** Compact employee identity rendered on leave request cards and review pages. */
export interface LeaveRequestEmployee {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    branchName: string | null;
}

/** Leave policy summary supplied alongside the request. */
export interface LeaveRequestLeaveType {
    id: string;
    name: string;
    allowanceDays: number | null;
    isPaid: boolean;
    allowsHalfDay: boolean;
}

/** Reviewer identity attached to a final decision. */
export interface LeaveRequestReviewer {
    id: string;
    name: string;
}

/** A submitted employee absence request. */
export interface LeaveRequest {
    id: string;
    companyId: number | null;
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    startSession: LeaveSession;
    endSession: LeaveSession;
    totalDays: number;
    reason: string | null;
    attachments: string[];
    status: LeaveRequestStatus;
    approvedBy: string | null;
    approvedAt: string | null;
    rejectedBy: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    adminNotes: string | null;
    employee: LeaveRequestEmployee | null;
    leaveType: LeaveRequestLeaveType | null;
    approver: LeaveRequestReviewer | null;
    rejecter: LeaveRequestReviewer | null;
    createdAt: string | null;
    updatedAt: string | null;
}

/** Query filters supported by `GET /v1/leave-requests`. */
export interface LeaveRequestListParams {
    status?: LeaveRequestStatus;
    employeeId?: string;
    leaveTypeId?: string;
    dateFrom?: string;
    dateTo?: string;
    perPage?: number;
}

/** Input for submitting a leave request. File uploads are sent as multipart form data. */
export interface CreateLeaveRequestInput {
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    startSession: LeaveSession;
    endSession: LeaveSession;
    reason: string | null;
    attachments: File[];
}

/** Optional manager context supplied when approving a request. */
export interface ApproveLeaveRequestInput {
    id: string;
    adminNotes: string | null;
}

/** Required manager feedback supplied when rejecting a request. */
export interface RejectLeaveRequestInput {
    id: string;
    rejectionReason: string;
}

/** A balance summary derived from a leave type allowance and request history. */
export interface LeaveBalance {
    allowanceDays: number | null;
    committedDays: number;
    remainingDays: number | null;
    hasSufficientBalance: boolean;
}
