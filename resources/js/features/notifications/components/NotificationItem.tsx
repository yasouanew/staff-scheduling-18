import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Archive, CalendarCheck, CheckCheck, Clock, CreditCard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';


import { cn } from '@/lib/utils';
import type { AppNotification, NotificationType } from '@/types/notification';

/** Visual treatment (icon + semantic soft-background) for each alert category. */
interface NotificationVisual {
    icon: LucideIcon;
    /** Semantic soft-tint wrapper classes for the leading badge. */
    badgeClasses: string;
    /** Accessible label describing the alert category. */
    label: string;
}

/**
 * Maps every {@link NotificationType} to a contextual symbol using only semantic
 * color tokens — e.g. a green calendar for assigned/approved shifts and a blue
 * clock for pending leave requests.
 */
export const NOTIFICATION_VISUALS: Record<NotificationType, NotificationVisual> = {
    shift_assigned: {
        icon: CalendarCheck,
        badgeClasses: 'bg-success/10 text-success',
        label: 'Shift assigned',
    },
    leave_requested: {
        icon: Clock,
        badgeClasses: 'bg-info/10 text-info',
        label: 'Leave requested',
    },
    leave_approved: {
        icon: CalendarCheck,
        badgeClasses: 'bg-success/10 text-success',
        label: 'Leave approved',
    },
    leave_rejected: {
        icon: AlertTriangle,
        badgeClasses: 'bg-danger/10 text-danger',
        label: 'Leave rejected',
    },
    billing_alert: {
        icon: CreditCard,
        badgeClasses: 'bg-info/10 text-info',
        label: 'Billing',
    },
    system_alert: {
        icon: AlertTriangle,
        badgeClasses: 'bg-warning/10 text-warning',
        label: 'System alert',
    },
};

interface NotificationItemProps {
    /** The alert to render. */
    notification: AppNotification;
    /**
     * `compact` renders a tightly-spaced row for the header popover; `full`
     * renders a roomier row with inline actions for the inbox page.
     */
    variant?: 'compact' | 'full';
    /** Fired when the row (compact) or title (full) is activated. */
    onSelect?: (notification: AppNotification) => void;
    /** Marks a single alert as read (full variant only). */
    onMarkRead?: (id: string) => void;
    /** Archives (dismisses) a single alert (full variant only). */
    onArchive?: (id: string) => void;
}

/** Humanises an ISO timestamp into a relative label such as "5 minutes ago". */
function relativeTime(iso: string): string {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

/**
 * Purely presentational notification row. Holds no data-fetching or mutation
 * logic — all state changes are delegated to the parent via callbacks so the
 * component stays reusable across the popover and the inbox page.
 */
export function NotificationItem({
    notification,
    variant = 'full',
    onSelect,
    onMarkRead,
    onArchive,
}: NotificationItemProps): JSX.Element {
    const visual = NOTIFICATION_VISUALS[notification.type];
    const Icon = visual.icon;
    const isCompact = variant === 'compact';

    const badge = (
        <span
            className={cn(
                'flex shrink-0 items-center justify-center rounded-lg',
                isCompact ? 'h-9 w-9' : 'h-10 w-10',
                visual.badgeClasses,
            )}
            aria-hidden="true"
        >
            <Icon className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} />
        </span>
    );

    const body = (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
                <span
                    className={cn(
                        'truncate text-sm',
                        notification.isRead ? 'font-medium text-foreground' : 'font-semibold text-foreground',
                    )}
                >
                    {notification.title}
                </span>
                {!notification.isRead && (
                    <span
                        className="h-2 w-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                    />
                )}
            </span>
            <span
                className={cn(
                    'text-sm text-muted-foreground',
                    isCompact ? 'line-clamp-1' : 'line-clamp-2',
                )}
            >
                {notification.message}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground/80">
                {relativeTime(notification.timestamp)}
            </span>
        </span>
    );

    // Compact rows (popover) act as a single button that selects the alert.
    if (isCompact) {
        return (
            <button
                type="button"
                onClick={() => onSelect?.(notification)}
                className={cn(
                    'flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors',
                    'hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    !notification.isRead && 'bg-accent/40',
                )}
            >
                {badge}
                {body}
            </button>
        );
    }

    // Full rows (inbox page) expose inline mark-read / archive actions.
    return (
        <div
            className={cn(
                'flex items-start gap-4 rounded-xl border border-border p-4 transition-colors',
                notification.isRead ? 'bg-card' : 'bg-accent/30',
            )}
        >
            {badge}

            {onSelect && notification.actionUrl ? (
                <button
                    type="button"
                    onClick={() => onSelect(notification)}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                >
                    {body}
                </button>
            ) : (
                body
            )}

            <div className="flex shrink-0 items-center gap-1">
                {!notification.isRead && onMarkRead && (
                    <button
                        type="button"
                        onClick={() => onMarkRead(notification.id)}
                        className={cn(
                            'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors',
                            'hover:bg-success/10 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                        aria-label="Mark as read"
                        title="Mark as read"
                    >
                        <CheckCheck className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
                {onArchive && (
                    <button
                        type="button"
                        onClick={() => onArchive(notification.id)}
                        className={cn(
                            'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors',
                            'hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                        aria-label="Archive notification"
                        title="Archive"
                    >
                        <Archive className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
            </div>
        </div>
    );
}


