import * as Dialog from '@radix-ui/react-dialog';
import { Check, MessageSquareText, X } from 'lucide-react';
import { useState } from 'react';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { LeaveRequest } from '@/types/leave-request';

interface ApproveRejectButtonsProps {
    request: LeaveRequest;
    isApproving?: boolean;
    isRejecting?: boolean;
    onApprove: (adminNotes: string | null) => Promise<void>;
    onReject: (rejectionReason: string) => Promise<void>;
}

/** Decision controls for a pending leave request. They contain no transport logic. */
export function ApproveRejectButtons({
    request,
    isApproving = false,
    isRejecting = false,
    onApprove,
    onReject,
}: ApproveRejectButtonsProps): JSX.Element | null {
    const [isApproveOpen, setIsApproveOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [adminNotes, setAdminNotes] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');

    if (request.status !== 'pending') {
        return null;
    }

    const busy = isApproving || isRejecting;

    return (
        <div className="flex flex-col gap-3 sm:flex-row">
            <Dialog.Root open={isApproveOpen} onOpenChange={setIsApproveOpen}>
                <Dialog.Trigger asChild>
                    <button
                        type="button"
                        disabled={busy}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 text-sm font-semibold text-success-foreground shadow-sm transition-colors hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Approve request
                    </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <Dialog.Title className="text-lg font-semibold text-foreground">
                            Approve leave request?
                        </Dialog.Title>
                        <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                            The employee will be notified and the approved leave will block the roster calendar.
                        </Dialog.Description>
                        <div className="mt-5 space-y-1.5">
                            <label htmlFor="approval-notes" className="block text-sm font-medium text-foreground">
                                Note to employee <span className="text-muted-foreground">(optional)</span>
                            </label>
                            <textarea
                                id="approval-notes"
                                rows={4}
                                maxLength={1000}
                                value={adminNotes}
                                onChange={(event) => setAdminNotes(event.target.value)}
                                placeholder="Add any useful approval details."
                                className={cn(
                                    'w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm text-foreground',
                                    'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                )}
                            />
                        </div>
                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    disabled={isApproving}
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                            </Dialog.Close>
                            <button
                                type="button"
                                disabled={isApproving}
                                onClick={() => void onApprove(adminNotes.trim() || null)}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-success px-4 text-sm font-semibold text-success-foreground transition-colors hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isApproving ? <LoadingSpinner className="text-success-foreground" label="Approving request" /> : null}
                                {isApproving ? 'Approving…' : 'Approve request'}
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>

            <Dialog.Root open={isRejectOpen} onOpenChange={setIsRejectOpen}>
                <Dialog.Trigger asChild>
                    <button
                        type="button"
                        disabled={busy}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-danger/30 bg-card px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Reject request
                    </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <Dialog.Title className="text-lg font-semibold text-foreground">
                            Reject leave request?
                        </Dialog.Title>
                        <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                            Explain the decision so the employee understands the next steps.
                        </Dialog.Description>
                        <div className="mt-5 space-y-1.5">
                            <label htmlFor="rejection-reason" className="block text-sm font-medium text-foreground">
                                Rejection reason <span aria-hidden="true">*</span>
                            </label>
                            <textarea
                                id="rejection-reason"
                                rows={4}
                                maxLength={1000}
                                value={rejectionReason}
                                onChange={(event) => setRejectionReason(event.target.value)}
                                placeholder="Provide a clear reason for rejecting this request."
                                aria-invalid={rejectionReason.trim().length === 0}
                                className={cn(
                                    'w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm text-foreground',
                                    'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                )}
                            />
                        </div>
                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    disabled={isRejecting}
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                            </Dialog.Close>
                            <button
                                type="button"
                                disabled={isRejecting || rejectionReason.trim().length === 0}
                                onClick={() => void onReject(rejectionReason.trim())}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isRejecting ? <LoadingSpinner className="text-danger-foreground" label="Rejecting request" /> : null}
                                {isRejecting ? 'Rejecting…' : 'Reject request'}
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>

            <span className="sr-only">
                <MessageSquareText aria-hidden="true" />
            </span>
        </div>
    );
}
