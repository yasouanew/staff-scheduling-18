import { Check } from 'lucide-react';

import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/Components/ui/card';

import type { ManagementPlan } from '../types';
import { formatCapacity, formatCyclePrice } from '../lib/format';

interface PlanCardProps {
    plan: ManagementPlan;
    /** Whether this plan is the one the business is currently subscribed to. */
    isCurrent: boolean;
    /** Whether the user may trigger a plan change (upgrade/downgrade). */
    canManage: boolean;
    /**
     * The billing cycle the plan comparison is currently showing. Only the
     * cycles present in `plan.interval` are actionable; the backend decides the
     * final price for whichever cycle is chosen.
     */
    selectedCycle: string;
    onCycleChange: (cycle: string) => void;
    /** Invoked when the user clicks Upgrade / Switch to this plan. */
    onSelect: (plan: ManagementPlan) => void;
}

const CYCLE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'six_month', label: '6 months' },
    { value: 'yearly', label: 'Yearly' },
];

/**
 * A single plan card in the management plan comparison.
 *
 * Pricing and limits always come from the backend plan record (`plan.interval`
 * drives which cycles are offered, `price_*` values drive the displayed price).
 * The UI never computes or hardcodes billing amounts.
 */
export function PlanCard({
    plan,
    isCurrent,
    canManage,
    selectedCycle,
    onCycleChange,
    onSelect,
}: PlanCardProps): JSX.Element {
    const supports = (cycle: string): boolean => plan.interval.includes(cycle as ManagementPlan['interval'][number]);
    const price = plan.interval.includes(selectedCycle as ManagementPlan['interval'][number])
        ? selectedCycle === 'monthly'
            ? plan.priceMonthly
            : selectedCycle === 'six_month'
                ? plan.priceSixMonthly ?? plan.priceMonthly
                : plan.priceYearly
        : plan.priceMonthly;

    return (
        <Card className={`flex flex-col ${isCurrent ? 'ring-2 ring-primary' : ''}`}>
            <CardHeader>
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {isCurrent && <Badge variant="primary">Current plan</Badge>}
                </div>
                <CardDescription>{plan.description}</CardDescription>

                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {formatCyclePrice(price, plan.currency, selectedCycle)}
                </p>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-4">
                <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{formatCapacity(plan.maxBranches)}</span>
                    <span className="text-muted-foreground">
                        {plan.maxBranches === null ? 'active branches' : 'active branches'}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{formatCapacity(plan.maxEmployees)}</span>
                    <span className="text-muted-foreground">employees</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {CYCLE_OPTIONS.filter((option) => supports(option.value)).map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onCycleChange(option.value)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${selectedCycle === option.value
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:bg-muted'
                                }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <ul className="space-y-2">
                    {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                            <span>{feature}</span>
                        </li>
                    ))}
                </ul>
            </CardContent>

            <CardFooter>
                {isCurrent ? (
                    <Button variant="outline" disabled className="w-full">
                        Current plan
                    </Button>
                ) : (
                    <Button
                        className="w-full"
                        disabled={!canManage}
                        onClick={() => onSelect(plan)}
                    >
                        Switch to this plan
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
