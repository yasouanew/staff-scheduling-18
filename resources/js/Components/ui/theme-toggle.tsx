import { Check, Laptop, Moon, Sun } from 'lucide-react';

import { Button } from './button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './dropdown-menu';
import { type Theme, useTheme } from './theme-provider';

const themeOptions: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Laptop },
];

export function ThemeToggle(): JSX.Element {
    const { theme, resolvedTheme, setTheme } = useTheme();
    const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

    return <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Change colour theme">
                <CurrentIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel>Colour theme</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {themeOptions.map(({ value, label, icon: Icon }) => <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
                {theme === value ? <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" /> : null}
            </DropdownMenuItem>)}
        </DropdownMenuContent>
    </DropdownMenu>;
}
