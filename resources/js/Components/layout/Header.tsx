import { CircleUserRound, CreditCard, LogOut, Menu, Settings } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Badge,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    ThemeToggle,
} from '@/Components/ui';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { Breadcrumbs } from './Breadcrumbs';

export interface HeaderUser {
    name: string;
    email: string;
    avatarUrl?: string;
    companyId?: string;
    trialEndsAt?: string | null;
    /** Web role used to gate billing-sensitive UI such as the trial badge (§19). */
    role?: 'super_admin' | 'company_admin' | 'scheduler' | 'employee';
}

interface HeaderProps {
    user: HeaderUser;
    unreadCount?: number;
    onMenuClick: () => void;
    onSignOut?: () => void;
}

function getInitials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
}

/** Sticky shell header for breadcrumbs, trial status, notifications, theme, and profile actions. */
export function Header({ user, onMenuClick, onSignOut }: HeaderProps): JSX.Element {
    const trialDaysRemaining = useMemo(() => {
        // The trial badge is billing-sensitive UI: only company admins see it (§19).
        // Schedulers and employees never get subscription/trial affordances.
        if (user.role !== 'company_admin' || !user.trialEndsAt) {
            return null;
        }

        const millisecondsRemaining = new Date(user.trialEndsAt).getTime() - Date.now();

        return millisecondsRemaining > 0 ? Math.ceil(millisecondsRemaining / 86_400_000) : null;
    }, [user.role, user.trialEndsAt]);

    return <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:gap-3 sm:px-6">
        <Button variant="ghost" size="icon" onClick={onMenuClick} className="md:hidden" aria-label="Open navigation menu">
            <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
        <Breadcrumbs />
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {trialDaysRemaining !== null && user.companyId ? <Link to="/subscription" className="hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:block">
                <Badge variant="primary" className="h-8 px-3 transition-colors hover:bg-primary/15">
                    <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                    {trialDaysRemaining} {trialDaysRemaining === 1 ? 'day' : 'days'} left
                </Badge>
            </Link> : null}
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-10 gap-2 px-1.5 pr-2" aria-label="Open user menu">
                        <Avatar className="h-8 w-8">
                            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
                            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                        </Avatar>
                        <span className="hidden min-w-0 flex-col text-left lg:flex">
                            <span className="max-w-36 truncate text-sm font-medium text-foreground">{user.name}</span>
                            <span className="max-w-36 truncate text-xs font-normal text-muted-foreground">{user.email}</span>
                        </span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel className="space-y-1 py-2">
                        <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                        <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                        <Link to="/profile"><CircleUserRound className="h-4 w-4" aria-hidden="true" />Profile</Link>
                    </DropdownMenuItem>
                    {user.role === 'company_admin' ? (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link to="/settings"><Settings className="h-4 w-4" aria-hidden="true" />Settings</Link>
                            </DropdownMenuItem>
                        </>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onSignOut} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                        <LogOut className="h-4 w-4" aria-hidden="true" />Sign out
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    </header>;
}
