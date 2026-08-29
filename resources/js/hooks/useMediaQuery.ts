import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 * SSR-safe: defaults to `false` until the browser environment is available.
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState<boolean>(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const mediaQueryList = window.matchMedia(query);
        const handleChange = (event: MediaQueryListEvent): void => {
            setMatches(event.matches);
        };

        setMatches(mediaQueryList.matches);
        mediaQueryList.addEventListener('change', handleChange);

        return () => {
            mediaQueryList.removeEventListener('change', handleChange);
        };
    }, [query]);

    return matches;
}
