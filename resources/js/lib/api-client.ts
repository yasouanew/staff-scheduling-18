import axios, {
    AxiosError,
    type AxiosInstance,
    type InternalAxiosRequestConfig,
} from 'axios';

import { toast } from 'sonner';

/**
 * Centralised Axios transport layer.
 *
 * Every feature hook talks to the backend through {@link apiClient} rather than
 * importing `axios` directly. This keeps auth, base URL, timeout and global
 * error handling in exactly one place so the rest of the app stays transport
 * agnostic and easy to type.
 */

/** LocalStorage key under which the Sanctum bearer token is persisted. */
export const AUTH_TOKEN_STORAGE_KEY = 'staff_saas.auth_token';

/** Fallback API root used when `VITE_API_BASE_URL` is not provided. */
const DEFAULT_API_BASE_URL = '/api/v1';

/** Hard request timeout (10s) so a stalled network never hangs the UI. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Route the client is sent to after its session is invalidated. */
const LOGIN_ROUTE = '/login';

/* -------------------------------------------------------------------------- */
/* Token storage                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Reads the persisted bearer token, tolerating unavailable storage (SSR/tests).
 *
 * Checks `localStorage` first (a "remembered" session that survives browser
 * restarts) and falls back to `sessionStorage` (a session-only login that ends
 * when the tab closes). This backs the "Keep me signed in" login option.
 */
export function getAuthToken(): string | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return (
            window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ??
            window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
        );
    } catch {
        return null;
    }
}

/**
 * Persists the bearer token for subsequent authenticated requests.
 *
 * @param token    The Sanctum bearer token to store.
 * @param remember When `true` (default) the token is written to `localStorage`
 *                 so the session survives browser restarts; when `false` it is
 *                 written to `sessionStorage` and cleared when the tab closes.
 */
export function setAuthToken(token: string, remember = true): void {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        // Ensure a single source of truth by clearing the other store first.
        if (remember) {
            window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
        } else {
            window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
        }
    } catch {
        /* Storage may be unavailable (private mode / quota) — fail silently. */
    }
}

/** Removes any persisted bearer token from both stores, ending the session. */
export function clearAuthToken(): void {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
        /* Storage may be unavailable — nothing further to do. */
    }
}


/* -------------------------------------------------------------------------- */
/* Response envelope types                                                    */
/* -------------------------------------------------------------------------- */

/** Standard success envelope returned by the backend `ApiResponse` trait. */
export interface ApiSuccessResponse<T> {
    success: true;
    message: string;
    data: T;
}

/** Standard error envelope returned by the backend `ApiResponse` trait. */
export interface ApiErrorResponse {
    success: false;
    message: string;
    errors?: Record<string, string[]>;
}

/** Laravel pagination metadata block. */
export interface PaginationMeta {
    current_page: number;
    from: number | null;
    last_page: number;
    path: string;
    per_page: number;
    to: number | null;
    total: number;
}

/** Laravel pagination navigation links block. */
export interface PaginationLinks {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
}

/** A paginated resource collection as produced by `Resource::collection(...)`. */
export interface PaginatedCollection<T> {
    data: T[];
    links: PaginationLinks;
    meta: PaginationMeta;
}

/* -------------------------------------------------------------------------- */
/* Axios instance                                                             */
/* -------------------------------------------------------------------------- */

const baseURL =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? DEFAULT_API_BASE_URL;

export const apiClient: AxiosInstance = axios.create({
    baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    },
});

/**
 * Request interceptor: attach `Authorization: Bearer <token>` to every outgoing
 * request whenever an authenticated session exists.
 */
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = getAuthToken();

    if (token) {
        // Inside a request interceptor `headers` is always an AxiosHeaders instance.
        config.headers.set('Authorization', `Bearer ${token}`);
    }

    return config;
});


/** Wipes the session and bounces the client to the login screen (once). */
function handleUnauthorized(): void {
    clearAuthToken();

    if (typeof window !== 'undefined' && window.location.pathname !== LOGIN_ROUTE) {
        window.location.assign(LOGIN_ROUTE);
    }
}

/**
 * Response interceptor: globally handle auth/permission failures.
 * - 401 → clear the session and redirect to `/login`.
 * - 403 → surface a permission-denied toast (Sonner).
 * All errors are re-thrown so per-call `onError`/error boundaries still run.
 */
apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiErrorResponse>) => {
        const status = error.response?.status;

        if (status === 401) {
            handleUnauthorized();
        } else if (status === 403) {
            const message =
                error.response?.data?.message ??
                'You do not have permission to perform this action.';
            toast.error(message);
        }

        return Promise.reject(error);
    },
);

/* -------------------------------------------------------------------------- */
/* Error message extraction                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Derive a user-friendly message from any thrown request error.
 *
 * Centralising this keeps transport concerns (Axios shapes, HTTP status codes,
 * rate-limit headers) out of the UI. Feature components can call this in a
 * `catch` block and render the returned string directly.
 *
 * Handles, in priority order:
 *  - `429` rate limiting → a throttle message, using `Retry-After` when present.
 *  - An explicit `message` from the backend `ApiResponse` error envelope.
 *  - The first field-level validation error, if any.
 *  - Timeouts and network failures (no response received).
 *  - A caller-provided `fallback` for anything unrecognised.
 */
export function getApiErrorMessage(
    error: unknown,
    fallback = 'Something went wrong. Please try again.',
): string {
    if (axios.isAxiosError<ApiErrorResponse>(error)) {
        const status = error.response?.status;

        // Rate limited (e.g. login throttle:6,1) — surface a clear wait message.
        if (status === 429) {
            const retryAfterRaw = error.response?.headers?.['retry-after'];
            const seconds = Number(retryAfterRaw);

            if (Number.isFinite(seconds) && seconds > 0) {
                const unit = seconds === 1 ? 'second' : 'seconds';
                return `Too many attempts. Please try again in ${seconds} ${unit}.`;
            }


            return 'Too many attempts. Please wait a moment and try again.';
        }

        const data = error.response?.data;

        if (data?.message) {
            return data.message;
        }

        if (data?.errors) {
            const firstFieldErrors = Object.values(data.errors)[0];
            if (Array.isArray(firstFieldErrors) && firstFieldErrors.length > 0) {
                return firstFieldErrors[0];
            }
        }

        // Request made but no response — timeout or network failure.
        if (error.code === 'ECONNABORTED') {
            return 'The request timed out. Please check your connection and try again.';
        }

        if (!error.response) {
            return 'Unable to reach the server. Please check your connection and try again.';
        }
    }

    return fallback;
}

/**
 * Whether a thrown error represents an optimistic-lock conflict (HTTP 409).
 *
 * The roster change endpoints reject a stale `version` with 409, which signals
 * the manager's copy of the roster is out of date. Components can use this to
 * surface a "reload to see the latest version" affordance instead of retrying
 * a doomed write.
 */
export function isStaleVersionError(error: unknown): boolean {
    return (
        axios.isAxiosError<ApiErrorResponse>(error) && error.response?.status === 409
    );
}

export default apiClient;


