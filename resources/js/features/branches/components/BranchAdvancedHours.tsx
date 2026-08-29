import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { FieldErrors, UseFormRegister, UseFormWatch } from 'react-hook-form';

import { cn } from '@/lib/utils';
import { WEEKDAYS } from '@/types/branch';

import type { BranchFormInput } from '../schemas';
import { BranchDayScheduleRow } from './BranchDayScheduleRow';

interface BranchAdvancedHoursProps {
    register: UseFormRegister<BranchFormInput>;
    errors: FieldErrors<BranchFormInput>;
    watch: UseFormWatch<BranchFormInput>;
    /**
     * Whether to render expanded on mount. Set when editing a branch that
     * already has exceptions, so they are not hidden from the person editing.
     */
    defaultOpen?: boolean;
}

/**
 * Progressive disclosure for the per-weekday exceptions.
 *
 * Most branches trade the same hours daily, so seven rows of inputs would be
 * noise for the common case. They stay collapsed until asked for — but are
 * force-opened when a branch already has exceptions, since silently hiding
 * existing configuration behind a toggle is how it gets forgotten and
 * accidentally overwritten.
 *
 * The rows are always mounted, even while collapsed: unmounting them would drop
 * their registration and quietly exclude those values from validation.
 */
export function BranchAdvancedHours({
    register,
    errors,
    watch,
    defaultOpen = false,
}: BranchAdvancedHoursProps): JSX.Element {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    // Watched so each row can react to its own checkboxes without the parent
    // re-rendering the whole form on every keystroke.
    const daySchedules = watch('daySchedules');

    const exceptionCount = WEEKDAYS.filter(
        (weekday) => !daySchedules?.[weekday]?.useDefault,
    ).length;

    const hasErrors = Boolean(errors.daySchedules);

    return (
        <div className="rounded-lg border border-border">
            <button
                type="button"
                onClick={() => setIsOpen((previous) => !previous)}
                aria-expanded={isOpen}
                className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors',
                    'hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
            >
                <span className="space-y-0.5">
                    <span className="block text-sm font-medium text-foreground">
                        Advanced options
                    </span>
                    <span className="block text-sm text-muted-foreground">
                        {exceptionCount > 0
                            ? `${exceptionCount} ${exceptionCount === 1 ? 'day' : 'days'} differ from the standard day`
                            : 'Set different hours or breaks for specific days'}
                    </span>
                </span>

                <span className="flex items-center gap-2">
                    {hasErrors && (
                        <span className="text-xs font-medium text-danger">Needs attention</span>
                    )}
                    <ChevronDown
                        className={cn(
                            'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
                            isOpen && 'rotate-180',
                        )}
                        aria-hidden="true"
                    />
                </span>
            </button>

            <div className={cn('space-y-2 px-4 pb-4', !isOpen && 'hidden')}>
                {WEEKDAYS.map((weekday) => (
                    <BranchDayScheduleRow
                        key={weekday}
                        weekday={weekday}
                        register={register}
                        errors={errors}
                        useDefault={daySchedules?.[weekday]?.useDefault ?? true}
                        isOpen={daySchedules?.[weekday]?.isOpen ?? true}
                    />
                ))}
            </div>
        </div>
    );
}
