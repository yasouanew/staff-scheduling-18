import { CalendarRange, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';


import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/Components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { NavItem } from './nav-items';

interface SidebarNavLinkProps {
    item: NavItem;
    collapsed: boolean;
}

function SidebarNavLink({ item, collapsed }: SidebarNavLinkProps): JSX.Element {
    const Icon = item.icon;
    const link = <NavLink
        to={item.to}
        end={item.end}
        className={({ isActive }) => cn(
            'group flex items-center rounded-lg text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
            collapsed ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2.5',
            isActive
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
        )}
    >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!collapsed ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
    </NavLink>;

    if (!collapsed) {
        return link;
    }

    return <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>;
}

interface SidebarProps {
    collapsed?: boolean;
    items: readonly NavItem[];
    className?: string;
    /**
     * Toggles the manual collapse state. When omitted (e.g. on tablet, where the
     * rail is enforced by the viewport) the toggle button is not rendered.
     */
    onToggleCollapse?: () => void;
}

/** Collapse/expand control rendered in the sidebar footer. */
function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }): JSX.Element {
    const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
    const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

    const button = <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        aria-expanded={!collapsed}
        className={cn(
            'inline-flex items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors',
            'hover:bg-secondary hover:text-secondary-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
            collapsed ? 'h-10 w-10 justify-center' : 'h-10 w-full gap-3 px-3',
        )}
    >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!collapsed ? <span className="truncate">Collapse</span> : <span className="sr-only">{label}</span>}
    </button>;

    if (!collapsed) {
        return button;
    }

    return <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>;
}

/** Permanent desktop sidebar that contracts to an accessible icon rail on tablets. */
export function Sidebar({ collapsed = false, items, className, onToggleCollapse }: SidebarProps): JSX.Element {

    return <TooltipProvider delayDuration={150}>
        <aside
            className={cn(
                'flex h-full flex-col border-r border-border bg-card shadow-sm transition-[width] duration-200',
                collapsed ? 'w-[72px]' : 'w-64',
                className,
            )}
            aria-label="Primary navigation"
        >
            <div className={cn('flex h-16 shrink-0 items-center border-b border-border', collapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                    <CalendarRange className="h-5 w-5" aria-hidden="true" />
                </span>
                {!collapsed ? <span className="truncate text-base font-semibold tracking-tight text-foreground">Rosterly</span> : null}
            </div>
            <nav className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
                <ul className="space-y-1">
                    {items.map((item) => <li key={item.to} className={collapsed ? 'flex justify-center' : undefined}>
                        <SidebarNavLink item={item} collapsed={collapsed} />
                    </li>)}
                </ul>
            </nav>
            <div className={cn('shrink-0 border-t border-border', collapsed ? 'flex justify-center px-2 py-3' : 'space-y-2 px-4 py-3')}>
                {onToggleCollapse ? <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} /> : null}
                {!collapsed ? <p className="text-xs text-muted-foreground">Staff scheduling, simplified.</p> : null}
            </div>
        </aside>

    </TooltipProvider>;
}
