/** Normalized notification categories rendered by the web inbox. */
export const NOTIFICATION_TYPES = [
    'shift_assigned',
    'leave_requested',
    'leave_approved',
    'leave_rejected',
    'billing_alert',
    'system_alert',
] as const;

/** Category used to choose the notification icon, action route, and emphasis. */
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** A database or broadcast notification normalized for presentation. */
export interface AppNotification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    timestamp: string;
    isRead: boolean;
    actionUrl?: string;
    data: Record<string, unknown>;
}

/** Pagination details used by large notification inboxes. */
export interface NotificationPagination {
    currentPage: number;
    lastPage: number;
    perPage: number;
    total: number;
}

/** API-backed inbox page and unread badge data. */
export interface NotificationsPage {
    notifications: AppNotification[];
    unreadCount: number;
    meta: NotificationPagination;
}

/** Read-status filter applied to the notification inbox. */
export const NOTIFICATION_FILTERS = ['all', 'unread', 'read'] as const;

/** Selectable read/unread filter value. */
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];
