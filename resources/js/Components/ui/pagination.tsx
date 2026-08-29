import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from './button';

interface PaginationProps {
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
    className?: string;
}

export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps): JSX.Element | null {
    if (pageCount <= 1) {
        return null;
    }

    const boundedPage = Math.min(Math.max(page, 1), pageCount);

    return <nav aria-label="Pagination" className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
        <p className="text-sm text-muted-foreground">Page {boundedPage} of {pageCount}</p>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={boundedPage <= 1} onClick={() => onPageChange(boundedPage - 1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
            </Button>
            <Button variant="outline" size="sm" disabled={boundedPage >= pageCount} onClick={() => onPageChange(boundedPage + 1)}>
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
        </div>
    </nav>;
}
