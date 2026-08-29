import { useCallback, useMemo, useState } from 'react';

import type {
    Roster,
    RosterChangeMutation,
    RosterShift,
} from '@/types/roster-management';

import type { ShiftTemplateValues } from '../lib/shift-payload';
import {
    deriveWorkingShifts,
    isTempShiftId,
    toShiftChangePayload,
} from '../lib/change-mutations';

/**
 * Staging layer for post-publication roster edits.
 *
 * Once a roster is published, every cell gesture (add / update / cancel /
 * reassign / delete) is *staged* as a {@link RosterChangeMutation} instead of
 * being written to the API immediately. The manager reviews the batch in the
 * "Save Changes & Notify" dialog — which previews the affected employees from
 * the backend — and only then applies the whole batch atomically.
 *
 * The hook exposes:
 *  - the staged mutations,
 *  - the derived "working shifts" (base shifts + staged edits) the grid renders,
 *  - helpers to stage each gesture,
 *  - a resolver that maps a returned summary's new `version` back onto the
 *    roster so the optimistic lock stays correct across preview/apply,
 *  - a discriminator used by the detail page to decide whether a gesture goes
 *    through the published flow or the normal draft flow.
 */

interface UsePublishedRosterMutationsArgs {
    /** The roster being edited (must be published for staging to apply). */
    roster: Roster;
}

interface UsePublishedRosterMutationsResult {
    /** True when the roster is published (edits must be staged + notified). */
    isPublished: boolean;
    /** The staged, not-yet-saved mutations. */
    mutations: RosterChangeMutation[];
    /** Base shifts + staged edits, rendered by the grid while pending. */
    workingShifts: RosterShift[];
    /** Number of staged mutations (used to arm the "review changes" button). */
    pendingCount: number;
    /** True when the roster is published and there is at least one staged edit. */
    hasPendingChanges: boolean;

    /** Stage an add (new shift in a cell). */
    stageAdd: (placement: { date: string; employeeId: string | null }, values: ShiftTemplateValues) => void;
    /** Stage an update to an existing shift. */
    stageUpdate: (shiftId: string, placement: { date: string; employeeId: string | null }, values: ShiftTemplateValues) => void;
    /** Stage a cancel (deleting a shift on a published roster). */
    stageCancel: (shiftId: string) => void;
    /** Stage a reassignment to a different employee. */
    stageReassign: (shiftId: string, employeeId: string | null) => void;
    /** Remove a single staged mutation (e.g. undo a staged add). */
    discardMutation: (mutationIndex: number) => void;
    /** Discard every staged mutation (e.g. the dialog was cancelled). */
    discardAll: () => void;
    /** Replace the whole batch (used to reconcile after a version conflict). */
    replaceMutations: (mutations: RosterChangeMutation[]) => void;
}

export function usePublishedRosterMutations({
    roster,
}: UsePublishedRosterMutationsArgs): UsePublishedRosterMutationsResult {
    const [mutations, setMutations] = useState<RosterChangeMutation[]>([]);

    const isPublished = roster.status === 'published';

    // Whenever the roster identity changes (a different week is opened) the
    // staged batch is stale and must be cleared.
    const rosterKey = `${roster.id}:${roster.version}`;
    const [lastRosterKey, setLastRosterKey] = useState(rosterKey);
    if (lastRosterKey !== rosterKey) {
        setLastRosterKey(rosterKey);
        setMutations([]);
    }

    // Guard against `roster` being the pre-load fallback (`{}`): the detail
    // page calls this hook before its roster query resolves, and
    // `deriveWorkingShifts` iterates `shifts`, so an undefined array would
    // throw a render-time TypeError and unmount the page via the ErrorBoundary.
    const workingShifts = useMemo(
        () => deriveWorkingShifts(roster.shifts ?? [], mutations),
        [roster.shifts, mutations],
    );

    const stageAdd = useCallback(
        (placement: { date: string; employeeId: string | null }, values: ShiftTemplateValues): void => {
            if (!isPublished) {
                return;
            }
            setMutations((current) => [
                ...current,
                {
                    type: 'add',
                    id: `temp-${Date.now()}-${current.length}`,
                    shift: toShiftChangePayload(placement, values, true),
                },
            ]);
        },
        [isPublished],
    );

    const stageUpdate = useCallback(
        (
            shiftId: string,
            placement: { date: string; employeeId: string | null },
            values: ShiftTemplateValues,
        ): void => {
            if (!isPublished) {
                return;
            }
            // Updating a just-staged (unsaved) shift must mutate that staged add
            // rather than stack an update on top of it.
            const existingIndex = mutations.findIndex(
                (m) => m.type === 'add' && m.id === shiftId,
            );
            if (existingIndex !== -1) {
                setMutations((current) =>
                    current.map((m, index) =>
                        index === existingIndex
                            ? {
                                ...m,
                                shift: toShiftChangePayload(placement, values, true),
                            }
                            : m,
                    ),
                );
                return;
            }

            setMutations((current) => [
                ...current.filter((m) => !(m.type === 'update' && m.id === shiftId)),
                {
                    type: 'update',
                    id: shiftId,
                    shift: toShiftChangePayload(placement, values, true),
                },
            ]);
        },
        [isPublished, mutations],
    );

    const stageCancel = useCallback(
        (shiftId: string): void => {
            if (!isPublished) {
                return;
            }
            setMutations((current) => {
                // Cancelling a shift that was staged as an add earlier in this
                // batch nets it out entirely (it was never saved to the roster).
                if (isTempShiftId(shiftId)) {
                    return current.filter((m) => !(m.type === 'add' && m.id === shiftId));
                }
                // Replace any prior staged update of the same shift with the
                // cancellation so the batch stays minimal.
                const withoutUpdates = current.filter(
                    (m) => !(m.type === 'update' && m.id === shiftId),
                );
                return [...withoutUpdates, { type: 'cancel', id: shiftId }];
            });
        },
        [isPublished],
    );

    const stageReassign = useCallback(
        (shiftId: string, employeeId: string | null): void => {
            if (!isPublished) {
                return;
            }
            setMutations((current) => [
                ...current.filter((m) => !(m.type === 'cancel' && m.id === shiftId)),
                {
                    type: 'reassign',
                    id: shiftId,
                    employee_id: employeeId,
                },
            ]);
        },
        [isPublished],
    );

    const discardMutation = useCallback((mutationIndex: number): void => {
        setMutations((current) => current.filter((_, index) => index !== mutationIndex));
    }, []);

    const discardAll = useCallback((): void => {
        setMutations([]);
    }, []);

    const replaceMutations = useCallback((next: RosterChangeMutation[]): void => {
        setMutations(next);
    }, []);

    return {
        isPublished,
        mutations,
        workingShifts,
        pendingCount: mutations.length,
        hasPendingChanges: isPublished && mutations.length > 0,
        stageAdd,
        stageUpdate,
        stageCancel,
        stageReassign,
        discardMutation,
        discardAll,
        replaceMutations,
    };
}
