import type { FieldErrors, UseFormRegister } from 'react-hook-form';

import { cn } from '@/lib/utils';

import type { BranchFormInput } from '../schemas';

/** Shared control styling, matching the rest of the branch form. */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

interface BranchHoursFieldsProps {
    register: UseFormRegister<BranchFormInput>;
    errors: FieldErrors<BranchFormInput>;
}

/**
 * The branch's standard trading day and break policy.
 *
 * This is the only part of the schedule most branches will ever fill in; the
 * per-day overrides sit behind "Advanced options" precisely so that this
 * remains the short, obvious path.
 */
export function BranchHoursFields({ register, errors }: BranchHoursFieldsProps): JSX.Element {
    return (
        <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-foreground">Standard day</legend>
            <p className="text-sm text-muted-foreground">
                Applies to every day of the week unless you set an exception below.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label
                        htmlFor="defaultOpensAt"
                        className="block text-sm font-medium text-foreground"
                    >
                        Opens at
                    </label>
                    <input
                        id="defaultOpensAt"
                        type="time"
                        aria-invalid={Boolean(errors.defaultOpensAt)}
                        className={fieldClasses}
                        {...register('defaultOpensAt')}
                    />
                    {errors.defaultOpensAt && (
                        <p className="text-sm text-danger">{errors.defaultOpensAt.message}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label
                        htmlFor="defaultClosesAt"
                        className="block text-sm font-medium text-foreground"
                    >
                        Closes at
                    </label>
                    <input
                        id="defaultClosesAt"
                        type="time"
                        aria-invalid={Boolean(errors.defaultClosesAt)}
                        className={fieldClasses}
                        {...register('defaultClosesAt')}
                    />
                    {errors.defaultClosesAt && (
                        <p className="text-sm text-danger">{errors.defaultClosesAt.message}</p>
                    )}
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label
                        htmlFor="defaultBreakMinutes"
                        className="block text-sm font-medium text-foreground"
                    >
                        Break length
                    </label>
                    <div className="relative">
                        <input
                            id="defaultBreakMinutes"
                            type="number"
                            min={0}
                            max={480}
                            step={5}
                            inputMode="numeric"
                            placeholder="30"
                            aria-invalid={Boolean(errors.defaultBreakMinutes)}
                            className={cn(fieldClasses, 'pr-16')}
                            {...register('defaultBreakMinutes')}
                        />
                        <span
                            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
                            aria-hidden="true"
                        >
                            minutes
                        </span>
                    </div>
                    {errors.defaultBreakMinutes && (
                        <p className="text-sm text-danger">{errors.defaultBreakMinutes.message}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label
                        htmlFor="defaultBreakPayType"
                        className="block text-sm font-medium text-foreground"
                    >
                        Break type
                    </label>
                    <select
                        id="defaultBreakPayType"
                        aria-invalid={Boolean(errors.defaultBreakPayType)}
                        className={fieldClasses}
                        {...register('defaultBreakPayType')}
                    >
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                    </select>
                    {errors.defaultBreakPayType && (
                        <p className="text-sm text-danger">{errors.defaultBreakPayType.message}</p>
                    )}
                </div>
            </div>
        </fieldset>
    );
}
