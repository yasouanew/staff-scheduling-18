<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Web Invitation Link Lifetime
    |--------------------------------------------------------------------------
    |
    | How long (in minutes) the "set your password" link emailed to company
    | admins and schedulers stays valid. Defaults to 48 hours, which comfortably
    | covers a weekend without leaving a usable link lying in an inbox for
    | weeks. Expired invitations can always be re-sent from the team page.
    |
    */

    'web_expires_in_minutes' => (int) env('INVITATION_WEB_EXPIRES_IN_MINUTES', 2880),

    /*
    |--------------------------------------------------------------------------
    | Mobile Verification Code
    |--------------------------------------------------------------------------
    |
    | Settings for the one-time code the mobile app requests after an employee
    | enters their email address. `max_attempts` caps how many wrong guesses a
    | single code tolerates before it must be re-requested, which is what stops
    | a six-digit code from being brute forced.
    |
    */

    'code_length' => (int) env('INVITATION_CODE_LENGTH', 6),

    'code_expires_in_minutes' => (int) env('INVITATION_CODE_EXPIRES_IN_MINUTES', 15),

    'code_max_attempts' => (int) env('INVITATION_CODE_MAX_ATTEMPTS', 5),

    /*
    |--------------------------------------------------------------------------
    | Password Setup Window
    |--------------------------------------------------------------------------
    |
    | After a code is verified the app receives a short-lived setup token that
    | authorises exactly one "choose your password" call. Keeping this window
    | tight means a verified code cannot be parked and replayed later.
    |
    */

    'setup_token_expires_in_minutes' => (int) env('INVITATION_SETUP_TOKEN_EXPIRES_IN_MINUTES', 30),

    /*
    |--------------------------------------------------------------------------
    | Mobile App Store Links
    |--------------------------------------------------------------------------
    |
    | Used by the public "download the app" landing page the employee invitation
    | email points at. Left empty until the apps are published; the page then
    | renders a "coming soon" note instead of a dead link.
    |
    */

    'ios_app_url' => env('MOBILE_IOS_APP_URL', ''),

    'android_app_url' => env('MOBILE_ANDROID_APP_URL', ''),

];
