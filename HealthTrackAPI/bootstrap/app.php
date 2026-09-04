<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\ConfigurePortalSessionCookie;
use App\Http\Middleware\SecurityHeaders;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(SecurityHeaders::class);

        // Same portal session cookie for /sanctum/csrf-cookie (web) and /api/* —
        // otherwise XSRF token is issued for laravel_session but login uses ht_*_session.
        $middleware->web(prepend: [
            ConfigurePortalSessionCookie::class,
        ]);

        $middleware->api(prepend: [
            ConfigurePortalSessionCookie::class,
            EnsureFrontendRequestsAreStateful::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(function ($request, $e) {
            return $request->is('api/*') || $request->expectsJson();
        });
    })->create();
