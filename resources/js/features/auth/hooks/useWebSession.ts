import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient, type ApiSuccessResponse } from '@/lib/api-client';
import type { AuthUser } from './useAuth';

export const WEB_SESSION_KEY = ['auth', 'web-session'] as const;

async function fetchWebSession(): Promise<AuthUser> {
    const response = await apiClient.get<ApiSuccessResponse<AuthUser>>('/auth/me');
    return response.data.data;
}

/**
 * Returns the authoritative authenticated user for browser role and route gating.
 *
 * `company_access.is_locked` is decided entirely by the server clock. To make
 * sure a client cannot keep a stale "unlocked" UI after its device clock is
 * changed, this query always revalidates against the server:
 *  - on window focus and network reconnect (overriding the global app default),
 *  - on a periodic poll while the tab is open.
 * The server never trusts any client timestamp, so each revalidation is a
 * ground-truth answer computed from the server clock.
 */
export function useWebSession(enabled = true): UseQueryResult<AuthUser, Error> {
    return useQuery<AuthUser, Error>({
        queryKey: WEB_SESSION_KEY,
        queryFn: fetchWebSession,
        enabled,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchInterval: 60_000,
        retry: false,
    });
}

export type WebRole = 'super_admin' | 'company_admin' | 'scheduler' | 'employee';

export function normalizeWebRole(user: AuthUser | undefined): WebRole | null {
    const role = user?.role ?? user?.roles?.[0] ?? null;
    return role === 'super_admin' || role === 'company_admin' || role === 'scheduler' || role === 'employee'
        ? role
        : null;
}
