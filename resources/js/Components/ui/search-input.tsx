import { Search, X } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
    { className, onClear, value, ...props },
    ref,
) {
    const hasValue = typeof value === 'string' && value.length > 0;

    return <div className={cn('relative w-full sm:max-w-xs', className)}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input ref={ref} type="search" value={value} className="pl-9 pr-9" {...props} />
        {hasValue && onClear ? <Button type="button" variant="ghost" size="icon-sm" onClick={onClear} className="absolute right-0 top-1/2 -translate-y-1/2" aria-label="Clear search">
            <X className="h-4 w-4" aria-hidden="true" />
        </Button> : null}
    </div>;
});
