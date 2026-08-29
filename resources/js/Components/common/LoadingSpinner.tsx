import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
    /** Additional utility classes (e.g. sizing or color overrides). */
    className?: string;
    /** Accessible label announced to screen readers. */
    label?: string;
}

/**
 * A minimal, accessible spinning indicator used inside buttons and
 * inline loading states. Inherits `currentColor` so it adapts to context.
 */
export function LoadingSpinner({ className, label = 'Loading' }: LoadingSpinnerProps): JSX.Element {
    return (
        <span role="status" aria-live="polite" className="inline-flex">
            <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden="true" />
            <span className="sr-only">{label}</span>
        </span>
    );
}
