import { AlertCircle, Inbox, LoaderCircle, type LucideIcon } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Button } from './button';

export const LoadingSpinner = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function LoadingSpinner(
    { className, ...props },
    ref,
) {
    return <div ref={ref} role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)} {...props}>
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading</span>
    </div>;
});

export function LoadingSkeleton({ className }: { className?: string }): JSX.Element {
    return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

interface StatePanelProps extends HTMLAttributes<HTMLDivElement> {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
}

function StatePanel({ icon: Icon, title, description, action, className, ...props }: StatePanelProps): JSX.Element {
    return <div className={cn('flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center', className)} {...props}>
        {Icon ? <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="h-6 w-6" aria-hidden="true" /></span> : null}
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
    </div>;
}

export function EmptyState({ icon = Inbox, ...props }: StatePanelProps): JSX.Element {
    return <StatePanel icon={icon} {...props} />;
}

interface ErrorStateProps extends Omit<StatePanelProps, 'icon' | 'action'> {
    onRetry?: () => void;
    retryLabel?: string;
    action?: ReactNode;
}

export function ErrorState({
    onRetry,
    retryLabel = 'Try again',
    action,
    title = 'Something went wrong',
    description = 'We could not load this information. Please try again.',
    ...props
}: ErrorStateProps): JSX.Element {
    return <StatePanel
        icon={AlertCircle}
        title={title}
        description={description}
        action={action ?? (onRetry ? <Button variant="outline" onClick={onRetry}>{retryLabel}</Button> : undefined)}
        {...props}
    />;
}
