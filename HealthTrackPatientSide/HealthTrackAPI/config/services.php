<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'supabase' => [
        'url' => env('SUPABASE_URL'),
        'anon_key' => env('SUPABASE_ANON_KEY'),
        'service_role_key' => env('SUPABASE_SERVICE_ROLE_KEY'),
        'jwt_secret' => env('SUPABASE_JWT_SECRET'),
    ],

    'apps' => [
        'staff_url' => env('STAFF_APP_URL', 'http://localhost:5173'),
        'patient_url' => env('PATIENT_APP_URL', 'http://localhost:5174'),
    ],

    'gemini' => [
        'key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-2.5-flash'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
        'from' => env('RESEND_FROM', 'HealthTrack RHU <onboarding@resend.dev>'),
    ],

    'semaphore' => [
        'key' => env('SEMAPHORE_API_KEY'),
        'sender' => env('SEMAPHORE_SENDER', 'HealthTrack'),
        'required' => filter_var(env('SMS_REQUIRED', false), FILTER_VALIDATE_BOOLEAN),
    ],

    'accounts' => [
        'manager_name' => env('ACCOUNT_MANAGER_NAME', 'Alma Divinagracia'),
        'manager_email' => env('ACCOUNT_MANAGER_EMAIL', ''),
    ],

];
