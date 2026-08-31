import { CalendarRange } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { cn } from '@/lib/utils';
import type { NavItem } from './nav-items';

interface MobileNavigationProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: readonly NavItem[];
}

/** Responsive drawer used below the tablet breakpoint. */
export function MobileNavigation({ open, onOpenChange, items }: MobileNavigationProps): JSX.Element {
    return <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="inset-y-0 left-0 top-0 h-dvh w-[min(19rem,calc(100%-3rem))] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-y-0 border-l-0 p-0 shadow-xl">
            <DialogHeader className="flex h-16 shrink-0 flex-row items-center gap-3 border-b border-border px-4 py-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <CalendarRange className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <DialogTitle className="text-base">Rosterly</DialogTitle>
                    <DialogDescription className="text-xs">Staff scheduling workspace</DialogDescription>
                </div>
            </DialogHeader>
            <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-4">
                <ul className="space-y-1">
                    {items.map((item, index) => {
                        const Icon = item.icon;
                        const previous = items[index - 1];
                        const showSection = item.section && previous?.section !== item.section;

                        return <li key={item.to}>
                            {showSection ? (
                                <p className="px-3 pb-1 pt-4 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/80 first:pt-0">
                                    {item.section}
                                </p>
                            ) : null}
                            <NavLink
                                to={item.to}
                                end={item.end}
                                onClick={() => onOpenChange(false)}
                                className={({ isActive }) => cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                                    isActive
                                        ? 'bg-accent text-accent-foreground'
                                        : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
                                )}
                            >
                                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{item.label}</span>
                            </NavLink>
                        </li>;
                    })}
                </ul>
            </nav>
        </DialogContent>
    </Dialog>;
}
