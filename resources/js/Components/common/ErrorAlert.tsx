import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Visual/semantic tone of the alert. */
export type AlertVariant = 'danger' | 'warning' | 'info' | 'success';

interface ErrorAlertProps {
    /**
     * The message(s) to display. A single string renders one line; an array
     * renders a compact bullet list (handy for multiple field errors).
     */
    message: string | string[];
    /** Optional bold heading rendered above the message. */
    title?: string;
    /** Semantic tone controlling colour + icon. Defaults to `danger`. */
    variant?: AlertVariant;
    /** When provided, renders a dismiss (×) button that invokes this callback. */
    onDismiss?: () => void;
    /** Additional utility classes for layout tweaks. */
    className?: string;
}

/** Per-variant icon, token classes and screen-reader urgency. */
const VARIANT_STYLES: Record<
    AlertVariant,
    { icon: typeof AlertCircle; container: string; icon_color: string; live: 'assertive' | 'polite' }
> = {
    danger: {
        icon: AlertCircle,
        container: 'border-danger/30 bg-danger/10',
        icon_color: 'text-danger',
        live: 'assertive',
    },
    warning: {
        icon: AlertTriangle,
        container: 'border-warning/30 bg-warning/10',
        icon_color: 'text-warning',
        live: 'assertive',
    },
    info: {
        icon: Info,
        container: 'border-info/30 bg-info/10',
        icon_color: 'text-info',
        live: 'polite',
    },
    success: {
        icon: CheckCircle2,
        container: 'border-success/30 bg-success/10',
        icon_color: 'text-success',
        live: 'polite',
    },
};

/**
 * Reusable inline alert for surfacing server-side errors and status messages
 * within forms and pages. Pure presentational component — it holds no state
 * and simply renders whatever message it is given, with accessible
 * `role="alert"` semantics so assistive tech announces it immediately.
 */
export function ErrorAlert({
    message,
    title,
    variant = 'danger',
    onDismiss,
    className,
}: ErrorAlertProps): JSX.Element {
    const styles = VARIANT_STYLES[variant];
    const Icon = styles.icon;
    const messages = Array.isArray(message) ? message : [message];

    let body: ReactNode;
    if (messages.length > 1) {
        body = (
            <ul className="list-disc space-y-0.5 pl-4">
                {messages.map((line) => (
                    <li key={line}>{line}</li>
                ))}
            </ul>
        );
    } else {
        body = <p>{messages[0]}</p>;
    }

    return (
        <div
            role="alert"
            aria-live={styles.live}
            className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-sm text-foreground',
                styles.container,
                className,
            )}
        >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', styles.icon_color)} aria-hidden="true" />

            <div className="min-w-0 flex-1 space-y-0.5">
                {title && <p className={cn('font-medium', styles.icon_color)}>{title}</p>}
                <div className="text-foreground/90">{body}</div>
            </div>

            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss message"
                    className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
                        'text-muted-foreground hover:text-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
