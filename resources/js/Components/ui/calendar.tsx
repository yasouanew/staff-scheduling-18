import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, type DayPickerProps } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

export type CalendarProps = DayPickerProps;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps): JSX.Element {
    return <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn('p-1', className)}
        classNames={{
            root: 'text-foreground',
            months: 'flex flex-col gap-4 sm:flex-row',
            month: 'space-y-3',
            month_caption: 'relative flex h-9 items-center justify-center',
            caption_label: 'text-sm font-semibold',
            nav: 'absolute inset-x-0 flex items-center justify-between',
            button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-8 w-8'),
            button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-8 w-8'),
            chevron: 'h-4 w-4',
            month_grid: 'w-full border-collapse',
            weekdays: 'flex',
            weekday: 'w-9 rounded-md text-center text-xs font-medium text-muted-foreground',
            week: 'mt-1 flex w-full',
            day: 'relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20',
            day_button: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-9 w-9 rounded-md p-0 font-normal aria-selected:opacity-100'),
            selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
            today: 'bg-accent text-accent-foreground',
            outside: 'text-muted-foreground opacity-50',
            disabled: 'text-muted-foreground opacity-40',
            hidden: 'invisible',
            range_middle: 'rounded-none bg-accent text-accent-foreground',
            range_start: 'rounded-l-md bg-primary text-primary-foreground',
            range_end: 'rounded-r-md bg-primary text-primary-foreground',
            ...classNames,
        }}
        components={{
            Chevron: ({ orientation, className: iconClassName }) => orientation === 'left'
                ? <ChevronLeft className={cn('h-4 w-4', iconClassName)} aria-hidden="true" />
                : <ChevronRight className={cn('h-4 w-4', iconClassName)} aria-hidden="true" />,
        }}
        {...props}
    />;
}
