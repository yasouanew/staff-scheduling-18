import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export const buttonVariants = cva(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
                outline: 'border border-input bg-card text-foreground hover:bg-secondary hover:text-secondary-foreground',
                ghost: 'text-foreground hover:bg-secondary hover:text-secondary-foreground',
                destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                link: 'h-auto px-0 py-0 text-primary underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 rounded-md px-3 text-xs',
                lg: 'h-11 px-5 text-base',
                icon: 'h-10 w-10 p-0',
                'icon-sm': 'h-9 w-9 rounded-md p-0',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    loading?: boolean;
    loadingLabel?: string;
    children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        className,
        variant,
        size,
        loading = false,
        loadingLabel,
        disabled,
        children,
        type = 'button',
        ...props
    },
    ref,
) {
    return <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
    >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {loading ? loadingLabel ?? children : children}
    </button>;
});
