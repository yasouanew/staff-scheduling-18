import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ApiSuccessResponse } from '@/lib/api-client';
import { WEB_SESSION_KEY, useWebSession } from '@/features/auth/hooks/useWebSession';
import type { AuthUser } from '@/features/auth/hooks/useAuth';

export type ProductGuideTip = 'dashboard' | 'rosters' | 'shifts' | 'leave_requests' | 'employees' | 'settings';

export function useProductGuide() {
    const session = useWebSession();
    const queryClient = useQueryClient();
    const updateSession = (user: AuthUser): void => {
        queryClient.setQueryData(WEB_SESSION_KEY, user);
    };
    const welcome = useMutation({
        mutationFn: async () => (await apiClient.post<ApiSuccessResponse<AuthUser>>('/auth/web-welcome/complete')).data.data,
        onSuccess: updateSession,
    });
    const dismissTip = useMutation({
        mutationFn: async (tip: ProductGuideTip) => (await apiClient.post<ApiSuccessResponse<AuthUser>>('/auth/web-feature-tips/dismiss', { tip })).data.data,
        onSuccess: updateSession,
    });
    const tips = session.data?.web_feature_tips ?? {};
    return {
        user: session.data,
        shouldShowWelcome: Boolean(session.data && !session.data.web_welcome_completed_at),
        isTipDismissed: (tip: ProductGuideTip): boolean => Boolean(tips[tip]),
        completeWelcome: welcome.mutateAsync,
        dismissTip: dismissTip.mutateAsync,
        isSaving: welcome.isPending || dismissTip.isPending,
    };
}
