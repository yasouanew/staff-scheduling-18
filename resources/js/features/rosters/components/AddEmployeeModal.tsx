import * as Dialog from '@radix-ui/react-dialog';
import { UserRoundPlus, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Employee } from '@/types/employee';

import { useEmployees } from '../../employees/hooks/useEmployees';

interface AddEmployeeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Fires with the selected employee when the user confirms. */
    onAdd: (employee: Employee) => void;
}

/**
 * Dialog for selecting an employee to place on the current roster. Shows the
 * active employees from the directory; confirming calls `onAdd` so the parent
 * can add the employee as a new row with empty shift cells.
 */
export function AddEmployeeModal({
    open,
    onOpenChange,
    onAdd,
}: AddEmployeeModalProps): JSX.Element {
    const employeesQuery = useEmployees();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Reset the selection each time the dialog opens so a stale id never leaks
    // into a later confirm.
    const activeEmployees = useMemo(
        () => (employeesQuery.data ?? []).filter((employee) => employee.status === 'active'),
        [employeesQuery.data],
    );

    const selectedEmployee = useMemo(
        () => activeEmployees.find((employee) => employee.id === selectedId) ?? null,
        [activeEmployees, selectedId],
    );

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-xl focus:outline-none">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                        <div className="min-w-0">
                            <Dialog.Title className="text-lg font-semibold text-foreground">
                                Add employees
                            </Dialog.Title>
                            <Dialog.Description className="truncate text-sm text-muted-foreground">
                                Select an employee to add to this roster.
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            aria-label="Close add employees dialog"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-5">
                        {employeesQuery.isLoading ? (
                            <div className="space-y-2" aria-busy="true">
                                {[0, 1, 2, 3].map((key) => (
                                    <div
                                        key={key}
                                        className="h-14 animate-pulse rounded-lg bg-muted"
                                    />
                                ))}
                            </div>
                        ) : activeEmployees.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-sm text-muted-foreground">
                                    No active employees found.
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground/70">
                                    Add someone to your directory first, then return to
                                    place them on this roster.
                                </p>
                            </div>
                        ) : (
                            <ul className="space-y-1.5">
                                {activeEmployees.map((employee) => {
                                    const isSelected = employee.id === selectedId;

                                    return (
                                        <li key={employee.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedId(employee.id)}
                                                aria-pressed={isSelected}
                                                className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${isSelected
                                                        ? 'border-primary bg-primary/5'
                                                        : 'border-border hover:bg-secondary/60'
                                                    }`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-foreground">
                                                        {employee.name}
                                                    </p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {employee.position}
                                                    </p>
                                                </div>

                                                {isSelected ? (
                                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                        <Users className="h-3 w-3" aria-hidden="true" />
                                                    </span>
                                                ) : null}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 border-t border-border p-5">
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                Cancel
                            </button>
                        </Dialog.Close>

                        <button
                            type="button"
                            onClick={() => {
                                if (selectedEmployee) {
                                    onAdd(selectedEmployee);
                                }
                            }}
                            disabled={selectedEmployee === null}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                        >
                            <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
                            Add to roster
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
