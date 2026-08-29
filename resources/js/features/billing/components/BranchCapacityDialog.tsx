import { useState } from 'react';

import { Button } from '@/Components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { Input } from '@/Components/ui/input';
import { Label } from '@/Components/ui/form-field';

import type { BranchUsageItem } from '../types';

interface BranchCapacityDialogProps {
    open: boolean;
    branch: BranchUsageItem | null;
    /**
     * The currently entitled capacity. When the branch is inactive this is the
     * capacity that activation will grant (plan default unless overridden).
     */
    currentCapacity: number | null;
    /**
     * Maximum capacity the UI may suggest. Comes from the backend (e.g. the
     * plan's max_employees) and is never computed here.
     */
    suggestedMax: number | null;
    isPending: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (employeeCapacity: number) => void;
}

/**
 * Sets (or confirms on activation) a branch's employee capacity.
 *
 * The target capacity is typed by the user; the backend remains authoritative
 * on the real limit and pricing. `suggestedMax` is only a UI hint.
 */
export function BranchCapacityDialog({
    open,
    branch,
    currentCapacity,
    suggestedMax,
    isPending,
    onOpenChange,
    onConfirm,
}: BranchCapacityDialogProps): JSX.Element {
    const [value, setValue] = useState<string>(currentCapacity === null ? '' : String(currentCapacity));

    const parsed = Number.parseInt(value, 10);
    const isValid = Number.isFinite(parsed) && parsed > 0;

    // Keep the input in sync with the opened branch.
    const handleOpenChange = (next: boolean): void => {
        if (next && branch) {
            setValue(currentCapacity === null ? '' : String(currentCapacity));
        }
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {branch?.active ? 'Increase branch capacity' : 'Set employee capacity'}
                    </DialogTitle>
                    <DialogDescription>
                        {branch?.active
                            ? `${branch.name} is using ${branch.employeesUsed} of ${currentCapacity ?? 'Unlimited'} employee positions.`
                            : `Activate ${branch?.name ?? 'this branch'} and set its employee capacity.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="branch-capacity">Employee capacity</Label>
                        <Input
                            id="branch-capacity"
                            type="number"
                            min={1}
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                            placeholder="e.g. 50"
                        />
                        <p className="text-xs text-muted-foreground">
                            {suggestedMax === null
                                ? 'No limit applies — this plan allows unlimited employees.'
                                : `Current plan allows up to ${suggestedMax} employees per branch.`}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => isValid && onConfirm(parsed)}
                        disabled={!isValid || isPending}
                        loading={isPending}
                        loadingLabel={branch?.active ? 'Increasing…' : 'Activating…'}
                    >
                        {branch?.active ? 'Increase capacity' : 'Activate branch'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
