import { UserX } from 'lucide-react';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/Components/ui/alert-dialog';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types/employee';

import { useRevokeInvitation } from '../hooks/useEmployees';

interface RevokeInviteDialogProps {
    /** Employee whose outstanding invitation is being revoked, or `null` when closed. */
    employee: Employee | null;
    /** Notifies the parent to clear the selection / close the dialog. */
    onOpenChange: (open: boolean) => void;
}

/**
 * Confirmation dialog for cancelling an employee's outstanding invitation.
 *
 * Backed by `DELETE /employees/{employee}/invitation`, which clears every
 * secret so any previously emailed link or code stops working immediately. The
 * person keeps their account and employee record — only the pending onboarding
 * invitation is cancelled, so they can be re-invited later.
 *
 * Destructive actions are always confirmed before being performed (per the UX
 * rules), hence the alert-dialog rather than a one-click menu item.
 */
export function RevokeInviteDialog({ employee, onOpenChange }: RevokeInviteDialogProps): JSX.Element {
    const revokeInvitation = useRevokeInvitation();

    const handleConfirm = async (): Promise<void> => {
        if (!employee) return;

        try {
            await revokeInvitation.mutateAsync(employee.id);

            toast.success('Invitation revoked', {
                description: `The link or code emailed to ${employee.name} no longer works.`,
            });
            onOpenChange(false);
        } catch (error) {
            toast.error('Unable to revoke invitation', {
                description: getApiErrorMessage(error, 'Something went wrong. Please try again.'),
            });
        }
    };

    return (
        <AlertDialog
            open={employee !== null}
            onOpenChange={(open) => {
                if (!open) onOpenChange(false);
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Revoke {employee?.name ?? 'this employee'}'s invitation?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This makes the emailed link or code stop working immediately. Their account
                        and records are kept — you can send a fresh invitation at any time.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel
                        className={cn(
                            'inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                            'hover:bg-secondary hover:text-secondary-foreground',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                    >
                        Keep invitation
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => void handleConfirm()}
                        disabled={revokeInvitation.isPending}
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground shadow-sm transition-colors',
                            'hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            'disabled:cursor-not-allowed disabled:opacity-70',
                        )}
                    >
                        {revokeInvitation.isPending ? (
                            <>
                                <LoadingSpinner
                                    className="text-danger-foreground"
                                    label="Revoking invitation"
                                />
                                Revoking...
                            </>
                        ) : (
                            <>
                                <UserX aria-hidden="true" className="size-4" />
                                Revoke invitation
                            </>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
