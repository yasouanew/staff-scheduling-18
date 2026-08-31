import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from 'sonner';

import { isStaleVersionError } from '@/lib/api-client';
import { schedulingErrorMessage } from '@/lib/scheduling-errors';
import type { Roster, RosterChangeMutation } from '@/types/roster-management';

import { useApplyRosterChanges, useRosterChangePreview, type RosterChangeSummary } from './useRosterChanges';

/**
 * Orchestrates the "Save Changes & Notify" flow for a published roster.
 *
 * The detail page feeds this hook the staged mutations and a way to refresh the
 * roster; the hook owns the dialog lifecycle:
 *
 *  - when the manager opens the review dialog, a preview is fetched from the
 *    backend (the source of truth for who is affected),
 *  - if the apply returns 409 (stale version) the roster is flagged stale and
 *    the manager is asked to reload before retrying,
 *  - on success the roster version is bumped (via the apply hook's cache write),
 *    the dialog closes and the staged batch is cleared.
 */

interface UseRosterChangeSaveArgs {
    roster: Roster;
    /** Staged, not-yet-saved mutations. */
    mutations: readonly RosterChangeMutation[];
    /** Called to clear the staged batch after a successful save. */
    onCleared: () => void;
    /** Refetches the roster (used after a 409 to reload the latest version). */
    refetch: () => Promise<unknown>;
}

interface UseRosterChangeSaveResult {
    /** Controls the review dialog. */
    dialogOpen: boolean;
    setDialogOpen: (open: boolean) => void;
    /** True while the preview request is in flight. */
    isPreviewing: boolean;
    /** The latest preview summary, or `null` before it resolves. */
    preview: RosterChangeSummary | null;
    /** Human-readable error from a failed preview/apply, or `null`. */
    error: string | null;
    /** True when the roster is stale (apply returned 409). */
    isStale: boolean;
    /** Refreshes the roster and clears the stale flag. */
    handleRefresh: () => void;
    /** Discards every staged mutation and closes the dialog. */
    handleCancel: () => void;
    /** Applies the staged changes, notifying affected employees. */
    handleSave: () => void;
    /** True while the apply mutation is in flight. */
    isSaving: boolean;
}

export function useRosterChangeSave({
    roster,
    mutations,
    onCleared,
    refetch,
}: UseRosterChangeSaveArgs): UseRosterChangeSaveResult {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [preview, setPreview] = useState<RosterChangeSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isStale, setIsStale] = useState(false);

    const previewMutation = useRosterChangePreview();
    const applyMutation = useApplyRosterChanges();

    // The batch the dialog was opened with, so a stale closure can never save a
    // batch that was cleared or replaced underneath the dialog.
    const openedMutationsRef = useRef<RosterChangeMutation[]>([]);

    // Keep a live reference to the roster so handlers always read the current
    // optimistic-lock version.
    const rosterRef = useRef(roster);
    rosterRef.current = roster;

    // Refetch the preview whenever the dialog opens onto a fresh batch.
    const previewMutationsRef = useRef(mutations);
    previewMutationsRef.current = mutations;

    const runPreview = useCallback(
        (batch: readonly RosterChangeMutation[]) => {
            if (batch.length === 0) {
                setPreview(null);
                setError(null);
                return;
            }

            setError(null);
            previewMutation.mutate(
                { rosterId: rosterRef.current.id, mutations: [...batch] },
                {
                    onSuccess: (summary) => {
                        setPreview(summary);
                    },
                    onError: (mutationError) => {
                        setError(schedulingErrorMessage(mutationError, 'Unable to preview changes.'));
                    },
                },
            );
        },
        // The preview mutation instance is stable; deliberately not listed so a
        // re-render does not re-fire an in-flight preview.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    // Open the dialog → immediately preview the current batch.
    useEffect(() => {
        if (dialogOpen) {
            openedMutationsRef.current = [...previewMutationsRef.current];
            setIsStale(false);
            runPreview(openedMutationsRef.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dialogOpen]);

    const handleRefresh = useCallback(() => {
        setIsStale(false);
        setError(null);
        void refetch().then(() => {
            // The roster has a new version; recompute the preview against it.
            runPreview(openedMutationsRef.current);
        });
    }, [refetch, runPreview]);

    const handleCancel = useCallback(() => {
        setDialogOpen(false);
        setPreview(null);
        setError(null);
        setIsStale(false);
        onCleared();
    }, [onCleared]);

    const handleSave = useCallback(() => {
        const batch = openedMutationsRef.current;
        if (batch.length === 0) {
            return;
        }

        setError(null);
        setIsStale(false);

        applyMutation.mutate(
            {
                rosterId: rosterRef.current.id,
                version: rosterRef.current.version,
                mutations: batch,
            },
            {
                onSuccess: () => {
                    toast.success('Roster changes saved', {
                        description: 'Affected employees have been notified.',
                    });
                    setDialogOpen(false);
                    setPreview(null);
                    setError(null);
                    onCleared();
                },
                onError: (mutationError) => {
                    if (isStaleVersionError(mutationError)) {
                        setIsStale(true);
                        setError(null);
                        return;
                    }
                    setError(
                        schedulingErrorMessage(mutationError, 'Unable to save roster changes.'),
                    );
                },
            },
        );
    }, [applyMutation, onCleared]);

    return {
        dialogOpen,
        setDialogOpen,
        isPreviewing: previewMutation.isPending,
        preview,
        error,
        isStale,
        handleRefresh,
        handleCancel,
        handleSave,
        isSaving: applyMutation.isPending,
    };
}
