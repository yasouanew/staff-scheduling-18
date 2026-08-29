import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';

import { cn } from '@/lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface DatePickerProps {
    value?: Date;
    defaultValue?: Date;
    onValueChange?: (date: Date | undefined) => void;
    placeholder?: string;
    disabled?: boolean;
    fromDate?: Date;
    toDate?: Date;
    className?: string;
    id?: string;
    ariaLabel?: string;
}

export function DatePicker({
    value,
    defaultValue,
    onValueChange,
    placeholder = 'Select date',
    disabled = false,
    fromDate,
    toDate,
    className,
    id,
    ariaLabel,
}: DatePickerProps): JSX.Element {
    const [internalValue, setInternalValue] = useState<Date | undefined>(defaultValue);
    const [open, setOpen] = useState(false);
    const selectedDate = value ?? internalValue;

    const handleSelect = (nextDate: Date | undefined): void => {
        if (value === undefined) {
            setInternalValue(nextDate);
        }

        onValueChange?.(nextDate);
        setOpen(false);
    };

    return <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button
                id={id}
                variant="outline"
                className={cn('w-full justify-start text-left font-normal', ! selectedDate && 'text-muted-foreground', className)}
                disabled={disabled}
                aria-label={ariaLabel ?? placeholder}
            >
                <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                {selectedDate ? format(selectedDate, 'PPP') : placeholder}
            </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
            <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleSelect}
                disabled={(date) => (fromDate ? date < fromDate : false) || (toDate ? date > toDate : false)}
                initialFocus
            />
        </PopoverContent>
    </Popover>;
}
