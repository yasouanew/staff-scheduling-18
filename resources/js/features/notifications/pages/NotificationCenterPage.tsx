import * as Tabs from '@radix-ui/react-tabs';
import { BellRing, CheckCheck, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import type { AppNotification, NotificationFilter } from '@/types/notification';

import { NotificationsList } from '../components/NotificationsList';
import { useNotifications } from '../hooks/useNotifications';

const FILTER_TABS: ReadonlyArray<{ value: NotificationFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    { value: 'read', label: 'Read' },
];

const tabTriggerClasses = cn(
    'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors',
    'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
);

/** Full paginated API-backed notification inbox at `/notifications`. */
export default function NotificationCenterPage(): JSX.Element {
    const navigate = useNavigate();
    const [filter, setFilter] = useState<NotificationFilter>('all');
    const [page, setPage] = useState(1);
    const {
        notifications,
        unreadCount,
        meta,
        isLoading,
        isError,
        refetch,
        markAsRead,
        markAllAsRead,
        archive,
    } = useNotifications({ filter, page, perPage: 20 });

    const handleFilterChange = (value: string): void => {
        setFilter(value as NotificationFilter);
        setPage(1);
    };

    const handleSelect = async (notification: AppNotification): Promise<void> => {
        try {
            if (!notification.isRead) {
                await markAsRead(notification.id);
            }
            if (notification.actionUrl) {
                navigate(notification.actionUrl);
            }
        } catch (error) {
            toast.error('Unable to open notification', {
                description: 'The read state could not be updated. Please try again.',
            });
        }
    };

    const handleMarkRead = (id: string): void => {
        void markAsRead(id).catch(() => {
            toast.error('Unable to mark notification as read');
        });
    };

    const handleArchive = (id: string): void => {
        void archive(id)
            .then(() => toast.success('Notification deleted'))
            .catch(() => toast.error('Unable to delete notification'));
    };

    const handleMarkAllRead = (): void => {
        if (unreadCount === 0) {
            return;
        }

        void markAllAsRead()
            .then(() => toast.success('All notifications marked as read'))
            .catch(() => toast.error('Unable to mark all notifications as read'));
    };

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                        <BellRing className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Notifications</h1>
                        <p className="text-sm text-muted-foreground">
                            {unreadCount > 0
                                ? `You have ${unreadCount} unread ${unreadCount === 1 ? 'alert' : 'alerts'}.`
                                : 'You have no unread alerts.'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        disabled={isLoading}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={handleMarkAllRead}
                        disabled={unreadCount === 0}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <CheckCheck className="h-4 w-4" aria-hidden="true" />
                        Mark all as read
                    </button>
                </div>
            </div>

            <Tabs.Root value={filter} onValueChange={handleFilterChange} className="space-y-6">
                <Tabs.List
                    aria-label="Filter notifications by read status"
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1"
                >
                    {FILTER_TABS.map((tab) => (
                        <Tabs.Trigger key={tab.value} value={tab.value} className={tabTriggerClasses}>
                            {tab.label}
                            {tab.value === 'unread' && unreadCount > 0 ? (
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-none text-danger-foreground">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            ) : null}
                        </Tabs.Trigger>
                    ))}
                </Tabs.List>

                {isError ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                        <BellRing className="h-8 w-8 text-danger" aria-hidden="true" />
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">Unable to load notifications</p>
                            <p className="text-sm text-muted-foreground">
                                Check your connection and try refreshing the notification centre.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void refetch()}
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Try again
                        </button>
                    </div>
                ) : (
                    <>
                        <NotificationsList
                            notifications={notifications}
                            filter={filter}
                            isLoading={isLoading}
                            onSelect={(notification) => void handleSelect(notification)}
                            onMarkRead={handleMarkRead}
                            onArchive={handleArchive}
                        />

                        {meta.total > 0 ? (
                            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-muted-foreground">
                                    Page {meta.currentPage} of {meta.lastPage} · {meta.total} notification{meta.total === 1 ? '' : 's'}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                                        disabled={meta.currentPage <= 1 || isLoading}
                                        className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-input bg-card px-3 font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                        Previous
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPage((current) => Math.min(meta.lastPage, current + 1))}
                                        disabled={meta.currentPage >= meta.lastPage || isLoading}
                                        className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-input bg-card px-3 font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </>
                )}
            </Tabs.Root>
        </div>
    );
}
