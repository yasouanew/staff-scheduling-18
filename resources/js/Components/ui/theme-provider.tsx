import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = Exclude<Theme, 'system'>;

interface ThemeProviderProps {
    children: ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
}

interface ThemeContextValue {
    theme: Theme;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const DEFAULT_STORAGE_KEY = 'rosterly.theme';

function getSystemTheme(): ResolvedTheme {
    if (typeof window === 'undefined') {
        return 'light';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): ResolvedTheme {
    return theme === 'system' ? getSystemTheme() : theme;
}

function readStoredTheme(storageKey: string, fallback: Theme): Theme {
    if (typeof window === 'undefined') {
        return fallback;
    }

    const stored = window.localStorage.getItem(storageKey);

    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : fallback;
}

export function ThemeProvider({
    children,
    defaultTheme = 'system',
    storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps): JSX.Element {
    const [theme, setThemeState] = useState<Theme>(() => readStoredTheme(storageKey, defaultTheme));
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

    useEffect(() => {
        const root = window.document.documentElement;
        const nextResolvedTheme = resolveTheme(theme);

        root.classList.remove('light', 'dark');
        root.classList.add(nextResolvedTheme);
        root.style.colorScheme = nextResolvedTheme;
        setResolvedTheme(nextResolvedTheme);
        window.localStorage.setItem(storageKey, theme);
    }, [storageKey, theme]);

    useEffect(() => {
        if (theme !== 'system') {
            return undefined;
        }

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (): void => setResolvedTheme(getSystemTheme());

        mediaQuery.addEventListener('change', handleChange);

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    const value = useMemo<ThemeContextValue>(() => ({
        theme,
        resolvedTheme,
        setTheme: setThemeState,
    }), [resolvedTheme, theme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
    const context = useContext(ThemeContext);

    if (! context) {
        throw new Error('useTheme must be used within ThemeProvider.');
    }

    return context;
}
