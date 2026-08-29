import { Building2 } from 'lucide-react';

import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/Components/ui/card';

import type { BranchUsageItem } from '../types';
import { formatCapacity } from '../lib/format';
import { CapacityWarning } from './CapacityWarning';

interface BranchUsageCardProps {
    branch: BranchUsageItem;
    /** Max capacity the plan allows per branch (UI hint; backend is authoritative). */
    suggestedMax: number | null;
    /** Whether the user may activate/deactivate and change capacity. */
    canManage: boolean;
    /** Whether the business has reached its plan's active-branch allowance. */
    branchLimitReached: boolean;
    isActivating: boolean;
    onActivate: () => void;
    onIncreaseCapacity: () => void;
}

/**
 * A single branch's subscription + capacity card.
 *
 * Active branches show `20 / 25 employees, 5 positions remaining` (or a
 * capacity warning near the limit). Inactive branches show an
 * `[Activate Branch]` action instead.
 */
export function BranchUsageCard({
    branch,
    suggestedMax,
    canManage,
    branchLimitReached,
    isActivating,
    onActivate,
    onIncreaseCapacity,
}: BranchUsageCardProps): JSX.Element {
    const capacityLabel = formatCapacity(branch.employeeCapacity);

    return (
        <Card className="flex flex-col">
            <CardHeader>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                            <Building2 className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <CardTitle className="truncate text-base">{branch.name}</CardTitle>
                            <CardDescription>Branch subscription</CardDescription>
                        </div>
                    </div>
                    <Badge variant={branch.active ? 'success' : 'neutral'}>
                        {branch.active ? 'Active' : 'Inactive'}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-4">
                {branch.active ? (
                    <>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-semibold tracking-tight text-foreground">
                                {branch.employeesUsed}
                                <span className="text-base font-medium text-muted-foreground"> / {capacityLabel}</span>
                            </span>
                            <span className="text-sm text-muted-foreground">employees</span>
                        </div>

                        <CapacityWarning
                            used={branch.employeesUsed}
                            capacity={branch.employeeCapacity}
                            action={
                                canManage && (branch.employeeCapacity === null || branch.remaining === 0)
                                    ? <Button variant="outline" size="sm" onClick={onIncreaseCapacity}>Increase capacity</Button>
                                    : undefined
                            }
                        />
                    </>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-4 text-center">
                        <p className="text-sm text-muted-foreground">
                            This branch is not yet available for scheduling.
                        </p>
                        {canManage && (
                            <Button
                                onClick={onActivate}
                                disabled={branchLimitReached}
                                loading={isActivating}
                                loadingLabel="Activating…"
                            >
                                Activate Branch
                            </Button>
                        )}
                        {branchLimitReached && canManage && (
                            <p className="text-xs text-warning">
                                Your plan's active-branch limit has been reached.
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
