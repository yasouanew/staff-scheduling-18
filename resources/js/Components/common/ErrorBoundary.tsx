import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
    /** Protected subtree. */
    children: ReactNode;
    /** Optional heading for the fallback panel. */
    title?: string;
    /** Optional supporting copy for the fallback panel. */
    description?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

/**
 * Reusable client-side error boundary.
 *
 * Catches render/runtime failures in its subtree and swaps in a safe,
 * semantically-styled fallback with a retry affordance so a single broken
 * panel never takes down the surrounding platform interface.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = { hasError: false };

    public static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    public componentDidCatch(error: Error, info: ErrorInfo): void {
        // Route to the console for observability without leaking internals to the UI.
        console.error('ErrorBoundary caught an error:', error, info.componentStack);
    }

    private readonly handleReset = (): void => {
        this.setState({ hasError: false });
    };

    public render(): ReactNode {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const {
            title = 'Something went wrong',
            description = 'An unexpected error interrupted this view. You can retry safely.',
        } = this.props;

        return (
            <div
                role="alert"
                className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm"
            >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <button
                    type="button"
                    onClick={this.handleReset}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Try again
                </button>
            </div>
        );
    }
}
