import * as ScrollArea from '@radix-ui/react-scroll-area';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Popover, PopoverContent, PopoverTrigger } from '@/Components/ui';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/types/notification';
import { MAX_RECENT_NOTIFICATIONS, useNotifications } from '../hooks/useNotifications';
import { NotificationItem } from './NotificationItem';

interface NotificationBellProps {
    className?: string;
}

/** Live notification menu that preserves the existing query, realtime, and action contracts. */
export function NotificationBell({ className }: NotificationBellProps): JSX.Element {
    const navigate = useNavigate();
    const { recent, unreadCount, markAsRead, markAllAsRead } = useNotifications({
        perPage: MAX_RECENT_NOTIFICATIONS,
        realtime: true,
    });
    const [open, setOpen] = useState(false);
    const hasUnread = unreadCount > 0;

    const handleSelect = (notification: AppNotification): void => {
        if (!notification.isRead) {
            void markAsRead(notification.id);
        }

        setOpen(false);

        if (notification.actionUrl) {
            navigate(notification.actionUrl);
        }
    };

    return <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('relative', className)} aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
                <Bell className="h-5 w-5" aria-hidden="true" />
                {hasUnread ? <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
                </span> : null}
            </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
                    {hasUnread ? <Badge variant="danger" className="h-5 min-w-5 justify-center px-1.5 text-[11px]">{unreadCount > 99 ? '99+' : unreadCount}</Badge> : null}
                </div>
                {hasUnread ? <Button variant="ghost" size="sm" onClick={() => void markAllAsRead()} className="h-8 gap-1 px-2 text-xs text-primary hover:text-primary">
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Mark all read
                </Button> : null}
            </div>
            {recent.length === 0 ? <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><BellOff className="h-6 w-6" aria-hidden="true" /></span>
                <div className="space-y-1"><p className="text-sm font-semibold text-foreground">You&apos;re all caught up</p><p className="text-xs leading-5 text-muted-foreground">New alerts will appear here as they arrive.</p></div>
            </div> : <ScrollArea.Root className="max-h-80 overflow-hidden" type="hover">
                <ScrollArea.Viewport className="max-h-80 w-full">
                    <ul className="flex flex-col gap-0.5 p-2">
                        {recent.map((notification) => <li key={notification.id}>
                            <NotificationItem notification={notification} variant="compact" onSelect={handleSelect} />
                        </li>)}
                    </ul>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar orientation="vertical" className="flex w-2 touch-none select-none p-0.5 transition-colors"><ScrollArea.Thumb className="flex-1 rounded-full bg-border" /></ScrollArea.Scrollbar>
            </ScrollArea.Root>}
            <div className="border-t border-border p-2">
                <Button variant="ghost" className="w-full justify-center text-primary hover:text-primary" onClick={() => { setOpen(false); navigate('/notifications'); }}>
                    View all notifications
                </Button>
            </div>
        </PopoverContent>
    </Popover>;
}
