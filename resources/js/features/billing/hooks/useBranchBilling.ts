import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { apiClient, type ApiSuccessResponse } from '@/lib/api-client';

import type { SubscriptionUsage } from '../types';
import { SUBSCRIPTION_KEYS } from './useSubscription';

/**
 * Mutations that act on a *single branch's* subscription lifecycle and capacity.
 *
 * These hit the branch-scoped endpoints (`branches/{branch}/activate`,
 * `branches/{branch}/deactivate`, `branches/{branch}/capacity`) which belong to
 * `BranchSubscriptionController`. Each mutation returns fresh company usage in
 * its payload, so on success we write that into the summary/usage caches rather
 * than refetching.
 */

interface BranchSubscriptionDto {
    id: number;
    status: string;
    employee_capacity?: number | null;
    started_at?: string | null;
    ended_at?: string | null;
}

interface BranchMutationDto {
    branch: unknown;
    branch_subscription: BranchSubscriptionDto;
    usage: {
        branches: { used: number; limit: number | null };
        branch_usage: Array<{
            branch_id?: number;
            id?: number;
            name: string;
            active: boolean;
            employees_used: number;
            capacity?: number | null;
            employee_capacity?: number | null;
            remaining: number | null;
        }>;
    };
}

const number = (value: number | string | null | undefined): number => Number(value ?? 0);

/** Map the `usage` block returned by the branch mutation endpoints. */
function mapUsage(dto: BranchMutationDto['usage']): SubscriptionUsage {
    return {
        branches: {
            used: number(dto.branches.used),
            limit: dto.branches.limit,
        },
        branchUsage: dto.branch_usage.map((item) => {
            const id = item.id ?? item.branch_id;
            const capacity = item.employee_capacity ?? item.capacity ?? null;
            return {
                id: id === undefined || id === null ? '' : String(id),
                name: item.name,
                active: item.active,
                employeesUsed: number(item.employees_used),
                employeeCapacity: capacity === null ? null : number(capacity),
                remaining: item.remaining === null ? null : number(item.remaining),
            };
        }),
    };
}

export interface BranchBillingResult {
    usage: SubscriptionUsage;
    employeeCapacity: number | null;
}

/** Shared success handler that seeds the summary/usage caches from a mutation. */
function refreshUsage(queryClient: ReturnType<typeof useQueryClient>, result: BranchBillingResult): void {
    const summary = queryClient.getQueryData(SUBSCRIPTION_KEYS.summary);
    if (summary) {
        queryClient.setQueryData(SUBSCRIPTION_KEYS.summary, {
            ...summary,
            usage: result.usage,
        });
    }
    queryClient.setQueryData(SUBSCRIPTION_KEYS.usage, result.usage);
}

/**
 * Activates a branch under the business subscription.
 *
 * Sends the optional `employee_capacity` so the plan's default capacity applies
 * when omitted. The backend decides whether activation is allowed (branch-limit
 * aware) and always remains authoritative on pricing and limits.
 */
export function useActivateBranch(): UseMutationResult<
    BranchBillingResult,
    Error,
    { branchId: string; employeeCapacity?: number }
> {
    const queryClient = useQueryClient();

    return useMutation<BranchBillingResult, Error, { branchId: string; employeeCapacity?: number }>({
        mutationFn: async ({ branchId, employeeCapacity }) => {
            const response = await apiClient.post<ApiSuccessResponse<BranchMutationDto>>(
                `/branches/${branchId}/activate`,
                employeeCapacity === undefined ? {} : { employee_capacity: employeeCapacity },
            );
            return {
                usage: mapUsage(response.data.data.usage),
                employeeCapacity: response.data.data.branch_subscription.employee_capacity ?? null,
            };
        },
        onSuccess: (result) => refreshUsage(queryClient, result),
    });
}

/** Deactivates a branch under the business subscription. */
export function useDeactivateBranch(): UseMutationResult<
    BranchBillingResult,
    Error,
    { branchId: string }
> {
    const queryClient = useQueryClient();

    return useMutation<BranchBillingResult, Error, { branchId: string }>({
        mutationFn: async ({ branchId }) => {
            const response = await apiClient.post<ApiSuccessResponse<BranchMutationDto>>(
                `/branches/${branchId}/deactivate`,
            );
            return {
                usage: mapUsage(response.data.data.usage),
                employeeCapacity: null,
            };
        },
        onSuccess: (result) => refreshUsage(queryClient, result),
    });
}

/** Updates a branch's employee capacity. */
export function useUpdateBranchCapacity(): UseMutationResult<
    BranchBillingResult,
    Error,
    { branchId: string; employeeCapacity: number }
> {
    const queryClient = useQueryClient();

    return useMutation<BranchBillingResult, Error, { branchId: string; employeeCapacity: number }>({
        mutationFn: async ({ branchId, employeeCapacity }) => {
            const response = await apiClient.put<ApiSuccessResponse<BranchMutationDto>>(
                `/branches/${branchId}/capacity`,
                { employee_capacity: employeeCapacity },
            );
            return {
                usage: mapUsage(response.data.data.usage),
                employeeCapacity: response.data.data.branch_subscription.employee_capacity ?? null,
            };
        },
        onSuccess: (result) => refreshUsage(queryClient, result),
    });
}
