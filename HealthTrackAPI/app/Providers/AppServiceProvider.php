<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by($request->ip());
        });

        RateLimiter::for('login', function (Request $request) {
            // Align with SPA lockout: 3 attempts / 30 seconds per email+IP.
            return Limit::perSecond(3, 30)
                ->by(strtolower((string) $request->input('email', '')).'|'.$request->ip())
                ->response(function () {
                    return response()->json([
                        'ok' => false,
                        'error' => 'Too many failed attempts. Please wait 30 seconds and try again.',
                    ], 429);
                });
        });

        RateLimiter::for('verification-send', function (Request $request) {
            $email = (string) $request->input('email', '');

            return Limit::perMinute(5)->by($request->ip().'|'.$email);
        });

        RateLimiter::for('password-reset', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));

            return Limit::perMinute(5)->by($request->ip().'|'.$email);
        });

        RateLimiter::for('verification-verify', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip().'|'.(string) $request->input('user_id', ''));
        });

        RateLimiter::for('heatmap', function (Request $request) {
            return Limit::perMinute(60)->by($request->ip());
        });

        RateLimiter::for('ai', function (Request $request) {
            return Limit::perMinute(20)->by($request->ip());
        });

        RateLimiter::for('notify', function (Request $request) {
            return Limit::perMinute(30)->by($request->ip());
        });
    }
}
