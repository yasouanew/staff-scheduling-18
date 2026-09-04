import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import axios from 'axios';

import { apiClient, type ApiErrorResponse, type ApiSuccessResponse } from '@/lib/api-client';
import type { AuthUser } from '@/features/auth/hooks/useAuth';
import { WEB_SESSION_KEY } from '@/features/auth/hooks/useWebSession';

/** Fields accepted by `PUT /auth/profile` (mirrors `UpdateProfileRequest`). */
export interface ProfileUpdateInput {
    name: string;
    email: string;
}

/** Fields accepted by `PUT /auth/password` (mirrors `UpdatePasswordRequest`). */
export interface PasswordUpdateInput {
    password: string;
    passwordConfirmation: string;
}

async function updateProfile(input: ProfileUpdateInput): Promise<AuthUser> {
    const response = await apiClient.put<ApiSuccessResponse<AuthUser>>('/auth/profile', {
        name: input.name,
        email: input.email,
    });

    return response.data.data;
}

async function updatePassword(input: PasswordUpdateInput): Promise<void> {
    await apiClient.put('/auth/password', {
        password: input.password,
        password_confirmation: input.passwordConfirmation,
    });
}

/**
 * Extract the first server-side validation message for a given field.
 *
 * Laravel validation failures (and the profile/password endpoints' explicit
 * 422 responses) carry `{ errors: { field: [message] } }`; this helper lets a
 * form surface them inline next to the offending input.
 */
export function getProfileFieldError(error: unknown, field: string): string | undefined {
    if (!axios.isAxiosError<ApiErrorResponse>(error)) {
        return undefined;
    }

    const fieldErrors = error.response?.data?.errors?.[field];
    return fieldErrors?.[0];
}

/**
 * Update the authenticated user's profile (name/email).
 *
 * On success the persisted web session is refreshed so the header, sidebar and
 * any role gating immediately reflect the new identity. Error feedback (e.g. a
 * duplicate email) is handled by the calling form.
 */
export function useUpdateProfile(): UseMutationResult<AuthUser, Error, ProfileUpdateInput> {
    const queryClient = useQueryClient();

    return useMutation<AuthUser, Error, ProfileUpdateInput>({
        mutationFn: updateProfile,
        onSuccess: (user) => {
            // Refresh the cached web session with the freshly returned user and
            // invalidate any observers so the header/name everywhere updates.
            queryClient.setQueryData<AuthUser>(WEB_SESSION_KEY, user);
            void queryClient.invalidateQueries({ queryKey: WEB_SESSION_KEY });
        },
    });
}

/**
 * Update the authenticated user's password.
 *
 * The new password is validated server-side against the shared password policy;
 * any validation errors surface as field-level `password` errors on the form.
 */
export function useUpdatePassword(): UseMutationResult<void, Error, PasswordUpdateInput> {
    return useMutation<void, Error, PasswordUpdateInput>({
        mutationFn: updatePassword,
    });
}
