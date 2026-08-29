import { forwardRef, type HTMLAttributes, type TableHTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export const TableContainer = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function TableContainer(
    { className, ...props },
    ref,
) {
    return <div ref={ref} className={cn('w-full overflow-x-auto rounded-xl border border-border bg-card shadow-sm', className)} {...props} />;
});

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(function Table(
    { className, ...props },
    ref,
) {
    return <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />;
});

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(function TableHeader(
    { className, ...props },
    ref,
) {
    return <thead ref={ref} className={cn('border-b border-border bg-muted/40', className)} {...props} />;
});

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(function TableBody(
    { className, ...props },
    ref,
) {
    return <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
});

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(function TableRow(
    { className, ...props },
    ref,
) {
    return <tr ref={ref} className={cn('border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-accent', className)} {...props} />;
});

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(function TableHead(
    { className, ...props },
    ref,
) {
    return <th ref={ref} scope="col" className={cn('h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)} {...props} />;
});

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(function TableCell(
    { className, ...props },
    ref,
) {
    return <td ref={ref} className={cn('px-4 py-3 align-middle text-foreground', className)} {...props} />;
});

export const TableCaption = forwardRef<HTMLTableCaptionElement, HTMLAttributes<HTMLTableCaptionElement>>(function TableCaption(
    { className, ...props },
    ref,
) {
    return <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />;
});
