import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/lib/utils';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const DropdownMenuContent = forwardRef<ElementRef<typeof DropdownMenuPrimitive.Content>, ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>>(function DropdownMenuContent(
    { className, sideOffset = 8, ...props },
    ref,
) {
    return <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn('z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none', className)}
            {...props}
        />
    </DropdownMenuPrimitive.Portal>;
});

type DropdownMenuItemProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean };

type DropdownMenuLabelProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean };

type DropdownMenuSubTriggerProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean };

export const DropdownMenuItem = forwardRef<ElementRef<typeof DropdownMenuPrimitive.Item>, DropdownMenuItemProps>(function DropdownMenuItem(
    { className, inset = false, ...props },
    ref,
) {
    return <DropdownMenuPrimitive.Item
        ref={ref}
        data-inset={inset || undefined}
        className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset=true]:pl-8', className)}
        {...props}
    />;
});

export const DropdownMenuCheckboxItem = forwardRef<ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>, ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>>(function DropdownMenuCheckboxItem(
    { className, children, checked, ...props },
    ref,
) {
    return <DropdownMenuPrimitive.CheckboxItem
        ref={ref}
        checked={checked}
        className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-md py-2 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)}
        {...props}
    >
        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator><Check className="h-3.5 w-3.5" aria-hidden="true" /></DropdownMenuPrimitive.ItemIndicator>
        </span>
        {children}
    </DropdownMenuPrimitive.CheckboxItem>;
});

export const DropdownMenuLabel = forwardRef<ElementRef<typeof DropdownMenuPrimitive.Label>, DropdownMenuLabelProps>(function DropdownMenuLabel(
    { className, inset = false, ...props },
    ref,
) {
    return <DropdownMenuPrimitive.Label ref={ref} data-inset={inset || undefined} className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground data-[inset=true]:pl-8', className)} {...props} />;
});

export const DropdownMenuSeparator = forwardRef<ElementRef<typeof DropdownMenuPrimitive.Separator>, ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>>(function DropdownMenuSeparator(
    { className, ...props },
    ref,
) {
    return <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
});

export const DropdownMenuSubTrigger = forwardRef<ElementRef<typeof DropdownMenuPrimitive.SubTrigger>, DropdownMenuSubTriggerProps>(function DropdownMenuSubTrigger(
    { className, children, inset = false, ...props },
    ref,
) {
    return <DropdownMenuPrimitive.SubTrigger ref={ref} data-inset={inset || undefined} className={cn('flex cursor-pointer select-none items-center rounded-md px-2 py-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[inset=true]:pl-8', className)} {...props}>
        {children}<ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" />
    </DropdownMenuPrimitive.SubTrigger>;
});

export const DropdownMenuSubContent = forwardRef<ElementRef<typeof DropdownMenuPrimitive.SubContent>, ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>>(function DropdownMenuSubContent(
    { className, ...props },
    ref,
) {
    return <DropdownMenuPrimitive.SubContent ref={ref} className={cn('z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none', className)} {...props} />;
});
