import type { AppNotification, NotificationFilter } from '@/types/notification';

import { NotificationItem } from './NotificationItem';

interface NotificationsListProps {
    notifications: AppNotification[];
    filter: NotificationFilter;
    isLoading?: boolean;
    onSelect: (notification: AppNotification) => void;
    onMarkRead: (id: string) => void;
    onArchive: (id: string) => void;
}

const emptyCopy: Record<NotificationFilter, { title: string; description: string }> = {
    all: {
        title: 'No notifications yet',
        description: 'New shift, leave, and system updates will appear here.',
    },
    unread: {
        title: 'You are all caught up',
        description: 'Every notification has been read.',
    },
    read: {
        title: 'Nothing read yet',
        description: 'Notifications you read will appear here.',
    },
};

/** Reusable paged notification list with explicit loading and empty states. */
export function NotificationsList({
    notifications,
    filter,
    isLoading = false,
    onSelect,
    onMarkRead,
    onArchive,
}: NotificationsListProps): JSX.Element {
    if (isLoading) {
        return (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
                ))}
            </div>
        );
    }

    if (notifications.length === 0) {
        const copy = emptyCopy[filter];
        return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
                <div className="space-y-1.5">
                    <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">{copy.description}</p>
                </div>
            </div>
        );
    }

    return (
        <ul className="flex flex-col gap-3">
            {notifications.map((notification) => (
                <li key={notification.id}>
                    <NotificationItem
                        notification={notification}
                        variant="full"
                        onSelect={onSelect}
                        onMarkRead={onMarkRead}
                        onArchive={onArchive}
                    />
                </li>
            ))}
        </ul>
    );
}
