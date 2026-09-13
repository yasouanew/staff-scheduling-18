import { defineConfig, loadEnv } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
        plugins: [
            laravel({
                input: 'resources/js/app.tsx',
                refresh: true,
            }),
            react(),
            tailwindcss(),
        ],
        server: {
            // Bind to the loopback interface so the URL written into `public/hot`
            // (and therefore the @viteReactRefresh directive in app.blade.php) is a
            // connectable address. Using `0.0.0.0` here makes Laravel emit
            // `http://0.0.0.0:5173/...`, which browsers cannot connect to — the ES
            // module graph fails and React never mounts, leaving a blank page.
            // If LAN access from a phone is needed, set VITE_HMR_HOST (and open the
            // firewall) rather than binding the client-facing URL to 0.0.0.0.
            host: '127.0.0.1',
            port: 5173,
            strictPort: true,
            // Allow any host header (tunnels / LAN IPs) when serving assets.
            cors: true,
            hmr: {
                // Let the browser derive the HMR host from the page URL instead of
                // hardcoding localhost, which would break WebSocket connections when
                // the app is opened via a LAN IP. Override with VITE_HMR_HOST when
                // the LAN address cannot be inferred from the request.
                host: env.VITE_HMR_HOST || undefined,
            },
        },
    };
});
