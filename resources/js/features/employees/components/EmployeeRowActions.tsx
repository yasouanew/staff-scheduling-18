import { CalendarClock, MailPlus, MoreHorizontal, Pencil, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/Components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types/employee';

interface EmployeeRowActionsProps {
    /** Row the menu belongs to. */
    employee: Employee;
    /** Opens the edit dialog for this employee. */
    onEdit: (employee: Employee) => void;
    /** Opens the send-invitation dialog for this employee. */
    onSendInvite: (employee: Employee) => void;
    /** Opens the revoke-invitation confirmation for this employee. */
    onRevokeInvite: (employee: Employee) => void;
}

/**
 * Per-row overflow ("three dot") menu for the team table.
 *
 * Purely presentational: it owns no data-fetching and no dialog state, it only
 * reports the chosen intent upward so the directory page can decide which modal
 * to open. That keeps the menu reusable from any table that renders employees.
 *
 * The invite item's wording adapts to the row's current invitation state so an
 * admin can tell at a glance whether this person has already been emailed.
 */
export function EmployeeRowActions({
    employee,
    onEdit,
    onSendInvite,
    onRevokeInvite,
}: EmployeeRowActionsProps): JSX.Element {
    const navigate = useNavigate();

    const inviteLabel = employee.invitation === null ? 'Send invite' : 'Resend invite';

    // Re-inviting someone who has already onboarded would reset their access, so
    // the item is disabled once the invitation has been accepted.
    const hasAccepted = employee.invitation?.status === 'accepted';

    // Revoking only makes sense for an outstanding invitation: an accepted one is
    // already inert (the person has onboarded), and an expired one has no live
    // secret left to cancel. Mirrors the backend's `isPending()` semantics.
    const isPending = employee.invitation?.status === 'pending';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Open actions for ${employee.name}`}
                    className={cn(
                        'inline-flex size-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors',
                        'hover:border-border hover:bg-muted hover:text-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'data-[state=open]:border-border data-[state=open]:bg-muted data-[state=open]:text-foreground',
                    )}
                >
                    <MoreHorizontal aria-hidden="true" className="size-4" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{employee.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem onSelect={() => onEdit(employee)}>
                    <Pencil aria-hidden="true" className="mr-2 size-4" />
                    Edit employee
                </DropdownMenuItem>

                <DropdownMenuItem
                    disabled={hasAccepted}
                    onSelect={() => onSendInvite(employee)}
                >
                    <MailPlus aria-hidden="true" className="mr-2 size-4" />
                    {hasAccepted ? 'Invite accepted' : inviteLabel}
                </DropdownMenuItem>

                {isPending && (
                    <DropdownMenuItem
                        onSelect={() => onRevokeInvite(employee)}
                        className="text-danger focus:bg-danger/10 focus:text-danger"
                    >
                        <UserX aria-hidden="true" className="mr-2 size-4" />
                        Revoke invite
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                    onSelect={() => navigate(`/employees/${employee.id}/availability`)}
                >
                    <CalendarClock aria-hidden="true" className="mr-2 size-4" />
                    Manage availability
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
