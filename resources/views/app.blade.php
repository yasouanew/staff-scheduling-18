<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="h-full">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title>{{ config('app.name', 'ShiftFlow') }}</title>

        {{--
            Applies the persisted (or system) colour scheme before the first
            paint. Without this blocking script the document renders in light
            mode and visibly flips once React hydrates the ThemeProvider.
            Keep the storage key in sync with resources/js/Components/ui/theme-provider.tsx.
        --}}
        <script>
            (function () {
                try {
                    var stored = window.localStorage.getItem('rosterly.theme');
                    var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
                    var resolved = theme === 'system'
                        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                        : theme;

                    document.documentElement.classList.add(resolved);
                    document.documentElement.style.colorScheme = resolved;
                } catch (error) {
                    document.documentElement.classList.add('light');
                }
            })();
        </script>

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700&display=swap" rel="stylesheet" />

        <!-- Scripts / Styles (React SPA entry) -->
        @viteReactRefresh
        @vite(['resources/js/app.tsx'])
    </head>
    <body class="h-full font-sans antialiased">
        <div id="app" class="min-h-full"></div>
    </body>
</html>
