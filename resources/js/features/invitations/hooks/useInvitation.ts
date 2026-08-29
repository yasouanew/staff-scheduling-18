import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';

import { apiClient, type ApiSuccessResponse } from '@/lib/api-client';
import type { EmployeeRole } from '@/types/employee';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Backend shape returned by `GET /invitations`. */
interface InvitationPreviewDto {
    email: string;
    name: string | null;
    role: EmployeeRole;
    company_name: string | null;
    expires_at: string | null;
}

/** Camel-cased preview of the invitation behind an emailed link. */
export interface InvitationPreview {
    email: string;
    /** Invitee's name, when their account already carries one. */
    name: string | null;
    role: EmployeeRole;
    companyName: string | null;
    /** ISO-8601 timestamp, or `null` for invitations that never expire. */
    expiresAt: string | null;
}

/** Credentials carried in the emailed web invitation link. */
export interface InvitationLinkParams {
    token: string;
    email: string;
}

/** Store links for the public "download the app" page. */
export interface MobileAppLinks {
    iosUrl: string | null;
    androidUrl: string | null;
}

interface MobileAppLinksDto {
    ios_url: string | null;
    android_url: string | null;
}

/* -------------------------------------------------------------------------- */
/* Query keys                                                                 */
/* -------------------------------------------------------------------------- */

export const invitationKeys = {
    all: ['invitations'] as const,
    preview: (params: InvitationLinkParams) =>
        [...invitationKeys.all, 'preview', params.token, params.email] as const,
    appLinks: () => [...invitationKeys.all, 'app-links'] as const,
};

/* -------------------------------------------------------------------------- */
/* Mappers                                                                    */
/* -------------------------------------------------------------------------- */

function mapPreview(dto: InvitationPreviewDto): InvitationPreview {
    return {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        companyName: dto.company_name,
        expiresAt: dto.expires_at,
    };
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Previews the invitation behind an emailed link so the page can greet the
 * person by name and show which company invited them.
 *
 * Retries are disabled: a 404/410 here means the link is spent or expired, and
 * re-requesting it would only delay that (final) answer.
 */
export function useInvitationPreview(
    params: InvitationLinkParams,
): UseQueryResult<InvitationPreview, unknown> {
    return useQuery({
        queryKey: invitationKeys.preview(params),
        // Never fire a request we know is missing credentials.
        enabled: params.token.length > 0 && params.email.length > 0,
        retry: false,
        staleTime: 0,
        queryFn: async () => {
            const response = await apiClient.get<ApiSuccessResponse<InvitationPreviewDto>>(
                '/invitations',
                { params },
            );

            return mapPreview(response.data.data);
        },
    });
}

/**
 * Accepts a web invitation by setting the account password.
 *
 * The backend deliberately issues no session, so the caller should send the user
 * to the sign-in screen to exercise their brand-new password.
 */
export function useAcceptInvitation(): UseMutationResult<
    void,
    unknown,
    InvitationLinkParams & { password: string; passwordConfirmation: string }
> {
    return useMutation({
        mutationFn: async ({ token, email, password, passwordConfirmation }) => {
            await apiClient.post('/invitations/accept', {
                token,
                email,
                password,
                password_confirmation: passwordConfirmation,
            });
        },
    });
}

/**
 * Fetches the app store links for the download page.
 *
 * Sourced from the API (backed by config) so the URLs can differ per
 * environment and be filled in once the apps are published, without shipping a
 * new frontend build.
 */
export function useMobileAppLinks(): UseQueryResult<MobileAppLinks, unknown> {
    return useQuery({
        queryKey: invitationKeys.appLinks(),
        // Effectively static config: no need to refetch during a visit.
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
        queryFn: async () => {
            const response =
                await apiClient.get<ApiSuccessResponse<MobileAppLinksDto>>('/mobile-app/links');

            return {
                iosUrl: response.data.data.ios_url,
                androidUrl: response.data.data.android_url,
            };
        },
    });
}
