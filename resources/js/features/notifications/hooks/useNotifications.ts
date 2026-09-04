import { echo, echoIsConfigured } from '@laravel/echo-react';
import { useEffect, useMemo } from 'react';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryResult,
} from '@tanstack/react-query';

import { apiClient, type ApiSuccessResponse } from '@/lib/api-client';
import type {
    AppNotification,
    NotificationFilter,
    NotificationPagination,
    NotificationsPage,
} from '@/types/notification';

/** Number of recent notifications surfaced in the header dropdown. */
export const MAX_RECENT_NOTIFICATIONS = 5;

/** Query keys shared by the notification inbox, header badge, and live events. */
export const NOTIFICATION_KEYS = {
    all: ['notifications'] as const,
    list: (filter: NotificationFilter, page: number, perPage: number) =>
        ['notifications', 'list', filter, page, perPage] as const,
    currentUser: ['notifications', 'current-user'] as const,
} as const;

interface NotificationDto {
    id: string;
    type: string;
    title: string | null;
    body: string | null;
    data: Record<string, unknown> | null;
    read_at: string | null;
    created_at: string | null;
}

interface NotificationsApiPayload {
    notifications: NotificationDto[] | { data?: NotificationDto[] };
    unread_count: number;
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

interface NotificationCurrentUser {
    id: number;
}

interface BroadcastNotificationDto {
    id: string;
    type: string;
    data?: Record<string, unknown>;
    read_at?: string | null;
    created_at?: string | null;
    title?: string | null;
    body?: string | null;
}

function normalizeType(raw: string | undefined): AppNotification['type'] {
    switch (raw) {
        case 'shift.assigned':
        case 'shift_assigned':
            return 'shift_assigned';
        case 'leave_request.submitted':
        case 'leave_requested':
            return 'leave_requested';
        case 'leave_request.approved':
        case 'leave_approved':
            return 'leave_approved';
        case 'leave_request.rejected':
        case 'leave_rejected':
            return 'leave_rejected';
        case 'billing.trial_ending':
        case 'billing.trial_expired':
        case 'billing.subscription_renewal_reminder':
        case 'billing.subscription_activated':
            return 'billing_alert';
        default:
            return 'system_alert';
    }
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function toActionUrl(type: AppNotification['type'], data: Record<string, unknown>): string | undefined {
    const leaveRequestId = data.leave_request_id;
    const shiftId = data.shift_id;

    if (
        (type === 'leave_requested' || type === 'leave_approved' || type === 'leave_rejected') &&
        (typeof leaveRequestId === 'string' || typeof leaveRequestId === 'number')
    ) {
        return `/leave-requests/${leaveRequestId}`;
    }

    if (type === 'shift_assigned') {
        return typeof shiftId === 'string' || typeof shiftId === 'number' ? '/shifts' : '/rosters';
    }

    // Backend billing notifications (billing.trial_ending, billing.trial_expired,
    // billing.subscription_renewal_reminder, billing.subscription_activated) are
    // only ever sent to company_admin users, whose subscription self-service
    // dashboard lives at /subscription. The backend payload's `action_url`
    // targets `/companies/{id}/subscriptions`, which is not a route in this SPA.
    if (type === 'billing_alert') {
        return '/subscription';
    }

    return undefined;
}

/** Maps database resource or Echo broadcast data to the stable presentation model. */
function mapNotification(dto: NotificationDto | BroadcastNotificationDto): AppNotification {
    const data = dto.data ?? {};
    const payloadType = asString(data.type) ?? dto.type;
    const type = normalizeType(payloadType);

    return {
        id: dto.id,
        type,
        title: asString(data.title) ?? dto.title ?? 'Notification',
        message: asString(data.body) ?? dto.body ?? 'You have a new notification.',
        timestamp: dto.created_at ?? new Date().toISOString(),
        isRead: Boolean(dto.read_at),
        actionUrl: toActionUrl(type, data),
        data,
    };
}

function mapMeta(meta: NotificationsApiPayload['meta']): NotificationPagination {
    return {
        currentPage: meta.current_page,
        lastPage: meta.last_page,
        perPage: meta.per_page,
        total: meta.total,
    };
}

async function fetchNotifications({
    filter,
    page,
    perPage,
}: {
    filter: NotificationFilter;
    page: number;
    perPage: number;
}): Promise<NotificationsPage> {
    const response = await apiClient.get<ApiSuccessResponse<NotificationsApiPayload>>('/notifications', {
        params: { filter, page, per_page: perPage },
    });
    const payload = response.data.data;
    const notifications = Array.isArray(payload.notifications)
        ? payload.notifications
        : (payload.notifications.data ?? []);

    return {
        notifications: notifications.map(mapNotification),
        unreadCount: payload.unread_count,
        meta: mapMeta(payload.meta),
    };
}

async function fetchCurrentNotificationUser(): Promise<NotificationCurrentUser> {
    const response = await apiClient.get<ApiSuccessResponse<NotificationCurrentUser>>('/auth/me');
    return response.data.data;
}

async function markNotificationAsRead(id: string): Promise<AppNotification> {
    const response = await apiClient.post<ApiSuccessResponse<NotificationDto>>(`/notifications/${id}/read`);
    return mapNotification(response.data.data);
}

async function markAllNotificationsAsRead(): Promise<void> {
    await apiClient.post<ApiSuccessResponse<null>>('/notifications/read-all');
}

async function deleteNotification(id: string): Promise<void> {
    await apiClient.delete<ApiSuccessResponse<null>>(`/notifications/${id}`);
}

/** Props accepted by the API-backed notification hook. */
export interface UseNotificationsParams {
    filter?: NotificationFilter;
    page?: number;
    perPage?: number;
    /** Set by the persistent header bell, which owns the shared Echo listener. */
    realtime?: boolean;
}

/** Full notification inbox state and actions for the page and header dropdown. */
export interface UseNotificationsResult {
    notifications: AppNotification[];
    recent: AppNotification[];
    unreadCount: number;
    meta: NotificationPagination;
    isLoading: boolean;
    isError: boolean;
    refetch: () => Promise<unknown>;
    markAsRead: (id: string) => Promise<AppNotification>;
    markAllAsRead: () => Promise<void>;
    archive: (id: string) => Promise<void>;
}

/**
 * Reads the paginated notification API, maintains unread state, and subscribes
 * to Laravel's private user notification channel when Echo is configured.
 */
export function useNotifications({
    filter = 'all',
    page = 1,
    perPage = 20,
    realtime = false,
}: UseNotificationsParams = {}): UseNotificationsResult {
    const queryClient = useQueryClient();
    const notificationsQuery = useQuery<NotificationsPage, Error>({
        queryKey: NOTIFICATION_KEYS.list(filter, page, perPage),
        queryFn: () => fetchNotifications({ filter, page, perPage }),
        staleTime: 15_000,
    });
    const currentUserQuery = useQuery<NotificationCurrentUser, Error>({
        queryKey: NOTIFICATION_KEYS.currentUser,
        queryFn: fetchCurrentNotificationUser,
        staleTime: 300_000,
    });

    useEffect(() => {
        const userId = currentUserQuery.data?.id;
        if (!realtime || !userId || !echoIsConfigured()) {
            return;
        }

        const channelName = `App.Models.User.${userId}`;
        const channel = echo().private(channelName);
        channel.notification((_payload: BroadcastNotificationDto) => {
            void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
        });

        return () => {
            echo().leave(channelName);
        };
    }, [currentUserQuery.data?.id, queryClient, realtime]);

    const markAsReadMutation: UseMutationResult<AppNotification, Error, string> = useMutation({
        mutationFn: markNotificationAsRead,
        onSuccess: (notification) => {
            queryClient.setQueriesData<NotificationsPage>({ queryKey: NOTIFICATION_KEYS.all }, (previous) => {
                if (!previous) {
                    return previous;
                }

                const wasUnread = previous.notifications.find((item) => item.id === notification.id)?.isRead === false;
                return {
                    ...previous,
                    notifications: previous.notifications.map((item) =>
                        item.id === notification.id ? notification : item,
                    ),
                    unreadCount: wasUnread ? Math.max(0, previous.unreadCount - 1) : previous.unreadCount,
                };
            });
        },
    });
    const markAllReadMutation: UseMutationResult<void, Error, void> = useMutation({
        mutationFn: markAllNotificationsAsRead,
        onSuccess: () => {
            queryClient.setQueriesData<NotificationsPage>({ queryKey: NOTIFICATION_KEYS.all }, (previous) =>
                previous
                    ? {
                        ...previous,
                        notifications: previous.notifications.map((notification) => ({
                            ...notification,
                            isRead: true,
                        })),
                        unreadCount: 0,
                    }
                    : previous,
            );
        },
    });
    const archiveMutation: UseMutationResult<void, Error, string> = useMutation({
        mutationFn: deleteNotification,
        onSuccess: (_result, id) => {
            queryClient.setQueriesData<NotificationsPage>({ queryKey: NOTIFICATION_KEYS.all }, (previous) => {
                if (!previous) {
                    return previous;
                }

                const removed = previous.notifications.find((notification) => notification.id === id);
                return {
                    ...previous,
                    notifications: previous.notifications.filter((notification) => notification.id !== id),
                    unreadCount:
                        removed && !removed.isRead
                            ? Math.max(0, previous.unreadCount - 1)
                            : previous.unreadCount,
                    meta: {
                        ...previous.meta,
                        total: Math.max(0, previous.meta.total - 1),
                    },
                };
            });
        },
    });

    const pageData = notificationsQuery.data;
    const notifications = useMemo(() => pageData?.notifications ?? [], [pageData?.notifications]);
    const recent = useMemo(() => notifications.slice(0, MAX_RECENT_NOTIFICATIONS), [notifications]);
    const meta = pageData?.meta ?? { currentPage: page, lastPage: 1, perPage, total: 0 };

    return {
        notifications,
        recent,
        unreadCount: pageData?.unreadCount ?? 0,
        meta,
        isLoading: notificationsQuery.isLoading || currentUserQuery.isLoading,
        isError: notificationsQuery.isError || currentUserQuery.isError,
        refetch: async () => {
            await Promise.all([notificationsQuery.refetch(), currentUserQuery.refetch()]);
        },
        markAsRead: (id) => markAsReadMutation.mutateAsync(id),
        markAllAsRead: () => markAllReadMutation.mutateAsync(),
        archive: (id) => archiveMutation.mutateAsync(id),
    };
}
