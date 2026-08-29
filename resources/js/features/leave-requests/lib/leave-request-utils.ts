import { differenceInCalendarDays, format, parseISO } from 'date-fns';

import type { LeaveRequest, LeaveSession } from '@/types/leave-request';

/** Calculates the inclusive requested duration from dates and optional half-day boundaries. */
export function calculateRequestedDays({
    startDate,
    endDate,
    startSession,
    endSession,
}: {
    startDate: string;
    endDate: string;
    startSession: LeaveSession;
    endSession: LeaveSession;
}): number | null {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        return null;
    }

    let days = differenceInCalendarDays(end, start) + 1;

    if (startSession !== 'full_day') {
        days -= 0.5;
    }

    if (endSession !== 'full_day' && differenceInCalendarDays(end, start) > 0) {
        days -= 0.5;
    }

    return Math.max(days, 0.5);
}

/** Formats a date range while retaining date-only values as calendar dates. */
export function formatLeaveDateRange(startDate: string, endDate: string): string {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return `${startDate} – ${endDate}`;
    }

    if (startDate === endDate) {
        return format(start, 'd MMM yyyy');
    }

    return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
}

/** Formats a leave duration with singular/plural grammar and half-day precision. */
export function formatLeaveDuration(days: number): string {
    return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Converts a public-storage attachment path to a browser-served URL. */
export function toAttachmentUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    return `/storage/${path.replace(/^\/+/, '')}`;
}

/** Converts approved leave requests to all-day calendar blocks. */
export function toApprovedLeaveCalendarEvents(requests: readonly LeaveRequest[]): Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    allDay: boolean;
    display: 'background';
    classNames: string[];
}> {
    return requests
        .filter((request) => request.status === 'approved')
        .map((request) => {
            const end = parseISO(request.endDate);
            const exclusiveEnd = Number.isNaN(end.getTime())
                ? request.endDate
                : format(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1), 'yyyy-MM-dd');

            return {
                id: `leave-${request.id}`,
                title: `${request.employee?.name ?? 'Employee'} · ${request.leaveType?.name ?? 'Approved leave'}`,
                start: request.startDate,
                end: exclusiveEnd,
                allDay: true,
                display: 'background' as const,
                classNames: ['leave-calendar-block'],
            };
        });
}
