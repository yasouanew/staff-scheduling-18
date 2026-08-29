import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
    /** Extra classes controlling the box dimensions / shape. */
    className?: string;
    /** Corner rounding preset. Defaults to a large radius for cards/charts. */
    radius?: 'sm' | 'md' | 'lg' | 'full';
    /** Accessible label announced while content loads. */
    label?: string;
}

/** Maps the radius preset to its Tailwind utility. */
const RADIUS_CLASSES: Record<NonNullable<LoadingSkeletonProps['radius']>, string> = {
    sm: 'rounded',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
};

/**
 * Reusable pulsing placeholder box. Sizing is driven entirely by `className`
 * so callers can match the exact dimensions of the content being loaded
 * (e.g. a chart canvas or a stat value).
 */
export function LoadingSkeleton({
    className,
    radius = 'lg',
    label = 'Loading',
}: LoadingSkeletonProps): JSX.Element {
    return (
        <div
            role="status"
            aria-busy="true"
            aria-label={label}
            className={cn('animate-pulse bg-muted', RADIUS_CLASSES[radius], className)}
        >
            <span className="sr-only">{label}…</span>
        </div>
    );
}
