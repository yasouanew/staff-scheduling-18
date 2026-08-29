import * as Switch from '@radix-ui/react-switch';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import type {
    OperationalPolicies,
    OperationalPolicyKey,
    PolicyDescriptor,
} from '@/types/settings';

// ---------------------------------------------------------------------------
// Static policy catalogue
// ---------------------------------------------------------------------------

/** The ordered list of policies rendered in the panel. */
const POLICY_DESCRIPTORS: readonly PolicyDescriptor[] = [
    {
        key: 'preventSchedulingDuringLeave',
        title: 'Prevent scheduling during approved leave',
        description:
            'Block managers from assigning shifts to employees who have an approved leave request covering that period.',
    },
    {
        key: 'enforceMandatoryBreaks',
        title: 'Enforce mandatory 10-hour breaks between shifts',
        description:
            'Automatically reject rosters that leave fewer than 10 hours of rest between an employee’s consecutive shifts.',
    },
    {
        key: 'autoPublishRosters',
        title: 'Auto-publish rosters on finalisation',
        description:
            'Immediately notify staff and publish the roster the moment a manager marks a week as final.',
    },
    {
        key: 'notifyOnShiftSwap',
        title: 'Notify managers on shift swap requests',
        description:
            'Send a push and in-app notification to branch managers whenever an employee proposes a shift swap.',
    },
    {
        key: 'restrictOvertimeWithoutApproval',
        title: 'Restrict overtime without prior approval',
        description:
            'Require explicit manager approval before an employee can be scheduled beyond their contracted hours.',
    },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PolicyTogglePanelProps {
    /** Current persisted values for every policy switch. */
    value: OperationalPolicies;
    /**
     * Persists the full policy set. Returning a promise keeps the affected row
     * in a saving state and reverts on rejection.
     */
    onChange: (next: OperationalPolicies) => Promise<void>;
    /** Additional container class names. */
    className?: string;
}

// ---------------------------------------------------------------------------
// PolicyTogglePanel
// ---------------------------------------------------------------------------

/**
 * An elegant settings panel that renders every global operational policy as an
 * accessible Radix UI switch. Each toggle optimistically updates, shows an
 * inline saving indicator, surfaces a success toast, and rolls back on failure.
 *
 * Data persistence is delegated to the parent via `onChange`, keeping this a
 * reusable presentational component.
 */
export function PolicyTogglePanel({
    value,
    onChange,
    className,
}: PolicyTogglePanelProps): JSX.Element {
    // Tracks which policy row is mid-flight so we can disable it and show a spinner.
    const [pendingKey, setPendingKey] = useState<OperationalPolicyKey | null>(null);

    const handleToggle = async (key: OperationalPolicyKey, checked: boolean): Promise<void> => {
        const next: OperationalPolicies = { ...value, [key]: checked };
        setPendingKey(key);

        try {
            await onChange(next);
            const timestamp = new Intl.DateTimeFormat('en-AU', {
                dateStyle: 'medium',
                timeStyle: 'short',
            }).format(new Date());
            toast.success('Configuration updated successfully.', {
                description: `Saved at ${timestamp}`,
            });
        } catch {
            toast.error('Unable to update policy.', {
                description: 'The change was reverted. Please try again.',
            });
        } finally {
            setPendingKey(null);
        }
    };

    return (
        <div
            className={cn(
                'overflow-hidden rounded-xl border border-border bg-card shadow-sm',
                className,
            )}
        >
            {/* Panel header */}
            <div className="flex items-center gap-3 border-b border-border bg-secondary/40 px-6 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Operational Policies</h3>
                    <p className="text-xs text-muted-foreground">
                        Global scheduling safeguards applied across every branch.
                    </p>
                </div>
            </div>

            {/* Policy rows */}
            <ul className="divide-y divide-border" role="list">
                {POLICY_DESCRIPTORS.map((policy) => {
                    const checked = value[policy.key];
                    const isPending = pendingKey === policy.key;
                    const switchId = `policy-${policy.key}`;
                    const descriptionId = `${switchId}-description`;

                    return (
                        <li
                            key={policy.key}
                            className="flex items-start justify-between gap-6 px-6 py-5 transition-colors hover:bg-secondary/30"
                        >
                            <div className="space-y-1">
                                <label
                                    htmlFor={switchId}
                                    className="block cursor-pointer text-sm font-medium text-foreground"
                                >
                                    {policy.title}
                                </label>
                                <p id={descriptionId} className="text-sm text-muted-foreground">
                                    {policy.description}
                                </p>
                            </div>

                            <div className="flex flex-shrink-0 items-center gap-3 pt-0.5">
                                {isPending && (
                                    <LoadingSpinner
                                        className="h-4 w-4 text-muted-foreground"
                                        label="Saving policy"
                                    />
                                )}
                                <Switch.Root
                                    id={switchId}
                                    checked={checked}
                                    disabled={isPending}
                                    aria-describedby={descriptionId}
                                    onCheckedChange={(next) => {
                                        void handleToggle(policy.key, next);
                                    }}
                                    className={cn(
                                        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                        'disabled:cursor-not-allowed disabled:opacity-60',
                                        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
                                    )}
                                >
                                    <Switch.Thumb
                                        className={cn(
                                            'pointer-events-none block h-5 w-5 rounded-full bg-card shadow-sm transition-transform duration-200',
                                            'translate-x-0.5 data-[state=checked]:translate-x-[22px]',
                                        )}
                                    />
                                </Switch.Root>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
