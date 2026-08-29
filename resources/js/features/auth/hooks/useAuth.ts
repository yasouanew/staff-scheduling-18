import { useCallback, useSyncExternalStore } from 'react';

import {
    apiClient,
    clearAuthToken,
    getAuthToken,
    setAuthToken,
    type ApiSuccessResponse,
} from '@/lib/api-client';

/**
 * Client-side authentication session.
 *
 * Owns the lifecycle of the Sanctum bearer token: storing it after login,
 * refreshing the authenticated user, and clearing it on logout. The token is
 * held in a tiny external store so any component calling {@link useAuth}
 * re-renders the instant the session changes (including across browser tabs).
 *
 * The Axios transport (`@/lib/api-client`) reads the same persisted token to
 * attach the `Authorization` header, so this hook and every API call stay in
 * lockstep automatically.
 */

export interface CompanyAccessStatus {
    is_locked: boolean;
    locked_at: string | null;
    trial_ends_at: string | null;
    trial_is_active: boolean;
    active_subscription_id: number | null;
    active_subscription_ends_at: string | null;
}

/** Authenticated user shape mirroring the backend `UserResource`. */
export interface AuthUser {
    id: number;
    company_id: number | null;
    company_access?: CompanyAccessStatus;
    branch_id: number | null;
    employee_id?: number | null;
    name: string;
    email: string;
    phone: string | null;
    role: string | null;
    status: string | null;
    roles?: string[];
    permissions?: string[];
    last_login_at: string | null;
    web_welcome_completed_at?: string | null;
    web_feature_tips?: Record<string, string>;
    email_verified_at: string | null;
}

/** Credentials accepted by {@link UseAuthResult.login}. */
export interface LoginCredentials {
    email: string;
    password: string;
    /** Human-readable device label sent to the API (defaults to `web`). */
    deviceName?: string;
    /**
     * When `true` (default) the issued token is persisted to `localStorage` so
     * the session survives browser restarts ("Keep me signed in"). When
     * `false` it lives in `sessionStorage` and ends when the tab closes.
     */
    remember?: boolean;
}


/** Fields accepted by {@link UseAuthResult.register} (company sign-up). */
export interface RegisterCredentials {
    name: string;
    companyName: string;
    email: string;
    phone?: string;
    abn?: string;
    businessType?: string;
    country?: string;
    state?: string;
    timezone?: string;
    password: string;
    passwordConfirmation: string;
    /** Human-readable device label sent to the API (defaults to `web`). */
    deviceName?: string;
    /** Persist the issued token to `localStorage` (default) vs `sessionStorage`. */
    remember?: boolean;
}

/** Payload returned by `POST /auth/login` and `POST /auth/register`. */
interface AuthResponseData {
    user: AuthUser;
    token: string;
    token_type: string;
}

/** Public surface returned by {@link useAuth}. */
export interface UseAuthResult {
    /** The current bearer token, or `null` when signed out. */
    token: string | null;
    /** Convenience flag derived from {@link UseAuthResult.token}. */
    isAuthenticated: boolean;
    /** Authenticate against the API and persist the issued token. */
    login: (credentials: LoginCredentials) => Promise<AuthUser>;
    /** Register a new company + admin, persisting the issued token. */
    register: (credentials: RegisterCredentials) => Promise<AuthUser>;
    /** Revoke the current token server-side (best effort) and clear locally. */
    logout: () => Promise<void>;
    /** Re-fetch the authenticated user (`GET /auth/me`). */
    refresh: () => Promise<AuthUser>;
    /** Re-send the email verification link to the current user. */
    resendVerification: () => Promise<void>;
    /** Confirm the current user's password before a sensitive action. */
    confirmPassword: (password: string) => Promise<void>;
    /** Imperatively persist a token (e.g. after an external auth flow). */
    setToken: (token: string) => void;
    /** Imperatively clear the session token. */
    clearToken: () => void;
}

/* -------------------------------------------------------------------------- */
/* Reactive token store                                                       */
/* -------------------------------------------------------------------------- */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Mirror of the persisted token kept in memory for synchronous snapshots. */
let currentToken: string | null = getAuthToken();

/** Notify every subscribed component that the session changed. */
function emit(): void {
    for (const listener of listeners) {
        listener();
    }
}

/** Persist (or clear) the token and broadcast the change to subscribers. */
function commitToken(token: string | null, remember = true): void {
    currentToken = token;

    if (token) {
        setAuthToken(token, remember);
    } else {
        clearAuthToken();
    }

    emit();
}


/** Subscribe to session changes, including cross-tab `storage` events. */
function subscribe(listener: Listener): () => void {
    listeners.add(listener);

    const handleStorage = (event: StorageEvent): void => {
        if (event.key === null || event.key === 'staff_saas.auth_token') {
            currentToken = getAuthToken();
            emit();
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('storage', handleStorage);
    }

    return () => {
        listeners.delete(listener);
        if (typeof window !== 'undefined') {
            window.removeEventListener('storage', handleStorage);
        }
    };
}

/** Synchronous snapshot for the client. */
function getSnapshot(): string | null {
    return currentToken;
}

/** Server snapshot — there is never a token during SSR. */
function getServerSnapshot(): string | null {
    return null;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useAuth(): UseAuthResult {
    const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const login = useCallback(async (credentials: LoginCredentials): Promise<AuthUser> => {
        const response = await apiClient.post<ApiSuccessResponse<AuthResponseData>>(
            '/auth/login',
            {
                email: credentials.email,
                password: credentials.password,
                device_name: credentials.deviceName ?? 'web',
            },
        );

        const { token: issuedToken, user } = response.data.data;
        commitToken(issuedToken, credentials.remember ?? true);

        return user;
    }, []);

    const register = useCallback(async (credentials: RegisterCredentials): Promise<AuthUser> => {
        const response = await apiClient.post<ApiSuccessResponse<AuthResponseData>>(
            '/auth/register',
            {
                name: credentials.name,
                company_name: credentials.companyName,
                email: credentials.email,
                phone: credentials.phone,
                abn: credentials.abn,
                business_type: credentials.businessType,
                country: credentials.country,
                state: credentials.state,
                timezone: credentials.timezone,
                password: credentials.password,
                password_confirmation: credentials.passwordConfirmation,
                device_name: credentials.deviceName ?? 'web',
            },
        );

        const { token: issuedToken, user } = response.data.data;
        commitToken(issuedToken, credentials.remember ?? true);

        return user;
    }, []);


    const logout = useCallback(async (): Promise<void> => {
        try {
            await apiClient.post('/auth/logout');
        } finally {
            // Always clear locally, even if the network call fails.
            commitToken(null);
        }
    }, []);

    const refresh = useCallback(async (): Promise<AuthUser> => {
        const response = await apiClient.get<ApiSuccessResponse<AuthUser>>('/auth/me');

        return response.data.data;
    }, []);

    const resendVerification = useCallback(async (): Promise<void> => {
        await apiClient.post('/auth/email/resend');
    }, []);

    const confirmPassword = useCallback(async (password: string): Promise<void> => {
        await apiClient.post('/auth/confirm-password', { password });
    }, []);

    const setToken = useCallback((next: string): void => {
        commitToken(next);
    }, []);

    const clearToken = useCallback((): void => {
        commitToken(null);
    }, []);

    return {
        token,
        isAuthenticated: token !== null,
        login,
        register,
        logout,
        refresh,
        resendVerification,
        confirmPassword,
        setToken,
        clearToken,
    };
}


