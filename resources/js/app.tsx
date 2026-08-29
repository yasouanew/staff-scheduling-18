import '../css/app.css';
import './bootstrap';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureEcho } from '@laravel/echo-react';
import { Toaster } from 'sonner';

import { ErrorBoundary } from './Components/common/ErrorBoundary';
import { ThemeProvider } from './Components/ui/theme-provider';
import { AppRoutes } from './routes/AppRoutes';

/**
 * Application entry point.
 *
 * Boots the React Router single-page application and mounts the global
 * providers every feature depends on:
 *  - TanStack Query   → server-state cache for all `use*` data hooks.
 *  - BrowserRouter    → client-side routing for the whole page tree.
 *  - Sonner Toaster   → global toast notifications (also used by the Axios
 *                        error interceptor).
 *  - Laravel Echo     → realtime broadcasting over the Reverb websocket.
 */

/*
 * Echo is optional infrastructure. Configuring the Reverb broadcaster without a
 * key makes the underlying Pusher client throw ("You must pass your app key")
 * the moment a component subscribes to a channel, which would unmount the whole
 * React tree and render a blank page. Only configure it when credentials exist;
 * `echoIsConfigured()` then keeps realtime listeners dormant without them.
 */
const reverbAppKey = import.meta.env.VITE_REVERB_APP_KEY;

if (typeof reverbAppKey === 'string' && reverbAppKey.length > 0) {
    configureEcho({
        broadcaster: 'reverb',
    });
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
        },
    },
});

const container = document.getElementById('app');

if (container) {
    createRoot(container).render(
        <StrictMode>
            <ThemeProvider>
                <QueryClientProvider client={queryClient}>
                    {/*
                     * Top-level safety net: a render error anywhere in the route
                     * tree now degrades to a recoverable error state instead of
                     * unmounting the root and leaving an empty white page.
                     */}
                    <ErrorBoundary
                        title="This page could not be displayed"
                        description="An unexpected error interrupted the app. Retry, or reload the page if the problem persists."
                    >
                        <BrowserRouter>
                            <AppRoutes />
                        </BrowserRouter>
                    </ErrorBoundary>
                    <Toaster position="top-right" richColors closeButton />
                </QueryClientProvider>
            </ThemeProvider>
        </StrictMode>,
    );
}
