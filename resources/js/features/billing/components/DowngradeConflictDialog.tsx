import { AlertTriangle, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/Components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';

import { formatCapacity } from '../lib/format';

interface DowngradeConflictDialogProps {
    open: boolean;
    /** Active user accounts currently counted (the backend's authoritative number). */
    used: number;
    /** Target plan's active-user seat cap. */
    cap: number | null;
    onOpenChange: (open: boolean) => void;
}

/**
 * Explains why a downgrade cannot proceed: the company currently has more active
 * user accounts than the target plan allows. The admin must deactivate members
 * first (via Employee Management) or choose a larger plan.
 *
 * This is the UI counterpart of the backend
 * `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED` (422). Numbers come from the backend
 * error envelope, which is authoritative over any client-side estimate.
 */
export function DowngradeConflictDialog({
    open,
    used,
    cap,
    onOpenChange,
}: DowngradeConflictDialogProps): JSX.Element {
    const excess = cap === null ? 0 : Math.max(used - cap, 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Cannot downgrade to this plan</DialogTitle>
                    <DialogDescription>
                        You currently have more active user accounts than this plan allows.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-foreground">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
                    <div className="space-y-1">
                        <p className="font-medium text-foreground">
                            {used} active users vs {formatCapacity(cap)} allowed
                        </p>
                        {excess > 0 && (
                            <p className="text-muted-foreground">
                                Deactivate at least <span className="font-medium text-foreground">{excess}</span>{' '}
                                {excess === 1 ? 'account' : 'accounts'} before downgrading.
                            </p>

                        )}
                        <Link
                            to="/employees"
                            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                            Manage members
                        </Link>
                    </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p>
                        A seat is one active user account — company admins, schedulers and employees all
                        count, whether or not they have a profile. Deactivate or delete members from the
                        Employee Directory to free seats.
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Keep current plan
                    </Button>
                    <Link
                        to="/employees"
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                        Manage members
                    </Link>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}