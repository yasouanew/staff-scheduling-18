import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import { apiClient, type ApiSuccessResponse, type PaginatedCollection } from '@/lib/api-client';

import { mondayOf, parseIsoDate, toIsoDate, weekEndFor } from '../lib/roster-week';

/** Minimal roster shape needed to resolve a shift's `roster_id`. */
interface ResolvedRosterDto {
    id: number;
    branch_id: number | null;
    week_start: string | null;
}

/**
 * Resolves the weekly roster that owns a `(branch, date)` pair, creating it when
 * it does not exist yet.
 *
 * The calendar edits *days*, but the schema stores one roster per **branch per ISO
 * week**. This hook is the bridge: it snaps the date back to its Monday, reuses
 * that branch's roster for the week, and only creates a `draft` roster when none
 * exists — so a month-grid edit never silently produces duplicate roster weeks.
 *
 * In-flight resolutions are de-duplicated by a `branch|week` key, which matters
 * when pasting into many cells of the same week at once: without it, N parallel
 * pastes would each create their own roster for the same week.
 */
export function useRosterResolver(): (branchId: string, date: string) => Promise<string> {
    const queryClient = useQueryClient();
    const inFlight = useRef(new Map<string, Promise<string>>());

    return useCallback(
        async (branchId: string, date: string): Promise<string> => {
            const parsed = parseIsoDate(date);
            if (!parsed) {
                throw new Error(`Invalid shift date: ${date}`);
            }

            const weekStart = toIsoDate(mondayOf(parsed));
            const cacheKey = `${branchId}|${weekStart}`;

            const pending = inFlight.current.get(cacheKey);
            if (pending) return pending;

            const resolution = (async (): Promise<string> => {
                // 1. Look for the branch's existing roster for this week.
                const existing = await apiClient.get<
                    ApiSuccessResponse<PaginatedCollection<ResolvedRosterDto>>
                >('/rosters', {
                    params: {
                        branch_id: branchId,
                        week_start: weekStart,
                        week_end: weekEndFor(weekStart),
                        per_page: 25,
                    },
                });

                const match = existing.data.data.data.find(
                    (roster) =>
                        roster.week_start === weekStart &&
                        String(roster.branch_id ?? '') === branchId,
                );

                if (match) return String(match.id);

                // 2. None yet — open a draft week for this branch.
                const created = await apiClient.post<ApiSuccessResponse<ResolvedRosterDto>>(
                    '/rosters',
                    {
                        branch_id: Number(branchId),
                        week_start: weekStart,
                        week_end: weekEndFor(weekStart),
                        status: 'draft',
                    },
                );

                void queryClient.invalidateQueries({ queryKey: ['rosters'] });

                return String(created.data.data.id);
            })();

            inFlight.current.set(cacheKey, resolution);

            try {
                return await resolution;
            } finally {
                inFlight.current.delete(cacheKey);
            }
        },
        [queryClient],
    );
}
