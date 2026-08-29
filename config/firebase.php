<?php

/*
|--------------------------------------------------------------------------
| Firebase configuration (kreait/laravel-firebase)
|--------------------------------------------------------------------------
|
| Used for sending FCM push notifications to the mobile app. The service
| account credentials JSON is provided via FIREBASE_CREDENTIALS. When no
| credentials are configured (e.g. in the test environment) push sending
| is skipped gracefully by the FcmChannel.
|
*/

return [
    'default' => env('FIREBASE_PROJECT', 'app'),

    'projects' => [
        'app' => [

            /*
             * Path to the Google service account JSON file, relative to the
             * project base path, or an absolute path.
             */
            'credentials' => env('FIREBASE_CREDENTIALS'),

            'auth' => [
                'tenant_id' => env('FIREBASE_AUTH_TENANT_ID'),
            ],

            'firestore' => [
                'database' => env('FIREBASE_FIRESTORE_DATABASE'),
            ],

            'database' => [
                'url' => env('FIREBASE_DATABASE_URL'),
            ],

            'dynamic_links' => [
                'default_domain' => env('FIREBASE_DYNAMIC_LINKS_DEFAULT_DOMAIN'),
            ],

            'storage' => [
                'default_bucket' => env('FIREBASE_STORAGE_DEFAULT_BUCKET'),
            ],

            'cache_store' => env('FIREBASE_CACHE_STORE', 'file'),

            'logging' => [
                'http_log_channel' => env('FIREBASE_HTTP_LOG_CHANNEL'),
                'http_debug_log_channel' => env('FIREBASE_HTTP_DEBUG_LOG_CHANNEL'),
            ],

            'http_client_options' => [
                'proxy' => env('FIREBASE_HTTP_CLIENT_PROXY'),
                'timeout' => env('FIREBASE_HTTP_CLIENT_TIMEOUT'),
            ],
        ],
    ],
];
